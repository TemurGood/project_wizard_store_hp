import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { computeSortedHouse, HOUSE_DETAILS } from "@/data/sorting-hat-data";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      userId,
      gender = "male",
      answers = [],
      house: explicitHouse,
    } = body;

    const normalizedGender: "male" | "female" =
      gender === "female" || gender === "женский" ? "female" : "male";

    let sorted = explicitHouse ? HOUSE_DETAILS[explicitHouse] : null;
    if (!sorted) {
      sorted = computeSortedHouse(normalizedGender, answers);
    }

    // Strict validation of school routing rule:
    // Durmstrang ONLY eligible if Question 1 = Male
    // Beauxbatons ONLY eligible if Question 1 = Female
    if (sorted.key === "Durmstrang" && normalizedGender !== "male") {
      sorted = HOUSE_DETAILS.Slytherin;
    }
    if (sorted.key === "Beauxbatons" && normalizedGender !== "female") {
      sorted = HOUSE_DETAILS.Ravenclaw;
    }

    let updatedUser = null;
    if (userId) {
      const { rows } = await query(
        `UPDATE users
         SET gender = $1,
             house = $2
         WHERE id = $3
         RETURNING id, login, email, phone, first_name, last_name, age, gender, house,
                   trivia_score, wizard_rank, games_played, delivery_address, role`,
        [normalizedGender, sorted.key, Number(userId)]
      );
      updatedUser = rows[0] || null;
    }

    return NextResponse.json({
      sortedHouse: sorted,
      user: updatedUser,
    });
  } catch (err: any) {
    console.error("[POST /api/sorting Error]:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

