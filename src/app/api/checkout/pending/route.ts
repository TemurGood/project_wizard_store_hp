import { NextRequest, NextResponse } from "next/server";
import { query, USD_TO_UZS_RATE } from "@/lib/db";
import { ensureSchemaAndSeed } from "@/lib/init-db";

const PROMO_CODES: Record<string, { percent: number; label: string }> = {
  LUMOS10: { percent: 10, label: "Заклинание Света (-10%)" },
  ALOHOMORA: { percent: 20, label: "Секретная отмычка Гринготтса (-20%)" },
  FELIX25: { percent: 25, label: "Жидкая Удача Феликс Фелицис (-25%)" },
};

export async function POST(req: NextRequest) {
  try {
    await ensureSchemaAndSeed();
    const body = await req.json();
    const {
      user_id = null,
      customer_login = "Юный Волшебник",
      customer_email = "wizard@hogwarts.ac.uk",
      customer_phone = "+998 90 123 45 67",
      items = [],
      promo_code = "",
      currency = "USD",
      payment_provider = "stripe",
    } = body;

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "Корзина пуста! Добавьте магические артефакты." },
        { status: 400 }
      );
    }

    const subtotalUsd = items.reduce(
      (sum: number, item: any) =>
        sum + Number(item.final_price_usd ?? item.price_usd ?? 0) * Number(item.quantity || 1),
      0
    );

    const normalizedPromo = String(promo_code || "").trim().toUpperCase();
    const promoInfo = PROMO_CODES[normalizedPromo];
    const discountPercent = promoInfo ? promoInfo.percent : 0;
    const discountUsd = Number(((subtotalUsd * discountPercent) / 100).toFixed(2));
    const totalUsd = Math.max(1, Number((subtotalUsd - discountUsd).toFixed(2)));
    const totalUzs = Math.round(totalUsd * USD_TO_UZS_RATE);

    const checkoutId = `chk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // CRITICAL HOMEWORK RULE:
    // Save ONLY into pending_checkouts BEFORE payment confirmation.
    // The orders table remains untouched until the payment webhook succeeds!
    const { rows } = await query(
      `INSERT INTO pending_checkouts (
        id, user_id, customer_login, customer_email, customer_phone,
        items_json, subtotal_usd, discount_usd, promo_code,
        total_usd, total_uzs, currency, payment_provider, provider_state
      ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,0)
      RETURNING *`,
      [
        checkoutId,
        user_id ? Number(user_id) : null,
        customer_login,
        customer_email,
        customer_phone,
        JSON.stringify(items),
        subtotalUsd,
        discountUsd,
        promoInfo ? normalizedPromo : null,
        totalUsd,
        totalUzs,
        currency,
        payment_provider,
      ]
    );

    return NextResponse.json(
      {
        checkout: rows[0],
        message: "Pending checkout created (Order NOT saved to orders table until payment succeeds)",
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error("[POST /api/checkout/pending Error]:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
