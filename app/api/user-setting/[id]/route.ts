// app/api/user-setting/[id]/route.ts
import mysql from "mysql2/promise";
import { NextRequest, NextResponse } from "next/server";
import { writeFile } from "fs/promises";
import path from "path";
import { cookies } from "next/headers";
import { RowDataPacket } from "mysql2";
import { calculateRecoveryHours } from "@/lib/overtimeUtils"; // Import du calculateur

// Connexion Pool (ne pas recréer à chaque fois idéalement, mais ok ici)
const db = mysql.createPool({
  host: "localhost",
  port: 8889,
  user: "root",
  password: "root",
  database: "gestion_tmp_travail",
});

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const targetId = parseInt(params.id, 10);
  const cookieStore = await cookies();
  const currentUserIdStr = cookieStore.get("userId")?.value;
  const currentUserId = currentUserIdStr ? parseInt(currentUserIdStr, 10) : null;

  if (currentUserId && currentUserId === targetId) {
    return NextResponse.json({ success: false, error: "Impossible de supprimer son propre compte." }, { status: 403 });
  }
  try {
    await db.query("DELETE FROM user WHERE id_user = ?", [targetId]);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: "Erreur suppression" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const targetId = parseInt(params.id, 10);
  const cookieStore = await cookies();
  const currentUserIdStr = cookieStore.get("userId")?.value;
  const actorId = currentUserIdStr ? parseInt(currentUserIdStr, 10) : null;

  if (!actorId) return NextResponse.json({ error: "Non connecté" }, { status: 401 });

  try {
    const formData = await req.formData();
    const motif = formData.get("motif") as string;
    const dateActionStr = formData.get("date_action") as string; // Réception date

    // État actuel
    const [currentRows] = await db.query<RowDataPacket[]>("SELECT solde_conge, solde_hsup FROM user WHERE id_user = ?", [targetId]);
    if (currentRows.length === 0) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });
    const oldUser = currentRows[0];

    const updates: string[] = [];
    const values: any[] = [];
    const allowedFields = ["nom", "prenom", "mail", "poste", "solde_conge", "solde_hsup", "mdp", "date_entree"];
    
    let sensitiveChanged = false;
    let diffConge = 0;
    
    // Pour H.Sup, on traite différemment : la "variation" n'est pas (Nouveau - Ancien) brut,
    // mais une "déclaration d'heures" qui va s'ajouter.
    // Cependant, dans un formulaire "Settings", on édite souvent le TOTAL.
    // ICI : On va considérer que si le solde change, la différence est la DURÉE RÉELLE travaillée qu'on veut ajouter/régulariser.
    
    let rawInputHsup = 0; // Ce que l'admin a rentré dans l'input
    let dureeReelleHsup = 0;
    let finalAddedHsup = 0;
    let newTotalHsup = parseFloat(oldUser.solde_hsup);

    allowedFields.forEach((field) => {
      const val = formData.get(field);
      
      if (field === "mdp") {
        if (val && val.toString().trim() !== "") {
          updates.push(`${field} = ?`);
          values.push(val);
          sensitiveChanged = true;
        }
      } 
      else if (val !== null) {
        if (field === "mail") {
            updates.push(`${field} = ?`); values.push(val); sensitiveChanged = true;
        }
        else if (field === "solde_conge") {
            const newVal = parseFloat(val.toString());
            diffConge = newVal - parseFloat(oldUser.solde_conge);
            updates.push(`${field} = ?`); values.push(newVal);
        }
        else if (field === "solde_hsup") {
            rawInputHsup = parseFloat(val.toString());
            // La différence est considérée comme les heures réelles à traiter
            dureeReelleHsup = rawInputHsup - parseFloat(oldUser.solde_hsup);
        } 
        else {
            updates.push(`${field} = ?`); values.push(val);
        }
      }
    });

    // TRAITEMENT H.SUP LOGIQUE MÉTIER
    if (Math.abs(dureeReelleHsup) > 0.001) {
        if (!motif || motif.trim() === "") return NextResponse.json({ error: "Motif obligatoire pour modif H.Sup." }, { status: 400 });
        if (!dateActionStr) return NextResponse.json({ error: "Date de l'action obligatoire pour modif H.Sup." }, { status: 400 });

        // Calcul majoration
        const connection = await db.getConnection(); // Besoin connexion pour utils
        try {
            const dateObj = new Date(dateActionStr);
            const result = await calculateRecoveryHours(connection, targetId, dateObj, dureeReelleHsup);
            finalAddedHsup = result.toCredit;
        } finally {
            connection.release();
        }

        // Le nouveau solde est l'ancien + la valeur majorée (pas la valeur brute saisie)
        newTotalHsup = parseFloat(oldUser.solde_hsup) + finalAddedHsup;
        updates.push(`solde_hsup = ?`);
        values.push(newTotalHsup);
    }

    // Photo
    const photoFile = formData.get("photo") as File | null;
    if (photoFile && photoFile.size > 0) {
      const buffer = Buffer.from(await photoFile.arrayBuffer());
      const fileName = `user_${targetId}_${Date.now()}_${photoFile.name.replace(/[^a-zA-Z0-9.]/g, "_")}`;
      const uploadPath = path.join(process.cwd(), "public/uploads", fileName);
      await writeFile(uploadPath, buffer);
      updates.push(`photo = ?`);
      values.push(`/uploads/${fileName}`);
    }

    if (updates.length === 0) return NextResponse.json({ success: true, message: "Aucune modif" });

    await db.query(`UPDATE user SET ${updates.join(", ")} WHERE id_user = ?`, [...values, targetId]);

    // HISTORIQUE
    if (Math.abs(diffConge) > 0.001) {
        await db.query(
            `INSERT INTO historique_solde (id_user_target, id_user_actor, type_solde, valeur_modif, nouveau_solde, date_modif) VALUES (?, ?, 'conge', ?, ?, NOW())`,
            [targetId, actorId, diffConge, parseFloat(oldUser.solde_conge) + diffConge]
        );
    }
    
    if (Math.abs(dureeReelleHsup) > 0.001) {
        await db.query(
            `INSERT INTO historique_solde 
            (id_user_target, id_user_actor, type_solde, valeur_modif, nouveau_solde, date_modif, motif, date_action, duree_reelle)
             VALUES (?, ?, 'hsup', ?, ?, NOW(), ?, ?, ?)`,
            [targetId, actorId, finalAddedHsup, newTotalHsup, motif, dateActionStr, dureeReelleHsup]
        );
    }

    let shouldLogout = false;
    if (actorId === targetId && sensitiveChanged) {
        const cStore = await cookies();
        cStore.delete("userId");
        shouldLogout = true;
    }

    return NextResponse.json({ success: true, logout: shouldLogout });

  } catch (err) {
    console.error(err);
    return NextResponse.json({ success: false, error: "Erreur serveur" }, { status: 500 });
  }
}