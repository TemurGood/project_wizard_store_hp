import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { query } from "@/lib/db";

const STRIPE_WORKBENCH_URL =
  "https://dashboard.stripe.com/acct_1UacpqAmUn3wtQDD/test/workbench/webhooks/we_1UbO01AmUn3wtQDD5ifY1lMC";

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const sig = req.headers.get("stripe-signature");

    let event: any;

    if (sig && process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET) {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
      event = stripe.webhooks.constructEvent(
        rawBody,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } else {
      event = JSON.parse(rawBody);
    }

    const eventType = event.type || "checkout.session.completed";
    if (
      eventType !== "checkout.session.completed" &&
      eventType !== "payment_intent.succeeded"
    ) {
      return NextResponse.json({ received: true, ignored: eventType });
    }

    const dataObj = event.data?.object || event;
    const checkoutId =
      dataObj.client_reference_id ||
      dataObj.metadata?.checkout_id ||
      event.checkout_id;
    const cardNumber = String(dataObj.card_number || "4242424242424242").replace(
      /\s+/g,
      ""
    );

    if (!checkoutId) {
      return NextResponse.json(
        { error: "Missing checkout_id in Stripe webhook payload" },
        { status: 400 }
      );
    }

    // Validate test card in simulator mode (4242 4242 4242 4242)
    if (dataObj.card_number && cardNumber !== "4242424242424242") {
      return NextResponse.json(
        {
          error:
            "В тестовом режиме Stripe используйте карту 4242 4242 4242 4242",
        },
        { status: 402 }
      );
    }

    // Check if order was already created for this checkout_id (idempotency)
    const existingOrder = await query(
      `SELECT * FROM orders WHERE checkout_id = $1 LIMIT 1`,
      [checkoutId]
    );
    if (existingOrder.rows.length > 0) {
      const ord = existingOrder.rows[0];
      return NextResponse.json({
        received: true,
        order: ord,
        telegram_deep_link: `https://t.me/wizard_HP_store_bot?start=order_${ord.id}`,
        workbench_webhook: STRIPE_WORKBENCH_URL,
      });
    }

    // Load pending checkout
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
    const paymentTxId = dataObj.id || `pi_test_${Date.now()}`;

    // Update pending checkout state to Paid (2)
    await query(
      `UPDATE pending_checkouts SET provider_state = 2, provider_tx_id = $1 WHERE id = $2`,
      [paymentTxId, checkoutId]
    );

    // CRITICAL HOMEWORK RULE:
    // Insert into final orders table ONLY now, AFTER payment confirmation!
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

    const savedOrder = rows[0];

    return NextResponse.json({
      received: true,
      webhook_id: "we_1UbO01AmUn3wtQDD5ifY1lMC",
      workbench_webhook: STRIPE_WORKBENCH_URL,
      order: savedOrder,
      telegram_deep_link: `https://t.me/wizard_HP_store_bot?start=order_${savedOrder.id}`,
    });
  } catch (err: any) {
    console.error("[POST /api/webhooks/stripe Error]:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

