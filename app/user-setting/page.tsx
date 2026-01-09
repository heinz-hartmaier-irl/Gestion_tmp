"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// --- CONSTANTES & HELPERS ---
const POSTES = ['salarié', 'cadre', 'alternant', 'stagiaire', 'mi-temps', 'admin', 'RH'];
const STATUTS = ['au travail', 'en congés', 'malade'];
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));

function formatHeures(decimal: number | string): string {
  const val = typeof decimal === 'string' ? parseFloat(decimal) : decimal;
  if (isNaN(val) || val === 0) return "0h";
  const heures = Math.floor(Math.abs(val));
  const minutes = Math.round((Math.abs(val) - heures) * 60);
  const signe = val < 0 ? "-" : "";
  return minutes === 0 ? `${signe}${heures}h` : `${signe}${heures}h${minutes.toString().padStart(2,'0')}`;
}

function formatJours(decimal: number | string): string {
  const val = typeof decimal === 'string' ? parseFloat(decimal) : decimal;
  if (isNaN(val)) return "0";
  return Number(val).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function formatDateTime(dateStr: string) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')} à ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function getHistoryLabel(type: string) {
  switch(type) {
    case 'conge': return 'Ajustement Manuel';
    case 'hsup': return 'Heures Supp. (Calculé)';
    case 'conge_accepte': return 'Congés Accepté';
    case 'hsup_accepte': return 'Heures Accepté';
    default: return type;
  }
}

// --- TYPES ---
interface User {
  id_user: number;
  nom: string;
  prenom: string;
  mail: string;
  poste: string;
  statut: string;
  solde_conge: number;
  solde_hsup: number;
  date_entree: string;
  photo?: string;
}

interface HistoryLog {
  id_historique: number;
  date_modif: string;
  actor_prenom: string;
  type_solde: string;
  valeur_modif: number;
  duree_reelle?: number;
  date_action?: string;
  motif?: string;
}

