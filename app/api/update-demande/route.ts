import { NextResponse } from "next/server";
import { getDBConnection } from "@/lib/db";
import { cookies } from "next/headers";
import { RowDataPacket } from "mysql2";

// ✅ FONCTION DE CALCUL INTELLIGENTE (Jours / Demi-journées)
function calculateLeaveDays(startDate: string | Date, endDate: string | Date): number {
    const start = new Date(startDate);
    const end = new Date(endDate);

    // 1. Si c'est le MEME JOUR
    if (start.toDateString() === end.toDateString()) {
        const diffHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
        // Si durée <= 5h (ex: 9h-12h ou 14h-18h), c'est une demi-journée (0.5)
        // Sinon (ex: 9h-18h), c'est une journée complète (1.0)
        return diffHours <= 5 ? 0.5 : 1.0;
    }

    // 2. Si c'est sur PLUSIEURS JOURS
    let totalDays = 0;
    
    // A. Contribution du Premier Jour
    // Si on commence l'après-midi (>= 13h), on compte 0.5, sinon 1.0
    totalDays += start.getHours() >= 13 ? 0.5 : 1.0;

    // B. Contribution du Dernier Jour
    // Si on finit le matin (<= 13h), on compte 0.5, sinon 1.0
    totalDays += end.getHours() <= 13 ? 0.5 : 1.0;

    // C. Jours Complets Intermédiaires
    // On crée des dates clones à midi pour éviter les problèmes d'heures
    const current = new Date(start);
    current.setDate(current.getDate() + 1); // Lendemain du début
    
    const stop = new Date(end);
    stop.setHours(0,0,0,0); // Minuit du jour de fin

    // Tant que le jour courant est strictement avant le jour de fin
    while (current < stop) {
        // (Optionnel: Ici on pourrait exclure les weekends si besoin)
        totalDays += 1.0;
        current.setDate(current.getDate() + 1);
    }

    return totalDays;
}

export async function POST(req: Request) {
  const conn = await getDBConnection();
  
  try {
    const { id_demande, decision } = await req.json();

    const cookieStore = await cookies();
    const actorIdStr = cookieStore.get("userId")?.value;
    const actorId = actorIdStr ? parseInt(actorIdStr, 10) : null;

    if (!id_demande || !decision || !actorId) {
      return NextResponse.json({ error: "Paramètres manquants ou non connecté" }, { status: 400 });
    }

    if (!["Acceptée", "Refusée"].includes(decision)) {
      return NextResponse.json({ error: "Statut invalide" }, { status: 400 });
    }

    await conn.beginTransaction();

    const [rows] = await conn.query<RowDataPacket[]>("SELECT * FROM demande WHERE id_demande = ?", [id_demande]);
    if (rows.length === 0) {
      await conn.rollback();
      return NextResponse.json({ error: "Demande introuvable" }, { status: 404 });
    }

    const demande = rows[0];
    const isNewAcceptance = decision === "Acceptée" && demande.statut_demande !== "Acceptée";

    if (isNewAcceptance) {
        let variation = 0;
        let typeSolde = "";

        const start = new Date(demande.date_debut);
        const end = new Date(demande.date_fin);

        // ✅ APPLICATION DE LA NOUVELLE LOGIQUE
        if (demande.type === "Congés Payés") {
            const days = calculateLeaveDays(start, end);
            variation = -days; 
            typeSolde = "conge_accepte";
        } 
        else if (demande.type === "Heures Supplémentaire") {
            // Pour les heures, on garde le calcul précis
            const diffMs = end.getTime() - start.getTime();
            const hours = diffMs / (1000 * 60 * 60);
            variation = -hours;
            typeSolde = "hsup_accepte";
        }

        // APPLICATION DE LA DÉDUCTION
        if (typeSolde !== "" && variation !== 0) {
            const colName = typeSolde.startsWith('conge') ? 'solde_conge' : 'solde_hsup';
            
            await conn.query(
                `UPDATE user SET ${colName} = ${colName} + ? WHERE id_user = ?`,
                [variation, demande.id_user]
            );

            const [userRows] = await conn.query<RowDataPacket[]>(`SELECT ${colName} FROM user WHERE id_user = ?`, [demande.id_user]);
            const nouveauSolde = userRows[0][colName];

            await conn.query(
                `INSERT INTO historique_solde (id_user_target, id_user_actor, type_solde, valeur_modif, nouveau_solde, date_modif)
                 VALUES (?, ?, ?, ?, ?, NOW())`,
                [demande.id_user, actorId, typeSolde, variation, nouveauSolde]
            );
        }
    }

    await conn.query("UPDATE demande SET statut_demande = ? WHERE id_demande = ?", [decision, id_demande]);

    await conn.commit();
    return NextResponse.json({ success: true, message: isNewAcceptance ? "Demande acceptée et solde débité" : "Statut mis à jour" });

  } catch (error: unknown) {
    await conn.rollback();
    console.error("Erreur API update-demande:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}