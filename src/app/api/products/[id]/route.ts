import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await req.json();
    const {
      title,
      category_slug,
      category_name,
      price_usd,
      discount_percent,
      fixed_discount_usd,
      short_description,
      lore_description,
      image_url,
      storage_key,
      origin_wizard,
      rarity,
      stock,
    } = body;

    const catMap: Record<string, string> = {
      uniforms: "Форма",
      wands: "Палочки",
      sweets: "Сладости",
      quidditch: "Спорт инвентарь",
      artifacts: "Артефакты",
      figurines: "Фигурки",
    };

    const resolvedCategoryName =
      category_name || (category_slug ? catMap[category_slug] : undefined);

    const { rows } = await query(
      `UPDATE products
       SET title = COALESCE($1, title),
           category_slug = COALESCE($2, category_slug),
           category_name = COALESCE($3, category_name),
           price_usd = COALESCE($4, price_usd),
           discount_percent = COALESCE($5, discount_percent),
           fixed_discount_usd = COALESCE($6, fixed_discount_usd),
           short_description = COALESCE($7, short_description),
           lore_description = COALESCE($8, lore_description),
           image_url = COALESCE($9, image_url),
           storage_key = COALESCE($10, storage_key),
           origin_wizard = COALESCE($11, origin_wizard),
           rarity = COALESCE($12, rarity),
           stock = COALESCE($13, stock)
       WHERE id = $14
       RETURNING *`,
      [
        title ?? null,
        category_slug ?? null,
        resolvedCategoryName ?? null,
        price_usd !== undefined ? Number(price_usd) : null,
        discount_percent !== undefined ? Number(discount_percent) : null,
        fixed_discount_usd !== undefined ? Number(fixed_discount_usd) : null,
        short_description ?? null,
        lore_description ?? null,
        image_url ?? null,
        storage_key ?? null,
        origin_wizard ?? null,
        rarity ?? null,
        stock !== undefined ? Number(stock) : null,
        Number(id),
      ]
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: "Товар не найден" }, { status: 404 });
    }

    return NextResponse.json({ product: rows[0] });
  } catch (err: any) {
    console.error("[PUT /api/products/[id] Error]:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const { rowCount } = await query(`DELETE FROM products WHERE id = $1`, [
      Number(id),
    ]);
    if (!rowCount) {
      return NextResponse.json({ error: "Товар не найден" }, { status: 404 });
    }
    return NextResponse.json({ deleted: true, id: Number(id) });
  } catch (err: any) {
    console.error("[DELETE /api/products/[id] Error]:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

