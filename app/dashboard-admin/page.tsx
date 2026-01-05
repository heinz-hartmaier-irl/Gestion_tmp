'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

// --- TYPES & HELPERS ---
interface User { id_user: number; solde_conge: number; solde_hsup: number; nom: string; prenom: string; photo: string; }
interface Demande { id_demande: number; type: string; date_demande: string; date_debut: string; date_fin: string; statut_demande: string; nom: string; prenom: string; photo: string; justificatif?: string; nature?: string; motif?: string; }
interface HistoryItem { id_historique: number; type_solde: string; valeur_modif: number; nouveau_solde: number; date_modif: string; actor_nom: string; actor_prenom: string; motif?: string; date_action?: string; duree_reelle?: number; }
type FiltersPayload = { types?: { type: string }[]; typesAll?: string[]; statuts?: { statut_demande: string }[]; noms?: { nom: string }[]; dates?: { date_demande: string }[]; };

// Liste des heures pour le selecteur (00 à 23)
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));

function formatDateTime(dateStr: string) { if (!dateStr) return "-"; const d = new Date(dateStr); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')} à ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; }
function formatDateSimple(dateStr: string) { const d = new Date(dateStr); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`; }
function formatHeures(decimal: number | string): string { const val = typeof decimal === 'string' ? parseFloat(decimal) : decimal; if (isNaN(val) || val === 0) return "0h"; const heures = Math.floor(Math.abs(val)); const minutes = Math.round((Math.abs(val) - heures) * 60); const signe = val < 0 ? "-" : ""; const minStr = minutes > 0 ? minutes.toString().padStart(2, '0') : ""; if (minutes === 0) return `${signe}${heures}h`; return `${signe}${heures}h${minStr}`; }
function formatJours(decimal: number | string): string { const val = typeof decimal === 'string' ? parseFloat(decimal) : decimal; if (isNaN(val)) return "0"; return Number(val).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }
function formatSoldeGlobal(jours: number, heures: number): string { const j = formatJours(jours); const h = formatHeures(heures); if ((jours === 0 || isNaN(jours)) && (heures === 0 || isNaN(heures))) return "0"; if (jours === 0) return h; if (heures === 0) return `${j} jours`; return `${j}j et ${h}`; }
function getHistoryLabel(type: string) { switch(type) { case 'conge': return 'Ajustement Manuel'; case 'hsup': return 'Heures Supp. (Calculé)'; case 'conge_accepte': return 'Congés Accepté'; case 'hsup_accepte': return 'Heures Accepté'; default: return type; } }

export default function DashboardAdminPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [demandes, setDemandes] = useState<Demande[]>([]);
  const [filters, setFilters] = useState<FiltersPayload>({});
  const [selectedFilters, setSelectedFilters] = useState({ type: '', statut: '', nom: '', date: '' });
  
  // Modale
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [targetType, setTargetType] = useState<'conge' | 'hsup'>('conge');
  const [variation, setVariation] = useState<string>(""); 
  const [motif, setMotif] = useState<string>(""); 
  
  // ✅ Nouveaux états séparés pour Date et Heure
  const [dateOnly, setDateOnly] = useState<string>(""); 
  const [hourOnly, setHourOnly] = useState<string>("09"); 

  // Historique
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyLogs, setHistoryLogs] = useState<HistoryItem[]>([]);

  useEffect(() => { const f=async()=>{const r=await fetch('/api/dashboard');const d=await r.json();if(r.ok){setUser(d.user);setDemandes(d.demandes);setFilters(d.filters);}};f();}, []);

  const handleUpdateSolde = async () => { 
      const val = parseFloat(variation.replace(',', '.')); 
      if (!user || isNaN(val) || val === 0) return; 

      let finalDateTime = undefined;

      // ✅ Reconstitution de la date complète
      if (targetType === 'hsup') {
          if (!motif || motif.trim() === '') { alert("Motif obligatoire."); return; }
          if (!dateOnly) { alert("La date est obligatoire."); return; }
          finalDateTime = `${dateOnly}T${hourOnly}:00`; // Ex: 2023-12-25T14:00
      }

      try { 
          const res = await fetch("/api/update-solde", { 
              method: "POST", 
              body: JSON.stringify({ 
                  targetUserId: user.id_user, 
                  type: targetType, 
                  variation: val, 
                  motif: targetType==='hsup' ? motif : undefined,
                  dateAction: finalDateTime 
              }) 
          }); 
          
          const data = await res.json(); 
          if (res.ok && data.success) { 
              alert(`Enregistré ! Crédit ajouté : ${data.added ? formatHeures(data.added) : 'Ok'}`);
              setIsModalOpen(false); 
              setVariation(""); setMotif(""); setDateOnly(""); setHourOnly("09");
              const r=await fetch('/api/dashboard');const d=await r.json();setUser(d.user); 
          } else { 
              alert(data.error || "Erreur"); 
          } 
      } catch (e) { alert("Erreur"); } 
  };

  const openHistory = async () => { if (!user) return; setIsHistoryOpen(true); const res = await fetch(`/api/solde-history?userId=${user.id_user}`); const data = await res.json(); setHistoryLogs(data.success ? data.history : []); };
  const handleDecision = async (id: number, decision: string) => { try { const res = await fetch("/api/update-demande", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id_demande: id, decision }), }); if (!res.ok) throw new Error(); setDemandes(prev => prev.map(d => d.id_demande === id ? { ...d, statut_demande: decision } : d)); } catch (e) { alert("Erreur"); } };
  const handleDownload = (id: number) => { const d = demandes.find(x => x.id_demande === id); if (!d?.justificatif) return alert("Aucun justificatif."); const link = document.createElement("a"); link.href = `${window.location.origin}${d.justificatif}`; link.download = d.justificatif.split("/").pop()!; document.body.appendChild(link); link.click(); document.body.removeChild(link); };

  const filteredDemandes = demandes.filter(d => { const matchesType = !selectedFilters.type || d.type.localeCompare(selectedFilters.type, 'fr', { sensitivity: 'accent' }) === 0; const matchesStatut = !selectedFilters.statut || d.statut_demande === selectedFilters.statut; const matchesNom = !selectedFilters.nom || d.nom === selectedFilters.nom; const matchesDate = !selectedFilters.date || (() => { const [m, y] = selectedFilters.date.split('/'); const d2 = new Date(d.date_debut); return String(d2.getMonth()+1).padStart(2,'0') === m && d2.getFullYear() === Number(y); })(); return matchesType && matchesStatut && matchesNom && matchesDate; });

  const getStatusBadge = (status: string) => { switch(status) { case 'Acceptée': return <span className="flex items-center gap-1 bg-green-100 text-green-700 px-3 py-1.5 rounded-xl text-xs font-bold uppercase">✅ Validée</span>; case 'Refusée': return <span className="flex items-center gap-1 bg-red-100 text-red-600 px-3 py-1.5 rounded-xl text-xs font-bold uppercase">❌ Refusée</span>; default: return <span className="flex items-center gap-1 bg-yellow-100 text-yellow-700 px-3 py-1.5 rounded-xl text-xs font-bold uppercase">⏳ En Attente</span>; } };

  return (
    <div className="min-h-screen px-4 sm:px-8 py-8 bg-[#f4f6fc] font-[poppins]">
      <div className="max-w-7xl mx-auto mb-10">
          <h1 className="text-5xl font-[Modak] text-[#000091] mb-2">Admin Dashboard</h1>
          <p className="text-gray-400 font-medium">Gérez vos équipes et validez les demandes.</p>
      </div>

      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-4 gap-8">
         <div className="lg:col-span-1 bg-white rounded-[2.5rem] p-6 shadow-xl border border-gray-100 flex flex-col justify-between h-fit relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#000091] opacity-5 rounded-full -translate-y-1/2 translate-x-1/2"></div>
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Mon Compteur Perso</h2>
            <div className="text-4xl font-[Modak] text-[#000091] mb-2">{user ? formatSoldeGlobal(user.solde_conge, user.solde_hsup) : "..."}</div>
            <div className="flex gap-2 text-xs font-bold text-gray-500 mb-6">
                <span className="bg-blue-50 text-[#000091] px-2 py-1 rounded">Congés: {formatJours(user?.solde_conge || 0)}</span>
                <span className="bg-orange-50 text-[#ff6400] px-2 py-1 rounded">Récup: {formatHeures(user?.solde_hsup || 0)}</span>
            </div>
            <div className="flex gap-2">
                <button onClick={() => { setIsModalOpen(true); setMotif(""); setDateOnly(""); setHourOnly("09"); }} className="flex-1 bg-[#000091] text-white py-3 rounded-xl font-bold text-sm hover:bg-[#2a2ab3] transition">Ajuster</button>
                <button onClick={openHistory} className="bg-gray-100 text-[#000091] p-3 rounded-xl hover:bg-gray-200 transition">📜</button>
            </div>
         </div>

         <div className="lg:col-span-3">
            <div className="flex flex-wrap gap-3 mb-6 bg-white p-4 rounded-3xl shadow-sm border border-gray-100 items-center">
              <span className="text-xs font-bold text-[#000091] uppercase mr-2">Filtres :</span>
             {["type", "statut", "nom", "date"].map((f) => {
                type FilterKey = "type" | "statut" | "nom" | "date";
                const key = f as FilterKey;
                return (
                    <select
                    key={f}
                    className="bg-gray-50 hover:bg-gray-100 border-none text-gray-600 text-xs font-bold rounded-xl outline-none py-3 px-4 transition cursor-pointer"
                    value={selectedFilters[key] || ""}
                    onChange={(e) =>
                        setSelectedFilters({
                        ...selectedFilters,
                        [key]: e.target.value,
                        })
                    }
                    >
                    <option value="">{f.charAt(0).toUpperCase() + f.slice(1)}</option>

                    {key === "type" &&
                        (filters.typesAll ?? []).map((t: string) => (
                        <option key={t} value={t}>
                            {t}
                        </option>
                        ))}
                    {key === "statut" &&
                        filters.statuts?.map((s) => (
                        <option key={s.statut_demande} value={s.statut_demande}>
                            {s.statut_demande}
                        </option>
                        ))}
                    {key === "nom" &&
                        filters.noms?.map((n) => (
                        <option key={n.nom} value={n.nom}>
                            {n.nom}
                        </option>
                        ))}
                    {key === "date" &&
                        Array.from(
                        new Set(
                            filters.dates
                            ?.map(
                                (d) =>
                                `${String(new Date(d.date_demande).getMonth() + 1).padStart(
                                    2,
                                    "0"
                                )}/${new Date(d.date_demande).getFullYear()}`
                            )
                            || []
                        )
                        ).map((m) => (
                        <option key={m} value={m}>
                            {m}
                        </option>
                        ))}
                    </select>
                );
                })}
              {(selectedFilters.type || selectedFilters.statut || selectedFilters.nom || selectedFilters.date) && (
                  <button onClick={() => setSelectedFilters({ type: '', statut: '', nom: '', date: '' })} className="ml-auto text-xs text-red-400 font-bold hover:text-red-600 transition">Effacer ✕</button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-6">
              {filteredDemandes.map(d => {
                 const isSpec = d.type === 'Congé spécifique';
                 const isHSup = d.type === 'Heures Supplémentaire';
                 return (
                 <div key={d.id_demande} className="bg-white rounded-[2rem] p-6 shadow-sm hover:shadow-xl transition-all duration-300 border border-gray-100 flex flex-col h-full relative group">
                   <div className="flex items-center gap-4 mb-6">
                     <img src={d.photo || '/uploads/default.jpeg'} className="w-14 h-14 rounded-2xl object-cover shadow-md bg-gray-50" alt="avatar" />
                     <div>
                       <h3 className="font-[Modak] text-lg text-[#000091] leading-none">{d.prenom} {d.nom}</h3>
                       <p className="text-[10px] text-gray-400 font-bold uppercase mt-1">{formatDateSimple(d.date_demande)}</p>
                     </div>
                   </div>
                   <div className="flex-1 space-y-3 mb-6">
                      <span className="inline-block bg-[#f4f6fc] text-[#000091] px-3 py-1 rounded-lg text-xs font-bold border border-blue-100">{d.type}</span>
                      <div className="bg-gray-50 rounded-xl p-3 text-xs">
                          <div className="flex justify-between mb-1"><span className="text-gray-400">Du</span> <span className="font-bold text-gray-700">{formatDateTime(d.date_debut)}</span></div>
                          <div className="flex justify-between"><span className="text-gray-400">Au</span> <span className="font-bold text-gray-700">{formatDateTime(d.date_fin)}</span></div>
                      </div>
                      {isSpec && d.nature && <div className="text-xs text-[#ff6400] font-bold bg-orange-50 px-3 py-2 rounded-xl border border-orange-100">📌 {d.nature}</div>}
                      {isHSup && d.motif && <div className="text-xs text-gray-500 italic bg-gray-50 px-3 py-2 rounded-xl">💬 &quot;{d.motif}&quot;</div>}
                   </div>
                   <div className="mt-auto space-y-2">
                      <div className="flex justify-center mb-2">{getStatusBadge(d.statut_demande)}</div>
                      {d.justificatif && <button onClick={() => handleDownload(d.id_demande)} className="w-full py-3 bg-[#e6e6ff] text-[#000091] font-bold rounded-xl hover:bg-[#d0d0ff] text-xs transition">📎 Justificatif</button>}
                      {d.statut_demande === 'En Attente' ? (
                        <div className="flex gap-2">
                          <button onClick={() => handleDecision(d.id_demande, 'Acceptée')} className="flex-1 py-3 bg-[#000091] text-white font-bold rounded-xl hover:bg-[#2a2ab3] hover:shadow-lg transition text-xs">Accepter</button>
                          <button onClick={() => handleDecision(d.id_demande, 'Refusée')} className="flex-1 py-3 bg-white border-2 border-[#ff6400] text-[#ff6400] font-bold rounded-xl hover:bg-[#ff6400] hover:text-white transition text-xs">Refuser</button>
                        </div>
                      ) : ( <div className="w-full py-2 bg-gray-50 text-gray-400 font-bold rounded-xl text-xs text-center border border-gray-100">Demande clôturée</div> )}
                   </div>
                 </div>
               )})}
            </div>
         </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-[#000091]/20 z-50 flex items-center justify-center p-4 backdrop-blur-md">
            <div className="bg-white rounded-[2.5rem] p-8 w-full max-w-md shadow-2xl relative border-4 border-white">
                <button onClick={()=>setIsModalOpen(false)} className="absolute top-6 right-6 text-gray-400 hover:text-black text-xl">✕</button>
                <h3 className="text-3xl font-[Modak] text-[#000091] mb-6 text-center">Ajuster Mon Solde</h3>
                <div className="flex bg-[#f4f6fc] p-1.5 rounded-2xl mb-8">
                    <button onClick={() => setTargetType('conge')} className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all duration-300 ${targetType === 'conge' ? 'bg-white text-[#000091] shadow-md' : 'text-gray-400 hover:text-gray-600'}`}>Jours</button>
                    <button onClick={() => setTargetType('hsup')} className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all duration-300 ${targetType === 'hsup' ? 'bg-white text-[#ff6400] shadow-md' : 'text-gray-400 hover:text-gray-600'}`}>Heures</button>
                </div>
                
                <div className="relative mb-4">
                    <label className="text-xs font-bold text-gray-400 uppercase ml-2 mb-1 block">{targetType === 'conge' ? 'Variation (Jours)' : 'Durée réelle travaillée (Heures)'}</label>
                    <input type="number" step={targetType === 'conge' ? "0.5" : "0.25"} value={variation} onChange={e=>setVariation(e.target.value)} className={`w-full p-6 bg-white border-4 rounded-3xl text-center text-4xl font-[Modak] outline-none transition focus:scale-105 ${targetType==='conge'?'border-[#000091] text-[#000091]':'border-[#ff6400] text-[#ff6400]'}`} placeholder="0" autoFocus />
                    {targetType === 'hsup' && <p className="text-center text-[10px] text-gray-400 mt-1">Saisissez les heures réellement faites.<br/>La majoration sera calculée automatiquement.</p>}
                </div>

                {/* ✅ SÉLECTION DATE ET HEURE (H.SUP SEULEMENT) */}
                {targetType === 'hsup' && (
                    <div className="space-y-3 mb-6 animate-fadeIn">
                        <div className="flex gap-2">
                             <div className="flex-1">
                                <label className="text-xs font-bold text-red-500 uppercase ml-2 mb-1 block">Date</label>
                                <input type="date" value={dateOnly} onChange={e=>setDateOnly(e.target.value)} className="w-full p-3 bg-red-50 text-red-700 border-2 border-red-100 rounded-xl outline-none focus:border-red-500 font-bold"/>
                             </div>
                             <div className="w-24">
                                <label className="text-xs font-bold text-red-500 uppercase ml-2 mb-1 block">Heure Début</label>
                                <select value={hourOnly} onChange={e=>setHourOnly(e.target.value)} className="w-full p-3 bg-red-50 text-red-700 border-2 border-red-100 rounded-xl outline-none focus:border-red-500 font-bold">
                                    {HOURS.map(h => <option key={h} value={h}>{h}h</option>)}
                                </select>
                             </div>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-red-500 uppercase ml-2 mb-1 block">Motif obligatoire *</label>
                            <input type="text" value={motif} onChange={e=>setMotif(e.target.value)} placeholder="Ex: Rattrapage, Urgence..." className="w-full p-3 bg-red-50 text-red-700 border-2 border-red-100 rounded-xl outline-none focus:border-red-500 font-bold placeholder-red-300"/>
                        </div>
                    </div>
                )}
                <button onClick={handleUpdateSolde} className={`w-full py-4 text-white rounded-2xl font-bold text-lg shadow-xl hover:scale-[1.02] transition-all duration-300 ${targetType==='conge'?'bg-[#000091] shadow-blue-200':'bg-[#ff6400] shadow-orange-200'}`}>Calculer & Valider</button>
            </div>
        </div>
      )}
      
      {isHistoryOpen && (
        <div className="fixed inset-0 bg-[#000091]/20 z-50 flex items-center justify-center p-4 backdrop-blur-md">
            <div className="bg-white rounded-[2.5rem] p-8 w-full max-w-md max-h-[80vh] overflow-y-auto shadow-2xl border-4 border-white">
                <div className="flex justify-between items-center mb-6"><h2 className="text-2xl font-[Modak] text-[#000091]">Historique</h2><button onClick={()=>setIsHistoryOpen(false)} className="bg-gray-50 p-2 rounded-full hover:bg-gray-100 text-[#000091] transition">✕</button></div>
                {historyLogs.length===0 ? <p className="text-center text-gray-400">Vide</p> : (
                    <div className="space-y-4">
                        {historyLogs.map(h => {
                             const isPositive = h.valeur_modif > 0;
                             const isHsup = h.type_solde.includes('hsup');
                             return (
                                <div key={h.id_historique} className="bg-[#f8f9fc] p-4 rounded-2xl border border-transparent hover:border-gray-200 transition">
                                    <div className="flex justify-between items-start mb-2">
                                        <div>
                                            <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wide">{formatDateTime(h.date_modif)}</div>
                                            <div className="text-xs text-gray-500 font-medium mt-0.5">Par <span className="font-bold text-[#000091]">{h.actor_prenom} {h.actor_nom}</span></div>
                                            {h.type_solde === 'hsup' && h.date_action && (
                                                <div className="mt-1 flex flex-col gap-1">
                                                    <div className="text-xs text-gray-500">Activité le : <span className="font-bold">{formatDateTime(h.date_action)}</span></div>
                                                    <div className="text-xs text-gray-500">Durée réelle : <span className="font-bold">{formatHeures(h.duree_reelle || 0)}</span></div>
                                                </div>
                                            )}
                                            {h.motif && <div className="mt-1 text-xs text-[#ff6400] font-bold italic bg-orange-50 px-2 py-0.5 rounded-lg w-fit">📝 {h.motif}</div>}
                                        </div>
                                        <div className={`text-xl font-[Modak] ${isPositive ? 'text-green-500' : 'text-red-500'}`}>{isPositive ? '+' : ''}{isHsup ? formatHeures(h.valeur_modif) : formatJours(h.valeur_modif)}</div>
                                    </div>
                                </div>
                             )
                        })}
                    </div>
                )}
            </div>
        </div>
      )}
    </div>
  );
}