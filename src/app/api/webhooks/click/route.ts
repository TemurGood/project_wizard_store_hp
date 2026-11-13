import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

/**
 * Click SHOP-API Sandbox Endpoint
 * Implements:
 * - action = 0 (Prepare)
 * - action = 1 (Complete — saves paid order to `orders` table!)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      click_trans_id = Date.now(),
      merchant_trans_id,
      action = 1,
      card_number = "8600000000000000",
      sms_code = "666666",
    } = body;

    if (!merchant_trans_id) {
      return NextResponse.json(
        { error: -8, error_note: "Missing merchant_trans_id (checkout_id)" },
        { status: 400 }
      );
    }

    const pendingRes = await query(
      `SELECT * FROM pending_checkouts WHERE id = $1 LIMIT 1`,
      [merchant_trans_id]
    );

    if (pendingRes.rows.length === 0) {
      return NextResponse.json(
        { error: -5, error_note: "Pending checkout does not exist" },
        { status: 404 }
      );
    }

    const pending = pendingRes.rows[0];

    // Action 0: Prepare
    if (Number(action) === 0) {
      const prepId = Date.now();
      await query(
        `UPDATE pending_checkouts SET provider_state = 1, provider_tx_id = $1 WHERE id = $2`,
        [String(click_trans_id), merchant_trans_id]
      );
      return NextResponse.json({
        click_trans_id,
        merchant_trans_id,
        merchant_prepare_id: prepId,
        error: 0,
        error_note: "Success (Prepare)",
      });
    }

    // Action 1: Complete
    const cleanCard = String(card_number).replace(/\s+/g, "");
    const cleanSms = String(sms_code).trim();
    if (cleanCard !== "8600000000000000" || cleanSms !== "666666") {
      return NextResponse.json(
        {
          error: -1,
          error_note:
            "В тестовом шлюзе Click используйте карту 8600 0000 0000 0000 и SMS-код 666666",
        },
        { status: 400 }
      );
    }

    const existing = await query(
      `SELECT * FROM orders WHERE checkout_id = $1 LIMIT 1`,
      [merchant_trans_id]
    );
    if (existing.rows.length > 0) {
      const ord = existing.rows[0];
      return NextResponse.json({
        click_trans_id,
        merchant_trans_id,
        merchant_confirm_id: ord.id,
        error: 0,
        error_note: "Success",
        order: ord,
        telegram_deep_link: `https://t.me/wizard_HP_store_bot?start=order_${ord.id}`,
      });
    }

    const orderId = `ORD-CLICK-${Date.now().toString().slice(-6)}-${Math.random()
      .toString(36)
      .slice(2, 5)
      .toUpperCase()}`;

    await query(
      `UPDATE pending_checkouts SET provider_state = 2, provider_tx_id = $1 WHERE id = $2`,
      [String(click_trans_id), merchant_trans_id]
    );

    const { rows } = await query(
      `INSERT INTO orders (
        id, checkout_id, user_id, customer_login, customer_email, customer_phone,
        items_json, subtotal_usd, discount_usd, promo_code,
        total_usd, total_uzs, currency, payment_provider, payment_tx_id, status, paid_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,'UZS','click',$13,'Paid - Awaiting Delivery Location',NOW())
      RETURNING *`,
      [
        orderId,
        merchant_trans_id,
        pending.user_id,
        pending.customer_login,
        pending.customer_email,
        pending.customer_phone,
        typeof pending.items_json === "string"
          ? pending.items_json
          : JSON.stringify(pending.items_json),
        pending.subtotal_usd,
        pending.discount_usd,
        pending.promo_code,
        pending.total_usd,
        pending.total_uzs,
        String(click_trans_id),
      ]
    );

    const savedOrder = rows[0];

    return NextResponse.json({
      click_trans_id,
      merchant_trans_id,
      merchant_confirm_id: savedOrder.id,
      error: 0,
      error_note: "Success (Complete)",
      order: savedOrder,
      telegram_deep_link: `https://t.me/wizard_HP_store_bot?start=order_${savedOrder.id}`,
    });
  } catch (err: any) {
    console.error("[POST /api/webhooks/click Error]:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

