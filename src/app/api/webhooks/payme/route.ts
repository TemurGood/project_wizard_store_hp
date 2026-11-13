import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

/**
 * Payme Merchant API JSON-RPC 2.0 Sandbox Endpoint
 * Implements:
 * - CheckPerformTransaction
 * - CreateTransaction
 * - PerformTransaction (saves paid order to `orders` table!)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { id: rpcId = 1, method, params = {} } = body;

    const checkoutId =
      params?.account?.checkout_id ||
      params?.account?.order_id ||
      params?.checkout_id;

    if (!checkoutId) {
      return NextResponse.json({
        jsonrpc: "2.0",
        id: rpcId,
        error: {
          code: -31050,
          message: {
            ru: "Не указан идентификатор заказа (checkout_id)",
            uz: "Buyurtma identifikatori ko'rsatilmagan",
            en: "Missing checkout_id in account",
          },
        },
      });
    }

    const pendingRes = await query(
      `SELECT * FROM pending_checkouts WHERE id = $1 LIMIT 1`,
      [checkoutId]
    );

    if (pendingRes.rows.length === 0) {
      return NextResponse.json({
        jsonrpc: "2.0",
        id: rpcId,
        error: {
          code: -31050,
          message: {
            ru: "Черновик заказа не найден",
            uz: "Buyurtma topilmadi",
            en: "Pending checkout not found",
          },
        },
      });
    }

    const pending = pendingRes.rows[0];

    // 1. CheckPerformTransaction
    if (method === "CheckPerformTransaction") {
      return NextResponse.json({
        jsonrpc: "2.0",
        id: rpcId,
        result: {
          allow: true,
          additional: {
            customer: pending.customer_login,
            total_uzs: Number(pending.total_uzs),
          },
        },
      });
    }

    // 2. CreateTransaction
    if (method === "CreateTransaction") {
      const txId = params.id || `payme_tx_${Date.now()}`;
      await query(
        `UPDATE pending_checkouts SET provider_state = 1, provider_tx_id = $1 WHERE id = $2`,
        [txId, checkoutId]
      );
      return NextResponse.json({
        jsonrpc: "2.0",
        id: rpcId,
        result: {
          create_time: Date.now(),
          transaction: txId,
          state: 1,
        },
      });
    }

    // 3. PerformTransaction (Confirms Payment & Creates Order in `orders`!)
    if (method === "PerformTransaction") {
      const cardNumber = String(params.card_number || "8600000000000000").replace(
        /\s+/g,
        ""
      );
      const smsCode = String(params.sms_code || "666666").trim();

      if (cardNumber !== "8600000000000000" || smsCode !== "666666") {
        return NextResponse.json(
          {
            jsonrpc: "2.0",
            id: rpcId,
            error: {
              code: -31008,
              message: {
                ru: "Для тестового шлюза Payme используйте карту 8600 0000 0000 0000 и SMS-код 666666",
              },
            },
          },
          { status: 400 }
        );
      }

      // Check idempotency
      const existing = await query(
        `SELECT * FROM orders WHERE checkout_id = $1 LIMIT 1`,
        [checkoutId]
      );
      if (existing.rows.length > 0) {
        const ord = existing.rows[0];
        return NextResponse.json({
          jsonrpc: "2.0",
          id: rpcId,
          result: {
            transaction: ord.payment_tx_id,
            perform_time: Date.now(),
            state: 2,
            order: ord,
            telegram_deep_link: `https://t.me/wizard_HP_store_bot?start=order_${ord.id}`,
          },
        });
      }

      const txId = params.id || pending.provider_tx_id || `payme_tx_${Date.now()}`;
      const orderId = `ORD-PAYME-${Date.now().toString().slice(-6)}-${Math.random()
        .toString(36)
        .slice(2, 5)
        .toUpperCase()}`;

      await query(
        `UPDATE pending_checkouts SET provider_state = 2, provider_tx_id = $1 WHERE id = $2`,
        [txId, checkoutId]
      );

      const { rows } = await query(
        `INSERT INTO orders (
          id, checkout_id, user_id, customer_login, customer_email, customer_phone,
          items_json, subtotal_usd, discount_usd, promo_code,
          total_usd, total_uzs, currency, payment_provider, payment_tx_id, status, paid_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,'UZS','payme',$13,'Paid - Awaiting Delivery Location',NOW())
        RETURNING *`,
        [
          orderId,
          checkoutId,
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
          txId,
        ]
      );

      const savedOrder = rows[0];

      return NextResponse.json({
        jsonrpc: "2.0",
        id: rpcId,
        result: {
          transaction: txId,
          perform_time: Date.now(),
          state: 2,
          order: savedOrder,
          telegram_deep_link: `https://t.me/wizard_HP_store_bot?start=order_${savedOrder.id}`,
        },
      });
    }

    return NextResponse.json({
      jsonrpc: "2.0",
      id: rpcId,
      error: { code: -32601, message: "Method not found" },
    });
  } catch (err: any) {
    console.error("[POST /api/webhooks/payme Error]:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

