// app/api/user-setting/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { writeFile } from "fs/promises";
import path from "path";
import { getDBConnection } from "@/lib/db";
import { cookies } from "next/headers";
import { RowDataPacket } from "mysql2";
import { calculateRecoveryHours } from "@/lib/overtimeUtils";

// --- CORRECTION DU TYPE DE PARAMS (Promise) ---
export async function DELETE(
  req: NextRequest, 
  { params }: { params: Promise<{ id: string }> } // <-- params est maintenant une Promise
) {
  // --- AWAIT PARAMS ---
  const { id } = await params; 
  const targetId = parseInt(id, 10);

  const cookieStore = await cookies();
  const currentUserIdStr = cookieStore.get("userId")?.value;
  const currentUserId = currentUserIdStr ? parseInt(currentUserIdStr, 10) : null;

  if (currentUserId && currentUserId === targetId) {
    return NextResponse.json(
      { success: false, error: "Impossible de supprimer son propre compte." },
      { status: 403 }
    );
  }

  const connection = await getDBConnection();
  try {
    await connection.query("DELETE FROM user WHERE id_user = ?", [targetId]);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ success: false, error: "Erreur suppression" }, { status: 500 });
  }
}


export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> } 
) {

  const { id } = await params;
  const targetId = parseInt(id, 10);

  const cookieStore = await cookies();
  const currentUserIdStr = cookieStore.get("userId")?.value;
  const actorId = currentUserIdStr ? parseInt(currentUserIdStr, 10) : null;

  const connection = await getDBConnection();

  try {
    const formData = await req.formData();
    const motif = formData.get("motif") as string | null;
    const dateActionStr = formData.get("date_action") as string | null;

    // Récupération de l'utilisateur
    const [currentRows] = await connection.query<RowDataPacket[]>(
      "SELECT solde_conge, solde_hsup FROM user WHERE id_user = ?",
      [targetId]
    );

    if (currentRows.length === 0) {
      return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });
    }

    const oldUser = currentRows[0] as { solde_conge: number; solde_hsup: number };

    // Construction des mises à jour
    const updates: string[] = [];
    const values: (string | number)[] = [];
    const allowedFields = ["nom","prenom","mail","poste","solde_conge","solde_hsup","mdp","date_entree"];

    let sensitiveChanged = false;
    let diffConge = 0;
    let rawInputHsup = 0;
    let dureeReelleHsup = 0;
    let finalAddedHsup = 0;
    let newTotalHsup = oldUser.solde_hsup;

    allowedFields.forEach((field) => {
      const val = formData.get(field);
      if (val !== null) {
        if (field === "mdp" && val.toString().trim() !== "") {
          updates.push(`${field} = ?`);
          values.push(val.toString());
          sensitiveChanged = true;
        } else if (field === "mail") {
          updates.push(`${field} = ?`);
          values.push(val.toString());
          sensitiveChanged = true;
        } else if (field === "solde_conge") {
          const newVal = parseFloat(val.toString());
          diffConge = newVal - oldUser.solde_conge;
          updates.push(`${field} = ?`);
          values.push(newVal);
        } else if (field === "solde_hsup") {
          rawInputHsup = parseFloat(val.toString());
          dureeReelleHsup = rawInputHsup - oldUser.solde_hsup;
        } else {
          updates.push(`${field} = ?`);
          values.push(val.toString());
        }
      }
    });

    // H.Sup
    if (Math.abs(dureeReelleHsup) > 0.001) {
      if (!motif || !dateActionStr) {
        return NextResponse.json({ error: "Motif et date requis pour H.Sup" }, { status: 400 });
      }

      try {
        const dateObj = new Date(dateActionStr);
        const result = await calculateRecoveryHours(connection, targetId, dateObj, dureeReelleHsup);
        finalAddedHsup = result.toCredit;
      } catch (err) {
        console.error(err);
        return NextResponse.json({ error: "Erreur calcul H.Sup" }, { status: 500 });
      }

      newTotalHsup = oldUser.solde_hsup + finalAddedHsup;
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

    // Update DB
    if (updates.length > 0) {
      await connection.query(`UPDATE user SET ${updates.join(", ")} WHERE id_user = ?`, [...values, targetId]);
    }

    // Historique conge
    if (Math.abs(diffConge) > 0.001) {
      await connection.query(
        `INSERT INTO historique_solde (id_user_target, id_user_actor, type_solde, valeur_modif, nouveau_solde, date_modif)
         VALUES (?, ?, 'conge', ?, ?, NOW())`,
        [targetId, actorId, diffConge, oldUser.solde_conge + diffConge]
      );
    }

    // Historique Hsup
    if (Math.abs(dureeReelleHsup) > 0.001) {
      await connection.query(
        `INSERT INTO historique_solde 
         (id_user_target, id_user_actor, type_solde, valeur_modif, nouveau_solde, date_modif, motif, date_action, duree_reelle)
         VALUES (?, ?, 'hsup', ?, ?, NOW(), ?, ?, ?)`,
        [targetId, actorId, finalAddedHsup, newTotalHsup, motif, dateActionStr, dureeReelleHsup]
      );
    }

    // Déconnexion si changement sensible
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