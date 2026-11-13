import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { ensureSchemaAndSeed } from "@/lib/init-db";

export async function GET(req: NextRequest) {
  try {
    await ensureSchemaAndSeed();
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    const login = searchParams.get("login");

    if (!userId && !login) {
      return NextResponse.json({ error: "userId or login required" }, { status: 400 });
    }

    const userRes = userId
      ? await query(`SELECT * FROM users WHERE id = $1 LIMIT 1`, [Number(userId)])
      : await query(`SELECT * FROM users WHERE LOWER(login) = LOWER($1) LIMIT 1`, [login]);

    if (userRes.rows.length === 0) {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }

    const user = userRes.rows[0];
    delete user.password_hash;

    const ordersRes = await query(
      `SELECT * FROM orders
       WHERE user_id = $1 OR LOWER(customer_login) = LOWER($2)
       ORDER BY paid_at DESC`,
      [user.id, user.login]
    );

    const favsRes = await query(
      `SELECT p.* FROM favorites f
       INNER JOIN products p ON p.id = f.product_id
       WHERE f.user_id = $1
       ORDER BY f.created_at DESC`,
      [user.id]
    );

    return NextResponse.json({
      user,
      orders: ordersRes.rows,
      favorites: favsRes.rows,
    });
  } catch (err: any) {
    console.error("[GET /api/user Error]:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      userId,
      first_name,
      last_name,
      age,
      phone,
      delivery_address,
    } = body;

    if (!userId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    const { rows } = await query(
      `UPDATE users
       SET first_name = COALESCE($1, first_name),
           last_name = COALESCE($2, last_name),
           age = COALESCE($3, age),
           phone = COALESCE($4, phone),
           delivery_address = COALESCE($5, delivery_address)
       WHERE id = $6
       RETURNING *`,
      [
        first_name ?? null,
        last_name ?? null,
        age !== undefined && age !== "" ? Number(age) : null,
        phone ?? null,
        delivery_address ?? null,
        Number(userId),
      ]
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const user = rows[0];
    delete user.password_hash;
    return NextResponse.json({ user });
  } catch (err: any) {
    console.error("[PUT /api/user Error]:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

