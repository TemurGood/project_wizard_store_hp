import { NextRequest, NextResponse } from "next/server";
import { query, calculateWizardRank } from "@/lib/db";
import { ensureSchemaAndSeed } from "@/lib/init-db";

export async function GET(req: NextRequest) {
  try {
    await ensureSchemaAndSeed();
    const { searchParams } = new URL(req.url);
    const count = Math.min(25, Math.max(1, Number(searchParams.get("count") || 10)));

    const totalRes = await query(`SELECT COUNT(*)::int AS total FROM quiz_questions`);
    const { rows } = await query(
      `SELECT id, question_ru, options_json, correct_index, category, difficulty, points, explanation_ru
       FROM quiz_questions
       ORDER BY RANDOM()
       LIMIT $1`,
      [count]
    );

    return NextResponse.json({
      totalPoolSize: totalRes.rows[0]?.total || 250,
      questions: rows.map((r) => ({
        ...r,
        options:
          typeof r.options_json === "string"
            ? JSON.parse(r.options_json)
            : r.options_json,
      })),
    });
  } catch (err: any) {
    console.error("[GET /api/trivia Error]:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureSchemaAndSeed();
    const body = await req.json();
    const {
      userId,
      login = "Тайный Маг",
      house = "Gryffindor",
      sessionScore = 0,
      accuracyPercent = 100,
    } = body;

    let updatedUser = null;
    let totalScore = Number(sessionScore);
    let rank = calculateWizardRank(totalScore);
    let resolvedLogin = login;
    let resolvedHouse = house;

    if (userId) {
      const currRes = await query(`SELECT * FROM users WHERE id = $1 LIMIT 1`, [
        Number(userId),
      ]);
      if (currRes.rows.length > 0) {
        const curr = currRes.rows[0];
        totalScore = Number(curr.trivia_score || 0) + Number(sessionScore);
        rank = calculateWizardRank(totalScore);
        resolvedLogin = curr.login;
        resolvedHouse = curr.house || house || "Gryffindor";

        const updRes = await query(
          `UPDATE users
           SET trivia_score = $1,
               wizard_rank = $2,
               games_played = games_played + 1
           WHERE id = $3
           RETURNING id, login, email, phone, first_name, last_name, age, gender, house,
                     trivia_score, wizard_rank, games_played, delivery_address, role`,
          [totalScore, rank, Number(userId)]
        );
        updatedUser = updRes.rows[0];
      }
    }

    await query(
      `INSERT INTO leaderboard_records (user_id, login, house, wizard_rank, score, accuracy_percent)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        userId ? Number(userId) : null,
        resolvedLogin,
        resolvedHouse,
        rank,
        totalScore,
        Number(accuracyPercent || 100),
      ]
    );

    return NextResponse.json({
      sessionScore: Number(sessionScore),
      totalScore,
      wizardRank: rank,
      user: updatedUser,
    });
  } catch (err: any) {
    console.error("[POST /api/trivia Error]:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

