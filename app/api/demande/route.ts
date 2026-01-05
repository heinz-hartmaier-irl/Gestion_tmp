import { NextRequest, NextResponse } from "next/server";
import { getDBConnection } from "@/lib/db";
import { writeFile } from "fs/promises";
import path from "path";
import { RowDataPacket } from "mysql2";
import { OkPacket } from "mysql2/promise";

export async function POST(req: NextRequest) {
  const connection = await getDBConnection();

  try {
    const formData = await req.formData();

    const typeKey = formData.get("type") as string;
    const startDate = formData.get("startDate") as string;
    const endDate = formData.get("endDate") as string;
    const userId = formData.get("userId") as string;

    const justificatifFile = formData.get("justificatifFile") as File | null;
    const nature = formData.get("nature") as string | null;
    const motifText = formData.get("justificatifText") as string | null;

    if (!userId || !startDate || !endDate) {
      return NextResponse.json({ error: "Données incomplètes" }, { status: 400 });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (end < start) {
      return NextResponse.json({ error: "Dates invalides" }, { status: 400 });
    }

    let dbType = "";
    switch (typeKey) {
      case "maladie":
        dbType = "Arrêt Maladie";
        break;
      case "conge":
        dbType = "Congés Payés";
        break;
      case "hsup":
        dbType = "Heures Supplémentaire";
        break;
      case "specifique":
        dbType = "Congé spécifique";
        break;
      default:
        return NextResponse.json({ error: "Type invalide" }, { status: 400 });
    }

    // Vérification solde utilisateur
    const [users] = await connection.query<RowDataPacket[]>(
      "SELECT solde_conge, solde_hsup FROM user WHERE id_user = ?",
      [userId]
    );

    if (users.length === 0) {
      return NextResponse.json({ error: "Utilisateur inconnu" }, { status: 404 });
    }

    const user = users[0];
    const diffMs = Math.abs(end.getTime() - start.getTime());

    if (dbType === "Congés Payés") {
      const daysRequested = Math.ceil(diffMs / (1000 * 60 * 60 * 24)) || 1;
      if (user.solde_conge < daysRequested) {
        return NextResponse.json({ error: `Solde insuffisant (${user.solde_conge}j).` }, { status: 400 });
      }
    } else if (dbType === "Heures Supplémentaire") {
      const hoursRequested = diffMs / (1000 * 60 * 60);
      if (user.solde_hsup < hoursRequested) {
        return NextResponse.json({ error: `Heures insuffisantes (${user.solde_hsup}h).` }, { status: 400 });
      }
    }

    const statutInitial = dbType === "Arrêt Maladie" ? "Acceptée" : "En Attente";

    await connection.beginTransaction();

    const sqlStart = startDate.replace("T", " ");
    const sqlEnd = endDate.replace("T", " ");

    // INSERTION DEMANDE
    const [result] = await connection.execute<OkPacket>(
      `INSERT INTO demande (id_user, type, date_demande, date_debut, date_fin, statut_demande, motif) 
       VALUES (?, ?, NOW(), ?, ?, ?, ?)`,
      [userId, dbType, sqlStart, sqlEnd, statutInitial, motifText]
    );

    const demandeId = result.insertId;

    // Gestion fichiers justificatifs
    let dbPath: string | null = null;
    if ((typeKey === "maladie" || typeKey === "specifique") && justificatifFile) {
      const buffer = Buffer.from(await justificatifFile.arrayBuffer());
      const fileName = `${typeKey}_${demandeId}_${Date.now()}_${justificatifFile.name.replace(/[^a-zA-Z0-9.]/g, "_")}`;
      const uploadPath = path.join(process.cwd(), "public/uploads", fileName);
      await writeFile(uploadPath, buffer);
      dbPath = `/uploads/${fileName}`;
    }

    if (typeKey === "maladie") {
      if (!dbPath) throw new Error("Justificatif requis");
      await connection.execute(
        `INSERT INTO maladie_spec (id_demande, justificatif) VALUES (?, ?)`,
        [demandeId, dbPath]
      );
    } else if (typeKey === "specifique") {
      await connection.execute(
        `INSERT INTO conges_spec (id_demande, nature, justificatif) VALUES (?, ?, ?)`,
        [demandeId, nature || "Autre", dbPath]
      );
    }

    await connection.commit();
    return NextResponse.json({ success: true, id: demandeId });
  } catch (err: unknown) {
    await connection.rollback();
    if (err instanceof Error) {
      console.error(err.message);
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
    console.error(err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  } finally {
    await connection.end();
  }
}
