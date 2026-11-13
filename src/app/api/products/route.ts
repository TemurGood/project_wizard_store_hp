import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { ensureSchemaAndSeed } from "@/lib/init-db";

export async function GET(req: NextRequest) {
  try {
    await ensureSchemaAndSeed();
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category");

    const categoriesRes = await query(
      `SELECT * FROM categories ORDER BY sort_order ASC`
    );

    let productsRes;
    if (category && category !== "all") {
      productsRes = await query(
        `SELECT * FROM products WHERE category_slug = $1 OR category_name = $1 ORDER BY id ASC`,
        [category]
      );
    } else {
      productsRes = await query(`SELECT * FROM products ORDER BY id ASC`);
    }

    return NextResponse.json({
      categories: categoriesRes.rows,
      products: productsRes.rows,
    });
  } catch (err: any) {
    console.error("[GET /api/products Error]:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureSchemaAndSeed();
    const body = await req.json();
    const {
      title,
      category_slug,
      category_name,
      price_usd,
      discount_percent = 0,
      fixed_discount_usd = 0,
      short_description = "",
      lore_description,
      image_url,
      storage_key = null,
      origin_wizard = "Мастерская Косого Переулка",
      rarity = "Редкий артефакт",
      stock = 20,
    } = body;

    if (!title || !category_slug || !price_usd || !lore_description || !image_url) {
      return NextResponse.json(
        { error: "Заполните все обязательные поля товара" },
        { status: 400 }
      );
    }

    const catMap: Record<string, string> = {
      uniforms: "Форма",
      wands: "Палочки",
      sweets: "Сладости",
      quidditch: "Спорт инвентарь",
      artifacts: "Артефакты",
      figurines: "Фигурки",
    };

    const resolvedCategoryName = category_name || catMap[category_slug] || "Артефакты";

    const { rows } = await query(
      `INSERT INTO products (
        title, category_slug, category_name, price_usd, discount_percent, fixed_discount_usd,
        short_description, lore_description, image_url, storage_key, origin_wizard, rarity, stock
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING *`,
      [
        title,
        category_slug,
        resolvedCategoryName,
        Number(price_usd),
        Number(discount_percent || 0),
        Number(fixed_discount_usd || 0),
        short_description || lore_description.slice(0, 120),
        lore_description,
        image_url,
        storage_key,
        origin_wizard,
        rarity,
        Number(stock || 20),
      ]
    );

    return NextResponse.json({ product: rows[0] }, { status: 201 });
  } catch (err: any) {
    console.error("[POST /api/products Error]:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

