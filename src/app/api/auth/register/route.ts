import { NextRequest, NextResponse } from "next/server";
import { query, calculateWizardRank } from "@/lib/db";
import { ensureSchemaAndSeed } from "@/lib/init-db";

export async function POST(req: NextRequest) {
  try {
    await ensureSchemaAndSeed();
    const body = await req.json();
    const {
      login,
      email,
      phone,
      password = "wizard_password",
      first_name = "",
      last_name = "",
      age = null,
    } = body;

    if (!login || !email || !phone) {
      return NextResponse.json(
        { error: "Логин, Email и номер телефона обязательны для регистрации!" },
        { status: 400 }
      );
    }

    const existing = await query(
      `SELECT id FROM users WHERE LOWER(login) = LOWER($1) OR LOWER(email) = LOWER($2) LIMIT 1`,
      [login.trim(), email.trim()]
    );

    if (existing.rows.length > 0) {
      return NextResponse.json(
        { error: "Волшебник с таким Логином или Email уже зарегистрирован!" },
        { status: 409 }
      );
    }

    const rank = calculateWizardRank(0);
    const { rows } = await query(
      `INSERT INTO users (
        login, email, phone, password_hash, first_name, last_name, age, wizard_rank
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING id, login, email, phone, first_name, last_name, age, gender, house,
                trivia_score, wizard_rank, games_played, delivery_address, delivery_lat, delivery_lng, role, created_at`,
      [
        login.trim(),
        email.trim(),
        phone.trim(),
        password,
        first_name || null,
        last_name || null,
        age ? Number(age) : null,
        rank,
      ]
    );

    return NextResponse.json({ user: rows[0] }, { status: 201 });
  } catch (err: any) {
    console.error("[POST /api/auth/register Error]:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