export default function UserSettingPage() {
  const router = useRouter();

  // --- STATES ---
  const [users, setUsers] = useState<User[]>([]);
  const [filtered, setFiltered] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [search, setSearch] = useState("");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');

  const [formData, setFormData] = useState<Partial<User> & { mdp: string; motif: string }>({
    nom: "",
    prenom: "",
    mail: "",
    poste: "salarié",
    statut: "au travail",
    solde_conge: 0,
    solde_hsup: 0,
    date_entree: new Date().toISOString().split("T")[0],
    mdp: "",
    motif: ""
  });

  const [dateOnly, setDateOnly] = useState<string>("");
  const [hourOnly, setHourOnly] = useState<string>("09");

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [targetUser, setTargetUser] = useState<User | null>(null);

  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyLogs, setHistoryLogs] = useState<HistoryLog[]>([]);

  // --- FETCH INITIAL DATA ---
  useEffect(() => {
    const fetchData = async () => {
      try {
        const uRes = await fetch("/api/user-setting");
        const ud = await uRes.json();
        console.log("API users:", ud);
        if (ud.success && Array.isArray(ud.users)) {
          setUsers(ud.users);
          setFiltered(ud.users);
        }
        const pRes = await fetch("/api/profil");
        const pd = await pRes.json();
        if (pd.user) setCurrentUser(pd.user);
      } catch (err) {
        console.error(err);
      }
    };
    fetchData();
  }, []);

  // --- FILTER ---
  useEffect(() => {
    setFiltered(users.filter(u => 
      u.nom.toLowerCase().includes(search.toLowerCase()) || 
      u.mail.toLowerCase().includes(search.toLowerCase())
    ));
  }, [search, users]);

  // --- MODAL HANDLERS ---
  const openModal = (mode: 'add' | 'edit', user: User | null = null) => {
    setModalMode(mode);
    setTargetUser(user);
    setPhotoFile(null);
    setDateOnly("");
    setHourOnly("09");

    if (mode === 'add') {
      setFormData({ 
        nom:"", prenom:"", mail:"", poste:"salarié", statut:'au travail', mdp:"", 
        solde_conge: 0, solde_hsup: 0, date_entree: new Date().toISOString().split('T')[0],
        motif: ""
      });
    } else if (user) {
      const dateEntree = user.date_entree ? new Date(user.date_entree).toISOString().split('T')[0] : "";
      setFormData({ ...user, mdp:"", date_entree: dateEntree, motif: "" });
    }

    setIsModalOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (currentUser?.id_user === id || !confirm("Êtes-vous sûr de vouloir supprimer cet utilisateur ?")) return;
    const res = await fetch(`/api/user-setting/${id}`, { method: "DELETE" });
    if (res.ok) {
      const uRes = await fetch("/api/user-setting");
      const ud = await uRes.json();
      if (ud.success && Array.isArray(ud.users)) {
        setUsers(ud.users);
        setFiltered(ud.users);
      }
    }
  };

  // --- SUBMIT FORM ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const data = new FormData();

    let finalDateTime = "";
    if (dateOnly) finalDateTime = `${dateOnly}T${hourOnly}:00`;

    Object.keys(formData).forEach(k => {
      const value = formData[k as keyof typeof formData];
      if (value !== undefined && value !== null) data.append(k, String(value));
    });

    if (finalDateTime) data.append("date_action", finalDateTime);
    if (photoFile) data.append("photo", photoFile);

    const url = modalMode === 'add' ? "/api/user-setting" : `/api/user-setting/${targetUser?.id_user ?? 0}`;
    const res = await fetch(url, { method: modalMode === 'add' ? "POST" : "PATCH", body: data });
    const json = await res.json();

    if (json.success) {
      if(json.logout) router.push("/");
      else {
        setIsModalOpen(false);
        const uRes = await fetch("/api/user-setting");
        const ud = await uRes.json();
        if (ud.success && Array.isArray(ud.users)) {
          setUsers(ud.users);
          setFiltered(ud.users);
        }
      }
    } else alert(json.error || "Erreur");
  };

  // --- HISTORY ---
  const openHistory = async (user: User) => {
    setTargetUser(user);
    setIsHistoryOpen(true);
    const res = await fetch(`/api/solde-history?userId=${user.id_user}`);
    const data = await res.json();
    setHistoryLogs(data.success ? data.history : []);
  };

  const getStatutBadge = (statut: string) => {
    switch(statut) {
      case 'au travail': return <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-bold uppercase">Au travail</span>;
      case 'en congés': return <span className="bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-xs font-bold uppercase">En Congés</span>;
      case 'malade': return <span className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-xs font-bold uppercase">Malade</span>;
      default: return <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-xs font-bold uppercase">Inconnu</span>;
    }
  };

  const hasHsupChanged = modalMode === 'edit' && targetUser && parseFloat(String(formData.solde_hsup)) !== parseFloat(String(targetUser.solde_hsup));
  const diffHsup = hasHsupChanged ? parseFloat(String(formData.solde_hsup)) - parseFloat(String(targetUser?.solde_hsup)) : 0;

  // ... (tout le code avant le return reste identique)

  // --- RENDER ---
  return (
    <div className="min-h-screen px-4 sm:px-8 py-8 bg-[#f4f6fc] font-[poppins]">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-10 flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h1 className="text-4xl font-[Modak] text-[#000091]">Utilisateurs</h1>
          <p className="text-gray-400 font-medium ml-1">Gérez vos équipes et leurs soldes.</p>
        </div>
        <div className="flex gap-3 w-full md:w-auto bg-white p-2 rounded-2xl shadow-sm border border-gray-100">
          <input 
            placeholder="🔍 Rechercher..." 
            value={search} 
            onChange={e=>setSearch(e.target.value)} 
            className="px-4 py-2 bg-transparent text-[#000091] outline-none flex-1 text-sm font-medium"
          />
          <button onClick={()=>openModal('add')} className="bg-[#000091] text-white px-6 py-2 rounded-xl font-bold shadow-md hover:bg-[#2a2ab3] transition whitespace-nowrap text-sm">+ Ajouter</button>
        </div>
      </div>

      {/* Users Grid */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filtered.map(u => (
          <div key={u.id_user} className="bg-white rounded-[2rem] p-6 shadow-sm hover:shadow-xl transition-all duration-300 border border-gray-100 group relative">
            <div className="flex items-center gap-4 mb-4">
              <img src={u.photo||'/uploads/default.jpeg'} className="w-16 h-16 rounded-2xl object-cover shadow-md bg-gray-50 border-2 border-white"/>
              <div>
                <div className="font-[Modak] text-xl text-[#000091] leading-none">{u.prenom} {u.nom}</div>
                <div className="text-xs text-gray-400 font-bold uppercase mt-1">{u.poste}</div>
              </div>
            </div>
            <div className="mb-4 flex justify-between items-center bg-gray-50 px-3 py-2 rounded-xl">
              <span className="text-xs font-bold text-[#000091] uppercase">Statut</span>
              {getStatutBadge(u.statut)}
            </div>
            <div className="flex gap-2 mb-6">
              <div className="flex-1 bg-[#f4f6fc] rounded-xl p-3 text-center border border-blue-50">
                <div className="text-[10px] font-bold text-gray-400 uppercase">Congés</div>
                <div className="text-xl font-[Modak] text-[#000091]">{formatJours(u.solde_conge)}</div>
              </div>
              <div className="flex-1 bg-[#fff5eb] rounded-xl p-3 text-center border border-orange-50">
                <div className="text-[10px] font-bold text-gray-400 uppercase">Récup</div>
                <div className="text-xl font-[Modak] text-[#ff6400]">{formatHeures(u.solde_hsup)}</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={()=>openModal('edit', u)} className="bg-[#000091] text-white py-3 rounded-xl font-bold text-xs hover:bg-[#2a2ab3] transition shadow-md shadow-blue-100">Modifier</button>
              <button onClick={()=>openHistory(u)} className="bg-gray-100 text-[#000091] rounded-xl hover:bg-gray-200 transition font-bold text-xs">Historique</button>
              {currentUser?.id_user !== u.id_user && (
                <button onClick={()=>handleDelete(u.id_user)} className="col-span-2 mt-1 bg-red-50 text-red-500 py-3 rounded-xl font-bold text-xs hover:bg-red-500 hover:text-white transition flex items-center justify-center gap-2 border border-red-100 hover:border-red-500">
                  🗑️ Supprimer l&apos;utilisateur
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* --- MODAL --- */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={(e) => e.target === e.currentTarget && setIsModalOpen(false)}>
          <div className="bg-white w-full max-w-2xl rounded-[2rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h2 className="text-2xl font-[Modak] text-[#000091]">
                {modalMode === 'add' ? '✨ Nouvel Utilisateur' : '✏️ Modifier ' + targetUser?.prenom}
              </h2>
              <button onClick={()=>setIsModalOpen(false)} className="w-8 h-8 rounded-full bg-white hover:bg-red-50 hover:text-red-500 flex items-center justify-center transition shadow-sm font-bold">✕</button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 uppercase ml-2">Nom</label>
                  <input required className="w-full bg-gray-50 rounded-xl px-4 py-3 outline-none focus:ring-2 ring-[#000091]/20 font-bold text-[#000091]" value={formData.nom} onChange={e=>setFormData({...formData, nom:e.target.value})}/>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 uppercase ml-2">Prénom</label>
                  <input required className="w-full bg-gray-50 rounded-xl px-4 py-3 outline-none focus:ring-2 ring-[#000091]/20 font-bold text-[#000091]" value={formData.prenom} onChange={e=>setFormData({...formData, prenom:e.target.value})}/>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase ml-2">Email</label>
                <input type="email" required className="w-full bg-gray-50 rounded-xl px-4 py-3 outline-none focus:ring-2 ring-[#000091]/20 font-medium" value={formData.mail} onChange={e=>setFormData({...formData, mail:e.target.value})}/>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                   <label className="text-xs font-bold text-gray-500 uppercase ml-2">Poste</label>
                   <select className="w-full bg-gray-50 rounded-xl px-4 py-3 outline-none font-medium appearance-none" value={formData.poste} onChange={e=>setFormData({...formData, poste:e.target.value})}>
                     {POSTES.map(p=><option key={p} value={p}>{p}</option>)}
                   </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 uppercase ml-2">Date d&apos;entrée</label>
                  <input type="date" required className="w-full bg-gray-50 rounded-xl px-4 py-3 outline-none font-medium" value={formData.date_entree ? String(formData.date_entree).split('T')[0] : ''} onChange={e=>setFormData({...formData, date_entree:e.target.value})}/>
                </div>
              </div>

              <div className="p-4 bg-[#f4f6fc] rounded-2xl border border-blue-100 space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">⚖️</span>
                  <span className="font-[Modak] text-[#000091] text-lg">Soldes</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-400 uppercase ml-2">Congés (Jours)</label>
                    <input type="number" step="0.5" className="w-full bg-white rounded-xl px-4 py-3 outline-none font-bold text-[#000091] shadow-sm" value={formData.solde_conge} onChange={e=>setFormData({...formData, solde_conge:parseFloat(e.target.value)||0})}/>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-400 uppercase ml-2">H. Sup (Heures)</label>
                    <input type="number" step="0.01" className="w-full bg-white rounded-xl px-4 py-3 outline-none font-bold text-[#ff6400] shadow-sm" value={formData.solde_hsup} onChange={e=>setFormData({...formData, solde_hsup:parseFloat(e.target.value)||0})}/>
                  </div>
                </div>

                {/* Section conditionnelle pour H.Sup change */}
                {modalMode === 'edit' && hasHsupChanged && (
                   <div className="mt-4 bg-orange-50 p-4 rounded-xl border border-orange-100 animate-in fade-in slide-in-from-top-2">
                     <p className="text-xs font-bold text-orange-600 uppercase mb-3 flex items-center gap-2">
                       ⚠️ Modification Heures ({diffHsup > 0 ? '+' : ''}{formatHeures(diffHsup)})
                     </p>
                     <div className="space-y-3">
                       <input placeholder="Raison de la modif (Obligatoire)" required className="w-full bg-white border border-orange-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 ring-orange-200" value={formData.motif} onChange={e=>setFormData({...formData, motif:e.target.value})}/>
                       <div className="grid grid-cols-2 gap-2">
                          <input type="date" required className="bg-white border border-orange-200 rounded-lg px-3 py-2 text-sm" value={dateOnly} onChange={e=>setDateOnly(e.target.value)}/>
                          <select className="bg-white border border-orange-200 rounded-lg px-3 py-2 text-sm" value={hourOnly} onChange={e=>setHourOnly(e.target.value)}>
                            {HOURS.map(h=><option key={h} value={h}>{h}:00</option>)}
                          </select>
                       </div>
                     </div>
                   </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                   <label className="text-xs font-bold text-gray-500 uppercase ml-2">{modalMode==='add'?'Mot de passe':'Nouveau MDP (Optionnel)'}</label>
                   <input type="password" required={modalMode==='add'} className="w-full bg-gray-50 rounded-xl px-4 py-3 outline-none font-medium" placeholder="••••••" value={formData.mdp} onChange={e=>setFormData({...formData, mdp:e.target.value})}/>
                </div>
                <div className="space-y-1">
                   <label className="text-xs font-bold text-gray-500 uppercase ml-2">Photo</label>
                   <input type="file" accept="image/*" className="w-full bg-gray-50 rounded-xl px-4 py-2.5 outline-none text-xs file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-[#000091] file:text-white hover:file:bg-blue-800" onChange={e=>{if(e.target.files?.[0]) setPhotoFile(e.target.files[0])}}/>
                </div>
              </div>

              <button type="submit" className="w-full bg-[#000091] text-white py-4 rounded-xl font-[Modak] text-xl tracking-wider hover:bg-[#2a2ab3] transition shadow-lg shadow-blue-200 mt-4">
                {modalMode === 'add' ? 'Créer l\'utilisateur' : 'Enregistrer les modifications'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* --- HISTORY PANEL --- */}
      {isHistoryOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
           <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={()=>setIsHistoryOpen(false)}/>
           <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
             <div className="p-6 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
               <div>
                 <h3 className="font-[Modak] text-2xl text-[#000091]">Historique</h3>
                 <p className="text-xs font-bold text-gray-400 uppercase">{targetUser?.prenom} {targetUser?.nom}</p>
               </div>
               <button onClick={()=>setIsHistoryOpen(false)} className="w-8 h-8 bg-white rounded-full flex items-center justify-center font-bold hover:bg-gray-200">✕</button>
             </div>
             <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {historyLogs.length === 0 ? (
                  <div className="text-center text-gray-400 py-10 font-medium">Aucun historique disponible</div>
                ) : (
                  historyLogs.map(log => (
                    <div key={log.id_historique} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                      <div className="flex justify-between items-start mb-2">
                        <span className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase ${log.type_solde.includes('hsup') ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                          {getHistoryLabel(log.type_solde)}
                        </span>
                        <span className="text-[10px] text-gray-400 font-bold">{formatDateTime(log.date_modif)}</span>
                      </div>
                      <div className="flex items-center gap-3">
                         <div className={`text-xl font-[Modak] ${log.valeur_modif > 0 ? 'text-green-500' : 'text-red-500'}`}>
                           {log.valeur_modif > 0 ? '+' : ''}
                           {log.type_solde.includes('hsup') ? formatHeures(log.valeur_modif) : formatJours(log.valeur_modif)}
                         </div>
                         <div className="text-xs text-gray-500 font-medium leading-tight">
                            {log.motif ? `"${log.motif}"` : 'Mise à jour automatique'}
                            <br/>
                            <span className="text-gray-300">Par {log.actor_prenom}</span>
                         </div>
                      </div>
                    </div>
                  ))
                )}
             </div>
           </div>
        </div>
      )}
    </div>
  );
}
