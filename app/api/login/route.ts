import { NextResponse } from "next/server";
import mysql from "mysql2/promise";
import { getDBConnection } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Champs manquants" }, { status: 400 });
    }

    const connection = await getDBConnection();

    const [rows]: any = await connection.execute(
      "SELECT * FROM user WHERE mail = ? LIMIT 1",
      [email]
    );

    await connection.end();

    if (rows.length === 0) {
      return NextResponse.json({ error: "Utilisateur non trouvé" }, { status: 404 });
    }

    const user = rows[0];

    if (user.mdp !== password) {
      return NextResponse.json({ error: "Mot de passe incorrect" }, { status: 401 });
    }

    const res = NextResponse.json({ success: true, user });

    // 🔐 On pose juste un cookie "userId"
    res.cookies.set("userId", String(user.id_user), {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 jours
    });

    return res;
  } catch (err) {
    console.error("Erreur API login :", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
