import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { ensureSchemaAndSeed } from "@/lib/init-db";

export async function GET(req: NextRequest) {
  try {
    await ensureSchemaAndSeed();
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    const login = searchParams.get("login");

    let ordersRes;
    if (userId || login) {
      ordersRes = await query(
        `SELECT * FROM orders
         WHERE ($1::int IS NOT NULL AND user_id = $1::int)
            OR ($2::text IS NOT NULL AND LOWER(customer_login) = LOWER($2::text))
         ORDER BY paid_at DESC`,
        [userId ? Number(userId) : null, login || null]
      );
    } else {
      ordersRes = await query(`SELECT * FROM orders ORDER BY paid_at DESC LIMIT 100`);
    }

    return NextResponse.json({ orders: ordersRes.rows });
  } catch (err: any) {
    console.error("[GET /api/orders Error]:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

