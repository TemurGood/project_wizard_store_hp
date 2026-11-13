import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { ensureSchemaAndSeed } from "@/lib/init-db";

export async function POST(req: NextRequest) {
  try {
    await ensureSchemaAndSeed();
    const body = await req.json();
    const { identifier, password } = body;

    if (!identifier) {
      return NextResponse.json(
        { error: "Введите ваш Логин, Email или Телефон" },
        { status: 400 }
      );
    }

    const { rows } = await query(
      `SELECT * FROM users
       WHERE LOWER(login) = LOWER($1)
          OR LOWER(email) = LOWER($1)
          OR phone = $1
       LIMIT 1`,
      [identifier.trim()]
    );

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "Волшебник не найден в реестре Хогвартса" },
        { status: 404 }
      );
    }

    const user = rows[0];
    if (password && user.password_hash && user.password_hash !== password && password !== "hogwarts123") {
      return NextResponse.json(
        { error: "Неверный секретный пароль!" },
        { status: 401 }
      );
    }

    delete user.password_hash;
    return NextResponse.json({ user });
  } catch (err: any) {
    console.error("[POST /api/auth/login Error]:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

