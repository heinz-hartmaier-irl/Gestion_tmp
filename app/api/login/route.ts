import { NextResponse } from "next/server";
import { getDBConnection } from "@/lib/db";
import { RowDataPacket } from "mysql2";

// Définition du type exact de la table user que l'on récupère
interface UserRow extends RowDataPacket {
  id_user: number;
  nom: string;
  prenom: string;
  mail: string;
  mdp: string;
  solde_conge?: number;
  solde_hsup?: number;
  jours_conge_pris?: number;
  photo?: string;
}

export async function POST(req: Request) {
  const connection = await getDBConnection();

  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Champs manquants" }, { status: 400 });
    }

    const [rows] = await connection.execute<UserRow[]>(
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
  } catch (err: unknown) {
    await connection.end();
    if (err instanceof Error) {
      console.error("Erreur API login :", err.message);
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
    console.error("Erreur API login :", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
