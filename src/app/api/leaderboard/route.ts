import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { ensureSchemaAndSeed } from "@/lib/init-db";

export async function GET() {
  try {
    await ensureSchemaAndSeed();
    const { rows } = await query(
      `SELECT id, login, house, trivia_score, wizard_rank, games_played
       FROM users
       ORDER BY trivia_score DESC, games_played DESC, id ASC
       LIMIT 50`
    );

    return NextResponse.json({ leaderboard: rows });
  } catch (err: any) {
    console.error("[GET /api/leaderboard Error]:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

