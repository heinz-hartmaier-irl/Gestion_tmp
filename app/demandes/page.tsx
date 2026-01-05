"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const demandeTypes = [
  { value: "conge", label: "Congé Payé" },
  { value: "maladie", label: "Arrêt Maladie" },
  { value: "hsup", label: "Récupération" },
  { value: "specifique", label: "Congé Spécifique" },
];

interface User {
  id_user: number;
  poste?: string;
}


export default function DemandesPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const [type, setType] = useState("");
  const [dateStart, setDateStart] = useState(""); 
  const [dateEnd, setDateEnd] = useState("");
  const [periodStart, setPeriodStart] = useState("matin"); 
  const [periodEnd, setPeriodEnd] = useState("soir");
  const [justificatifFile, setJustificatifFile] = useState<File | null>(null);
  const [justificatifText, setJustificatifText] = useState("");
  const [nature, setNature] = useState("");

  useEffect(() => { fetch("/api/profil").then(res => res.json()).then(data => { setUser(data.user); setLoading(false); }); }, []);

  const updateDateTime = (currentIso: string, field: 'date' | 'hour' | 'minute', value: string, setter: (v: string) => void) => {
      let d = currentIso ? new Date(currentIso) : new Date();
      if (!currentIso) d.setHours(9, 0, 0, 0);
      if (field === 'date') { const newDate = new Date(value); d.setFullYear(newDate.getFullYear(), newDate.getMonth(), newDate.getDate()); } 
      else if (field === 'hour') d.setHours(parseInt(value)); 
      else if (field === 'minute') d.setMinutes(parseInt(value));
      const year = d.getFullYear(); const month = String(d.getMonth() + 1).padStart(2, '0'); const day = String(d.getDate()).padStart(2, '0'); const hours = String(d.getHours()).padStart(2, '0'); const mins = String(d.getMinutes()).padStart(2, '0');
      setter(`${year}-${month}-${day}T${hours}:${mins}`);
  };

  const getParts = (isoStr: string) => {
      if (!isoStr) return { date: '', hour: '09', minute: '00' };
      const d = new Date(isoStr);
      return { date: isoStr.split('T')[0], hour: String(d.getHours()).padStart(2, '0'), minute: String(d.getMinutes()).padStart(2, '0') };
  };

  const addDuration = (minutes: number) => {
      if (!dateStart) return;
      const d = new Date(dateStart); d.setMinutes(d.getMinutes() + minutes);
      const year = d.getFullYear(); const month = String(d.getMonth() + 1).padStart(2, '0'); const day = String(d.getDate()).padStart(2, '0'); const hours = String(d.getHours()).padStart(2, '0'); const mins = String(d.getMinutes()).padStart(2, '0');
      setDateEnd(`${year}-${month}-${day}T${hours}:${mins}`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!type || !dateStart || !dateEnd) return alert("Champs manquants");
    let finalStartDate = dateStart; let finalEndDate = dateEnd;
    if (type === "conge" || type === "specifique") {
        const timeStart = periodStart === 'matin' ? '09:00' : '14:00'; const timeEnd = periodEnd === 'midi' ? '12:00' : '18:00';
        const dStart = dateStart.split('T')[0] || dateStart; const dEnd = dateEnd.split('T')[0] || dateEnd;
        finalStartDate = `${dStart}T${timeStart}`; finalEndDate = `${dEnd}T${timeEnd}`;
    }
    if (new Date(finalEndDate) <= new Date(finalStartDate)) return alert("Dates invalides.");
    const formData = new FormData();
    formData.append("type", type); formData.append("startDate", finalStartDate); formData.append("endDate", finalEndDate);
    if (user?.id_user) formData.append("userId", String(user.id_user));
    if (type==="hsup" && justificatifText) formData.append("justificatifText", justificatifText);
    if ((type==="maladie"||type==="specifique") && justificatifFile) formData.append("justificatifFile", justificatifFile);
    if (type==="specifique") formData.append("nature", nature);
    const res = await fetch("/api/demande", { method: "POST", body: formData });
    const data = await res.json();
    if (data.success) { 
        alert("Envoyé !"); 
        const poste = user?.poste?.toLowerCase();
        router.push(poste === "admin" || poste === "rh" ? "/dashboard-admin" : "/dashboard-user");
    } else alert(data.error);
  };

  if (loading) return <div className="p-10 text-center font-[poppins]">Chargement...</div>;

  const isConge = type === "conge" || type === "specifique";
  const isHSup = type === "hsup";
  const isMaladie = type === "maladie";
  const startParts = getParts(dateStart);
  const endParts = getParts(dateEnd);

  return (
    <div className="min-h-screen bg-[#f4f6fc] px-4 py-8 font-[poppins]">
      <h1 className="text-5xl font-[Modak] text-[#000091] text-center mb-10">Nouvelle Demande</h1>
      
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Formulaire */}
        <div className="lg:col-span-2 bg-white rounded-[2.5rem] shadow-xl p-8 border border-gray-100">
            <form onSubmit={handleSubmit} className="space-y-8">
                <div>
                    <label className="text-xs font-bold text-[#000091] uppercase mb-2 block tracking-wider">Type de demande</label>
                    <div className="grid grid-cols-2 gap-3">
                        {demandeTypes.map(t => (
                            <button key={t.value} type="button" onClick={() => { setType(t.value); setDateStart(""); setDateEnd(""); }}
                                className={`py-4 rounded-2xl text-sm font-bold transition-all duration-300 border-2 ${type===t.value ? 'bg-[#000091] text-white border-[#000091] shadow-lg shadow-blue-200 scale-[1.02]' : 'bg-white text-gray-500 border-gray-100 hover:border-[#000091] hover:text-[#000091]'}`}>
                                {t.label}
                            </button>
                        ))}
                    </div>
                </div>

                {type && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fadeIn">
                    {/* DÉBUT */}
                    <div className="bg-[#f8f9fc] p-5 rounded-3xl border border-gray-100">
                        <label className="text-xs font-bold text-gray-400 uppercase mb-3 block">Début</label>
                        <input type="date" value={startParts.date} onChange={e=>updateDateTime(dateStart, 'date', e.target.value, setDateStart)} className="w-full p-3 bg-white border border-gray-200 rounded-xl mb-3 focus:border-[#000091] outline-none font-bold text-gray-700"/>
                        
                        {isConge && (
                             <div className="flex bg-gray-200 p-1 rounded-xl">
                                <button type="button" onClick={()=>setPeriodStart('matin')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition ${periodStart==='matin'?'bg-white text-[#000091] shadow-sm':'text-gray-500'}`}>Matin</button>
                                <button type="button" onClick={()=>setPeriodStart('apres-midi')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition ${periodStart==='apres-midi'?'bg-white text-[#000091] shadow-sm':'text-gray-500'}`}>Après-midi</button>
                            </div>
                        )}
                        {isHSup && (
                            <div className="flex gap-2">
                                <select value={startParts.hour} onChange={e=>updateDateTime(dateStart, 'hour', e.target.value, setDateStart)} className="flex-1 p-3 bg-white border border-gray-200 rounded-xl font-bold text-gray-700 outline-none">{Array.from({length: 24}, (_, i) => String(i).padStart(2, '0')).map(h => <option key={h} value={h}>{h}h</option>)}</select>
                                <select value={startParts.minute} onChange={e=>updateDateTime(dateStart, 'minute', e.target.value, setDateStart)} className="flex-1 p-3 bg-white border border-gray-200 rounded-xl font-bold text-[#ff6400] outline-none"><option value="00">00</option><option value="15">15</option><option value="30">30</option><option value="45">45</option></select>
                            </div>
                        )}
                    </div>

                    {/* FIN */}
                    <div className="bg-[#f8f9fc] p-5 rounded-3xl border border-gray-100">
                        <label className="text-xs font-bold text-gray-400 uppercase mb-3 block">Fin</label>
                        <input type="date" min={startParts.date} value={endParts.date} onChange={e=>updateDateTime(dateEnd, 'date', e.target.value, setDateEnd)} className="w-full p-3 bg-white border border-gray-200 rounded-xl mb-3 focus:border-[#000091] outline-none font-bold text-gray-700"/>
                        
                        {isConge && (
                             <div className="flex bg-gray-200 p-1 rounded-xl">
                                <button type="button" onClick={()=>setPeriodEnd('midi')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition ${periodEnd==='midi'?'bg-white text-[#000091] shadow-sm':'text-gray-500'}`}>Midi (12h)</button>
                                <button type="button" onClick={()=>setPeriodEnd('soir')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition ${periodEnd==='soir'?'bg-white text-[#000091] shadow-sm':'text-gray-500'}`}>Soir (18h)</button>
                            </div>
                        )}
                        {isHSup && (
                            <>
                                <div className="flex gap-2 mb-3">
                                    <select value={endParts.hour} onChange={e=>updateDateTime(dateEnd, 'hour', e.target.value, setDateEnd)} className="flex-1 p-3 bg-white border border-gray-200 rounded-xl font-bold text-gray-700 outline-none">{Array.from({length: 24}, (_, i) => String(i).padStart(2, '0')).map(h => <option key={h} value={h}>{h}h</option>)}</select>
                                    <select value={endParts.minute} onChange={e=>updateDateTime(dateEnd, 'minute', e.target.value, setDateEnd)} className="flex-1 p-3 bg-white border border-gray-200 rounded-xl font-bold text-[#ff6400] outline-none"><option value="00">00</option><option value="15">15</option><option value="30">30</option><option value="45">45</option></select>
                                </div>
                                {dateStart && <div className="flex gap-2 flex-wrap">{[15,30,60,90].map(m=><button key={m} type="button" onClick={()=>addDuration(m)} className="bg-orange-100 text-[#ff6400] px-2 py-1 rounded-lg text-xs font-bold hover:bg-orange-200">+{m}m</button>)}</div>}
                            </>
                        )}
                    </div>
                </div>
                )}

                {(type === "maladie" || type === "specifique") && (
                     <div className="bg-blue-50 p-5 rounded-3xl border border-blue-100"><label className="text-xs font-bold text-[#000091] uppercase mb-2 block">Justificatif</label><input type="file" onChange={e=>setJustificatifFile(e.target.files?.[0]||null)} className="text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:bg-[#000091] file:text-white hover:file:bg-[#2a2ab3] transition"/></div>
                )}
                {type === "specifique" && <div className="bg-[#f8f9fc] p-5 rounded-3xl"><label className="text-xs font-bold text-[#000091] uppercase mb-2 block">Nature</label><input placeholder="Ex: Déménagement" value={nature} onChange={e=>setNature(e.target.value)} className="w-full p-4 bg-white text-[#000091] rounded-xl border-none outline-none font-medium"/></div>}

                <button type="submit" className="w-full py-5 bg-[#000091] text-white font-[Modak] text-2xl tracking-wide rounded-3xl shadow-xl shadow-blue-200 hover:bg-[#ff6400] hover:shadow-orange-200 hover:scale-[1.02] transition-all duration-300">
                    Envoyer ma demande
                </button>
            </form>
        </div>

        {/* Recap Sticky (Ticket Style) */}
        <div className="lg:col-span-1">
            <div className="bg-gradient-to-b from-[#ff6400] to-[#ff8533] text-white rounded-[2.5rem] shadow-2xl p-8 sticky top-28 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-white opacity-10 rounded-full translate-x-10 -translate-y-10"></div>
                <div className="text-center mb-6 border-b border-white/20 pb-6">
                    <div className="text-6xl mb-2 animate-bounce">🎫</div>
                    <h2 className="text-3xl font-[Modak]">Récap</h2>
                </div>
                <div className="space-y-4 font-medium">
                    <div className="flex justify-between items-center bg-white/10 p-3 rounded-xl">
                        <span className="opacity-80 text-xs uppercase">Type</span>
                        <span className="font-bold">{type ? demandeTypes.find(t=>t.value===type)?.label : "-"}</span>
                    </div>
                    <div className="bg-white/10 p-4 rounded-xl space-y-3">
                        <div className="flex justify-between border-b border-white/10 pb-2">
                            <span className="opacity-80 text-xs uppercase">Début</span>
                            <span className="font-mono font-bold text-right">{dateStart ? (isConge ? `${startParts.date} (${periodStart})` : `${startParts.date} ${startParts.hour}:${startParts.minute}`) : "-"}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="opacity-80 text-xs uppercase">Fin</span>
                            <span className="font-mono font-bold text-right">{dateEnd ? (isConge ? `${endParts.date} (${periodEnd})` : `${endParts.date} ${endParts.hour}:${endParts.minute}`) : "-"}</span>
                        </div>
                    </div>
                </div>
                <div className="mt-8 text-center text-xs opacity-60 font-bold uppercase">Ze-Gestion • {new Date().getFullYear()}</div>
            </div>
        </div>

      </div>
    </div>
  );
}