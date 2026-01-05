"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// --- CONSTANTES & HELPERS ---
const POSTES = ['salarié', 'cadre', 'alternant', 'stagiaire', 'mi-temps', 'admin', 'RH'];
const STATUTS = ['au travail', 'en congés', 'malade'];
// Liste Heures
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));

function formatHeures(decimal: number | string): string { const val = typeof decimal === 'string' ? parseFloat(decimal) : decimal; if (isNaN(val) || val === 0) return "0h"; const heures = Math.floor(Math.abs(val)); const minutes = Math.round((Math.abs(val) - heures) * 60); const signe = val < 0 ? "-" : ""; const minStr = minutes > 0 ? minutes.toString().padStart(2, '0') : ""; if (minutes === 0) return `${signe}${heures}h`; return `${signe}${heures}h${minStr}`; }
function formatJours(decimal: number | string): string { const val = typeof decimal === 'string' ? parseFloat(decimal) : decimal; if (isNaN(val)) return "0"; return Number(val).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }
function formatDateTime(dateStr: string) { if (!dateStr) return "-"; const d = new Date(dateStr); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')} à ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; }
function getHistoryLabel(type: string) { switch(type) { case 'conge': return 'Ajustement Manuel'; case 'hsup': return 'Heures Supp. (Calculé)'; case 'conge_accepte': return 'Congés Accepté'; case 'hsup_accepte': return 'Heures Accepté'; default: return type; } }

export default function UserSettingPage() {
  const router = useRouter();
  const [users, setUsers] = useState<any[]>([]);
  const [filtered, setFiltered] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  
  const [formData, setFormData] = useState<any>({});
  
  // ✅ États temporaires pour Date/Heure
  const [dateOnly, setDateOnly] = useState<string>("");
  const [hourOnly, setHourOnly] = useState<string>("09");

  const [photoFile, setPhotoFile] = useState<File|null>(null);
  const [targetUser, setTargetUser] = useState<any>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyLogs, setHistoryLogs] = useState<any[]>([]);

  useEffect(() => { const f=async()=>{const u=await fetch("/api/user-setting");const ud=await u.json();const p=await fetch("/api/profil");const pd=await p.json();if(ud.success){setUsers(ud.users);setFiltered(ud.users);}if(pd.user)setCurrentUser(pd.user);};f();}, []);
  useEffect(() => { setFiltered(users.filter(u => u.nom.toLowerCase().includes(search.toLowerCase()) || u.mail.toLowerCase().includes(search.toLowerCase()))) }, [search, users]);

  const openModal = (mode: 'add' | 'edit', user: any = {}) => { 
      setModalMode(mode); 
      setTargetUser(user); 
      setPhotoFile(null); 
      // Reset Date/Heure
      setDateOnly("");
      setHourOnly("09");

      if (mode === 'add') {
          setFormData({ 
              nom:"", prenom:"", mail:"", poste:"salarié", statut:'au travail', mdp:"", 
              solde_conge: 0, solde_hsup: 0, date_entree: new Date().toISOString().split('T')[0],
              motif: ""
          });
      } else {
          const dateEntree = user.date_entree ? new Date(user.date_entree).toISOString().split('T')[0] : "";
          setFormData({ ...user, mdp:"", date_entree: dateEntree, motif: "" }); 
      }
      setIsModalOpen(true); 
  };

  const handleDelete = async (id: number) => { if (currentUser?.id_user === id || !confirm("Êtes-vous sûr de vouloir supprimer cet utilisateur ?")) return; if ((await fetch(`/api/user-setting/${id}`, { method: "DELETE" })).ok) { const u=await fetch("/api/user-setting");const ud=await u.json();setUsers(ud.users);setFiltered(ud.users); } };

  const handleSubmit = async (e: React.FormEvent) => { 
      e.preventDefault(); 
      const data = new FormData(); 
      
      // Reconstruction de la date complète si nécessaire
      let finalDateTime = "";
      if (dateOnly) {
          finalDateTime = `${dateOnly}T${hourOnly}:00`;
      }

      Object.keys(formData).forEach(k => { data.append(k, formData[k]); }); 
      if (finalDateTime) data.append("date_action", finalDateTime); // Ajout date complète

      if (photoFile) data.append("photo", photoFile); 
      
      const url = modalMode==='add' ? "/api/user-setting" : `/api/user-setting/${targetUser.id_user}`; 
      const res = await fetch(url, { method: modalMode==='add'?"POST":"PATCH", body: data }); 
      const json = await res.json(); 
      
      if (json.success) { 
          if(json.logout) router.push("/"); 
          else { setIsModalOpen(false); const u=await fetch("/api/user-setting"); const ud=await u.json(); setUsers(ud.users); setFiltered(ud.users); } 
      } else { alert(json.error || "Erreur"); } 
  };

  const openHistory = async (user: any) => { setTargetUser(user); setIsHistoryOpen(true); const res = await fetch(`/api/solde-history?userId=${user.id_user}`); const data = await res.json(); setHistoryLogs(data.success ? data.history : []); };
  const getStatutBadge = (statut: string) => { switch(statut) { case 'au travail': return <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-bold uppercase">Au travail</span>; case 'en congés': return <span className="bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-xs font-bold uppercase">En Congés</span>; case 'malade': return <span className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-xs font-bold uppercase">Malade</span>; default: return <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-xs font-bold uppercase">Inconnu</span>; } };

  const hasHsupChanged = modalMode === 'edit' && targetUser && parseFloat(formData.solde_hsup) !== parseFloat(targetUser.solde_hsup);
  const diffHsup = hasHsupChanged ? parseFloat(formData.solde_hsup) - parseFloat(targetUser.solde_hsup) : 0;

  return (
    <div className="min-h-screen px-4 sm:px-8 py-8 bg-[#f4f6fc] font-[poppins]">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-10 flex flex-col md:flex-row justify-between items-center gap-4">
        <div><h1 className="text-4xl font-[Modak] text-[#000091]">Utilisateurs</h1><p className="text-gray-400 font-medium ml-1">Gérez vos équipes et leurs soldes.</p></div>
        <div className="flex gap-3 w-full md:w-auto bg-white p-2 rounded-2xl shadow-sm border border-gray-100"><input placeholder="🔍 Rechercher..." value={search} onChange={e=>setSearch(e.target.value)} className="px-4 py-2 bg-transparent text-[#000091] outline-none flex-1 text-sm font-medium"/><button onClick={()=>openModal('add')} className="bg-[#000091] text-white px-6 py-2 rounded-xl font-bold shadow-md hover:bg-[#2a2ab3] transition whitespace-nowrap text-sm">+ Ajouter</button></div>
      </div>

      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filtered.map(u => (
            <div key={u.id_user} className="bg-white rounded-[2rem] p-6 shadow-sm hover:shadow-xl transition-all duration-300 border border-gray-100 group relative">
                <div className="flex items-center gap-4 mb-4"><img src={u.photo||'/uploads/default.jpeg'} className="w-16 h-16 rounded-2xl object-cover shadow-md bg-gray-50 border-2 border-white"/><div><div className="font-[Modak] text-xl text-[#000091] leading-none">{u.prenom} {u.nom}</div><div className="text-xs text-gray-400 font-bold uppercase mt-1">{u.poste}</div></div></div>
                <div className="mb-4 flex justify-between items-center bg-gray-50 px-3 py-2 rounded-xl"><span className="text-xs font-bold text-[#000091] uppercase">Statut</span>{getStatutBadge(u.statut)}</div>
                <div className="flex gap-2 mb-6">
                    <div className="flex-1 bg-[#f4f6fc] rounded-xl p-3 text-center border border-blue-50"><div className="text-[10px] font-bold text-gray-400 uppercase">Congés</div><div className="text-xl font-[Modak] text-[#000091]">{formatJours(u.solde_conge)}</div></div>
                    <div className="flex-1 bg-[#fff5eb] rounded-xl p-3 text-center border border-orange-50"><div className="text-[10px] font-bold text-gray-400 uppercase">Récup</div><div className="text-xl font-[Modak] text-[#ff6400]">{formatHeures(u.solde_hsup)}</div></div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <button onClick={()=>openModal('edit', u)} className="bg-[#000091] text-white py-3 rounded-xl font-bold text-xs hover:bg-[#2a2ab3] transition shadow-md shadow-blue-100">Modifier</button>
                    <button onClick={()=>openHistory(u)} className="bg-gray-100 text-[#000091] rounded-xl hover:bg-gray-200 transition font-bold text-xs">Historique</button>
                    {currentUser?.id_user !== u.id_user && <button onClick={()=>handleDelete(u.id_user)} className="col-span-2 mt-1 bg-red-50 text-red-500 py-3 rounded-xl font-bold text-xs hover:bg-red-500 hover:text-white transition flex items-center justify-center gap-2 border border-red-100 hover:border-red-500"><span>🗑️</span> Supprimer l'utilisateur</button>}
                </div>
            </div>
        ))}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-[#000091]/20 z-50 flex items-center justify-center p-4 backdrop-blur-md">
            <div className="bg-white rounded-[2.5rem] p-8 w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl border-4 border-white relative">
                <button onClick={()=>setIsModalOpen(false)} className="absolute top-6 right-6 text-gray-400 hover:text-black text-xl">✕</button>
                <h2 className="text-3xl font-[Modak] text-[#000091] mb-8 text-center">{modalMode==='add'?"Nouvel Utilisateur":"Édition Profil"}</h2>
                
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1"><label className="text-xs font-bold text-[#000091] uppercase ml-2">Nom *</label><input required value={formData.nom} onChange={e=>setFormData({...formData,nom:e.target.value})} className="w-full p-3 bg-[#f8f9fc] text-[#000091] rounded-xl outline-none focus:ring-2 focus:ring-[#000091] font-bold"/></div>
                        <div className="space-y-1"><label className="text-xs font-bold text-[#000091] uppercase ml-2">Prénom *</label><input required value={formData.prenom} onChange={e=>setFormData({...formData,prenom:e.target.value})} className="w-full p-3 bg-[#f8f9fc] text-[#000091] rounded-xl outline-none focus:ring-2 focus:ring-[#000091] font-bold"/></div>
                    </div>
                    <div className="space-y-1"><label className="text-xs font-bold text-[#000091] uppercase ml-2">Email *</label><input required type="email" value={formData.mail} onChange={e=>setFormData({...formData,mail:e.target.value})} className="w-full p-3 bg-[#f8f9fc] text-[#000091] rounded-xl outline-none focus:ring-2 focus:ring-[#000091] font-bold"/></div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1"><label className="text-xs font-bold text-[#000091] uppercase ml-2">Poste *</label><select required value={formData.poste} onChange={e=>setFormData({...formData,poste:e.target.value})} className="w-full p-3 bg-[#f8f9fc] text-[#000091] rounded-xl outline-none focus:ring-2 focus:ring-[#000091] font-bold">{POSTES.map(p=><option key={p} value={p}>{p}</option>)}</select></div>
                        <div className="space-y-1"><label className="text-xs font-bold text-[#ff6400] uppercase ml-2">Statut *</label><select required value={formData.statut} onChange={e=>setFormData({...formData,statut:e.target.value})} className="w-full p-3 bg-orange-50 text-orange-700 rounded-xl outline-none focus:ring-2 focus:ring-[#ff6400] font-bold">{STATUTS.map(s=><option key={s} value={s}>{s}</option>)}</select></div>
                    </div>
                    <div className="space-y-1"><label className="text-xs font-bold text-[#000091] uppercase ml-2">Date d'entrée *</label><input required type="date" value={formData.date_entree} onChange={e=>setFormData({...formData,date_entree:e.target.value})} className="w-full p-3 bg-[#f8f9fc] text-[#000091] rounded-xl outline-none focus:ring-2 focus:ring-[#000091] font-bold"/></div>
                    
                    <div className="mt-8 pt-6 border-t border-gray-100">
                        <p className="text-center text-sm font-[Modak] text-[#000091] uppercase tracking-wide mb-4">Gestion des Soldes</p>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1"><label className="text-xs font-bold text-[#000091] uppercase ml-2">Solde Congés</label><input required type="number" step="0.5" value={formData.solde_conge} onChange={e=>setFormData({...formData, solde_conge: e.target.value})} className="w-full p-3 bg-white border-2 border-[#000091] text-[#000091] rounded-xl outline-none focus:scale-105 transition text-center font-[Modak] text-lg"/></div>
                            <div className="space-y-1"><label className="text-xs font-bold text-[#ff6400] uppercase ml-2">Solde Récup</label><input required type="number" step="0.25" value={formData.solde_hsup} onChange={e=>setFormData({...formData, solde_hsup: e.target.value})} className="w-full p-3 bg-white border-2 border-[#ff6400] text-[#ff6400] rounded-xl outline-none focus:scale-105 transition text-center font-[Modak] text-lg"/></div>
                        </div>

                        {hasHsupChanged && (
                            <div className="mt-4 animate-fadeIn bg-red-50 p-4 rounded-xl border border-red-100">
                                <p className="text-center text-red-600 font-bold text-xs mb-3">⚠️ Modification H.Sup détectée : {formatHeures(diffHsup)}</p>
                                <div className="space-y-3">
                                    {/* ✅ SÉLECTION DATE ET HEURE SÉPARÉE */}
                                    <div className="flex gap-2">
                                         <div className="flex-1">
                                            <label className="text-[10px] font-bold text-red-500 uppercase ml-2 mb-1 block">Date *</label>
                                            <input type="date" value={dateOnly} onChange={e=>setDateOnly(e.target.value)} className="w-full p-3 bg-white border-2 border-red-200 text-red-700 rounded-xl outline-none font-bold"/>
                                         </div>
                                         <div className="w-24">
                                            <label className="text-[10px] font-bold text-red-500 uppercase ml-2 mb-1 block">Heure *</label>
                                            <select value={hourOnly} onChange={e=>setHourOnly(e.target.value)} className="w-full p-3 bg-white border-2 border-red-200 text-red-700 rounded-xl outline-none font-bold">
                                                {HOURS.map(h => <option key={h} value={h}>{h}h</option>)}
                                            </select>
                                         </div>
                                    </div>
                                    <div><label className="text-[10px] font-bold text-red-500 uppercase ml-2 mb-1 block">Motif obligatoire *</label><input required placeholder="Ex: Rattrapage..." value={formData.motif} onChange={e=>setFormData({...formData, motif: e.target.value})} className="w-full p-3 bg-white border-2 border-red-200 text-red-700 rounded-xl outline-none font-bold placeholder-red-300"/></div>
                                </div>
                            </div>
                        )}
                    </div>
                    
                    <div className="pt-6 border-t border-gray-100">
                        <input type="password" placeholder={modalMode === 'add' ? "Mot de passe *" : "Nouveau mot de passe (optionnel)"} required={modalMode === 'add'} value={formData.mdp} onChange={e=>setFormData({...formData,mdp:e.target.value})} className="w-full p-3 bg-[#f8f9fc] text-[#000091] rounded-xl outline-none focus:ring-2 focus:ring-[#000091] mb-4 text-sm font-bold"/>
                        <input type="file" onChange={e=>setPhotoFile(e.target.files?.[0]||null)} className="text-xs text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:bg-[#e6e6ff] file:text-[#000091] file:border-0 file:font-bold"/>
                    </div>
                    <button type="submit" className="w-full py-4 bg-[#000091] text-white rounded-2xl font-bold text-lg shadow-xl hover:scale-[1.02] transition-all duration-300">Enregistrer</button>
                </form>
            </div>
        </div>
      )}
      
      {isHistoryOpen && (
        <div className="fixed inset-0 bg-[#000091]/20 z-50 flex items-center justify-center p-4 backdrop-blur-md">
            <div className="bg-white rounded-[2.5rem] p-8 w-full max-w-lg max-h-[80vh] overflow-y-auto shadow-2xl">
                <div className="flex justify-between items-center mb-6"><h2 className="text-2xl font-[Modak] text-[#000091]">Historique</h2><button onClick={()=>setIsHistoryOpen(false)} className="bg-gray-100 p-2 text-[#000091] rounded-full hover:bg-gray-200 transition">✕</button></div>
                {historyLogs.length===0?<p className="text-center text-[#000091]">Vide</p>:historyLogs.map(h=>(
                    <div key={h.id_historique} className="flex justify-between p-3 border-b border-gray-50 items-start">
                        <div className="flex flex-col">
                            <span className="text-xs font-bold text-[#000091] uppercase">{new Date(h.date_modif).toLocaleDateString()} par {h.actor_prenom}</span>
                            <span className="font-bold text-[#000091] text-sm">{getHistoryLabel(h.type_solde)}</span>
                            {h.type_solde === 'hsup' && h.date_action && (
                                <div className="mt-1 flex flex-col gap-1 text-gray-500">
                                    <span className="text-[10px] uppercase">Le : <b>{formatDateTime(h.date_action)}</b></span>
                                    <span className="text-[10px] uppercase">Réel : <b>{formatHeures(h.duree_reelle || 0)}</b></span>
                                </div>
                            )}
                            {h.motif && <span className="text-xs text-[#ff6400] font-bold italic mt-1 bg-orange-50 px-2 py-1 rounded-lg w-fit">📝 "{h.motif}"</span>}
                        </div>
                        <span className={`font-[Modak] text-lg ${h.valeur_modif>0?'text-green-500':'text-red-500'}`}>{h.valeur_modif>0?'+':''}{h.type_solde.includes('hsup')?formatHeures(h.valeur_modif):formatJours(h.valeur_modif)}</span>
                    </div>
                ))}
            </div>
        </div>
      )}
    </div>
  );
}