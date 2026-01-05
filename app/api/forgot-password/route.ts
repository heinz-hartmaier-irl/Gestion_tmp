import { NextResponse } from "next/server";
import mysql from "mysql2/promise";
import { getDBConnection } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json({ error: "Email requis" }, { status: 400 });
    }
    
    const connection = await getDBConnection();

    const [rows]: any = await connection.execute(
      "SELECT id_user, nom, prenom, mail FROM user WHERE mail = ? LIMIT 1",
      [email]
    );

    await connection.end();

    if (rows.length === 0) {
      return NextResponse.json({ error: "Utilisateur non trouvé" }, { status: 404 });
    }

    // Ici, normalement on génère un token et on envoie un email
    // Pour l'instant on retourne juste un message pour la démo
    return NextResponse.json({
      message: "Si cet email existe, un lien de réinitialisation a été envoyé."
    }, { status: 200 });

  } catch (err: any) {
    console.error("Erreur API forgot-password :", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
