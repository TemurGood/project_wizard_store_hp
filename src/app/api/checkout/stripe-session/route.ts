import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getStripeClient } from "@/lib/stripe";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const checkoutId = body.checkout_id;

    if (!checkoutId) {
      return NextResponse.json(
        { error: "Не указан checkout_id" },
        { status: 400 }
      );
    }

    const pendingRes = await query(
      `SELECT * FROM pending_checkouts WHERE id = $1 LIMIT 1`,
      [checkoutId]
    );
    if (pendingRes.rows.length === 0) {
      return NextResponse.json(
        { error: "Черновик заказа не найден" },
        { status: 404 }
      );
    }

    const pending = pendingRes.rows[0];
    const stripe = await getStripeClient();
    if (!stripe) {
      return NextResponse.json(
        { error: "Stripe API ключ не настроен на сервере" },
        { status: 500 }
      );
    }

    const origin =
      req.headers.get("origin") ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "https://project-wizard-store-hp.vercel.app";

    const rawItems =
      typeof pending.items_json === "string"
        ? JSON.parse(pending.items_json)
        : pending.items_json || [];

    const totalUsd = Number(pending.total_usd || 0);
    const totalCents = Math.max(50, Math.round(totalUsd * 100));

    const itemsSummary = Array.isArray(rawItems)
      ? rawItems
          .map((it: any) => `${it.title} ×${it.quantity || 1}`)
          .join(", ")
          .slice(0, 220)
      : "Артефакты Косого Переулка";

    // Build line_items for checkout.stripe.com
    // If a promo discount is applied, pass a single consolidated line item with full breakdown in description,
    // or individual items when there is no promo discount
    const hasPromoDiscount = Number(pending.discount_usd || 0) > 0;
    const lineItems =
      !hasPromoDiscount && Array.isArray(rawItems) && rawItems.length > 0
        ? rawItems.map((it: any) => ({
            quantity: Math.max(1, Number(it.quantity || 1)),
            price_data: {
              currency: "usd",
              unit_amount: Math.max(
                50,
                Math.round(Number(it.final_price_usd || it.price_usd || 10) * 100)
              ),
              product_data: {
                name: String(it.title || "Магический артефакт"),
                description: "Лавка «Good Diagon Alley» — Гринготтс",
              },
            },
          }))
        : [
            {
              quantity: 1,
              price_data: {
                currency: "usd",
                unit_amount: totalCents,
                product_data: {
                  name: `Заказ Good Diagon Alley (${pending.promo_code ? `Промокод ${pending.promo_code}` : "Гринготтс"})`,
                  description: itemsSummary,
                },
              },
            },
          ];

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      client_reference_id: checkoutId,
      customer_email: pending.customer_email || undefined,
      line_items: lineItems,
      metadata: {
        checkout_id: checkoutId,
        customer_login: String(pending.customer_login || ""),
        promo_code: String(pending.promo_code || ""),
      },
      payment_intent_data: {
        description: `Good Diagon Alley — Checkout ${checkoutId} (${pending.customer_login}: ${itemsSummary})`,
        metadata: {
          checkout_id: checkoutId,
          customer_login: String(pending.customer_login || ""),
          store: "Good Diagon Alley",
        },
      },
      success_url: `${origin}/?stripe_session_id={CHECKOUT_SESSION_ID}&checkout_id=${encodeURIComponent(checkoutId)}`,
      cancel_url: `${origin}/?stripe_canceled=1`,
    });

    await query(
      `UPDATE pending_checkouts SET provider_tx_id = $1, provider_state = 1 WHERE id = $2`,
      [session.id, checkoutId]
    );

    return NextResponse.json({
      url: session.url,
      session_id: session.id,
      checkout_id: checkoutId,
    });
  } catch (err: any) {
    console.error("[POST /api/checkout/stripe-session Error]:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("session_id");
    const checkoutIdParam = searchParams.get("checkout_id");

    if (!sessionId && !checkoutIdParam) {
      return NextResponse.json(
        { error: "Missing session_id or checkout_id" },
        { status: 400 }
      );
    }

    const stripe = await getStripeClient();
    let checkoutId = checkoutIdParam || "";
    let paymentTxId = sessionId || "";
    let isPaid = false;

    if (stripe && sessionId) {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      checkoutId =
        checkoutId ||
        session.client_reference_id ||
        session.metadata?.checkout_id ||
        "";
      paymentTxId = String(session.payment_intent || session.id);
      isPaid =
        session.payment_status === "paid" || session.status === "complete";
    }

    if (!checkoutId) {
      return NextResponse.json(
        { error: "Не удалось определить checkout_id сессии Stripe" },
        { status: 400 }
      );
    }

    // Check if order already exists (created by webhook or earlier call)
    const existingOrder = await query(
      `SELECT * FROM orders WHERE checkout_id = $1 LIMIT 1`,
      [checkoutId]
    );
    if (existingOrder.rows.length > 0) {
      const ord = existingOrder.rows[0];
      if (paymentTxId.startsWith("pi_") && ord.payment_tx_id !== paymentTxId) {
        await query(`UPDATE orders SET payment_tx_id = $1 WHERE id = $2`, [
          paymentTxId,
          ord.id,
        ]);
        ord.payment_tx_id = paymentTxId;
      }
      return NextResponse.json({
        paid: true,
        order: ord,
      });
    }

    if (!isPaid) {
      return NextResponse.json(
        { error: "Оплата в Stripe ещё не завершена", paid: false },
        { status: 402 }
      );
    }

    const pendingRes = await query(
      `SELECT * FROM pending_checkouts WHERE id = $1 LIMIT 1`,
      [checkoutId]
    );
    if (pendingRes.rows.length === 0) {
      return NextResponse.json(
        { error: "Pending checkout not found" },
        { status: 404 }
      );
    }

    const pending = pendingRes.rows[0];
    const orderId = `ORD-STR-${Date.now().toString().slice(-6)}-${Math.random()
      .toString(36)
      .slice(2, 5)
      .toUpperCase()}`;

    await query(
      `UPDATE pending_checkouts SET provider_state = 2, provider_tx_id = $1 WHERE id = $2`,
      [paymentTxId, checkoutId]
    );

    const { rows } = await query(
      `INSERT INTO orders (
        id, checkout_id, user_id, customer_login, customer_email, customer_phone,
        items_json, subtotal_usd, discount_usd, promo_code,
        total_usd, total_uzs, currency, payment_provider, payment_tx_id, status, paid_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13,'stripe',$14,'Paid - Awaiting Delivery Location',NOW())
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
        pending.currency || "USD",
        paymentTxId,
      ]
    );

    return NextResponse.json({
      paid: true,
      order: rows[0],
    });
  } catch (err: any) {
    console.error("[GET /api/checkout/stripe-session Error]:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

