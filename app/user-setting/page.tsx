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
          <input placeholder="🔍 Rechercher..." value={search} onChange={e=>setSearch(e.target.value)} className="px-4 py-2 bg-transparent text-[#000091] outline-none flex-1 text-sm font-medium"/>
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

      {/* MODAL & HISTORY */}
      {/* ... Tu peux réutiliser le code du modal et de l'historique du snippet précédent ... */}
    </div>
  );
}
