import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    if (!userId) {
      return NextResponse.json({ favorites: [] });
    }

    const { rows } = await query(
      `SELECT p.* FROM favorites f
       INNER JOIN products p ON p.id = f.product_id
       WHERE f.user_id = $1
       ORDER BY f.created_at DESC`,
      [Number(userId)]
    );

    return NextResponse.json({ favorites: rows });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId, productId } = await req.json();
    if (!userId || !productId) {
      return NextResponse.json(
        { error: "userId and productId required" },
        { status: 400 }
      );
    }

    const existing = await query(
      `SELECT id FROM favorites WHERE user_id = $1 AND product_id = $2`,
      [Number(userId), Number(productId)]
    );

    if (existing.rows.length > 0) {
      await query(`DELETE FROM favorites WHERE user_id = $1 AND product_id = $2`, [
        Number(userId),
        Number(productId),
      ]);
      return NextResponse.json({ favorited: false, productId: Number(productId) });
    } else {
      await query(
        `INSERT INTO favorites (user_id, product_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [Number(userId), Number(productId)]
      );
      return NextResponse.json({ favorited: true, productId: Number(productId) });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

