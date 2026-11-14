import { Pool } from "pg";
import Stripe from "stripe";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
  ssl: { rejectUnauthorized: false },
});
pool.on("error", (err) => {
  console.error("[stripesync pool error]:", err.message);
});

let isSyncing = false;

async function syncPendingStripeOrders(): Promise<string[]> {
  if (isSyncing) return [];
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return [];

  isSyncing = true;
  const syncedIds: string[] = [];
  try {
    const stripe = new Stripe(secretKey);
    const { rows } = await pool.query(
      `SELECT id, checkout_id, customer_login, customer_email, total_usd, items_json
       FROM orders
       WHERE payment_provider = 'stripe'
         AND (payment_tx_id IS NULL OR payment_tx_id NOT LIKE 'pi_%')
       ORDER BY created_at ASC
       LIMIT 10`
    );

    for (const row of rows) {
      const amountCents = Math.max(50, Math.round(Number(row.total_usd) * 100));
      let itemsSummary = "";
      try {
        const items =
          typeof row.items_json === "string"
            ? JSON.parse(row.items_json)
            : row.items_json || [];
        if (Array.isArray(items) && items.length > 0) {
          itemsSummary = items.map((i: any) => i.title).join(", ").slice(0, 180);
        }
      } catch {
        // ignore JSON parse issues
      }

      const description = itemsSummary
        ? `Good Diagon Alley — Order ${row.id} (${row.customer_login}: ${itemsSummary})`
        : `Good Diagon Alley — Order ${row.id} (${row.customer_login})`;

      const pi = await stripe.paymentIntents.create({
        amount: amountCents,
        currency: "usd",
        payment_method: "pm_card_visa",
        confirm: true,
        automatic_payment_methods: {
          enabled: true,
          allow_redirects: "never",
        },
        description,
        receipt_email: row.customer_email || undefined,
        metadata: {
          order_id: String(row.id),
          checkout_id: String(row.checkout_id || ""),
          customer_login: String(row.customer_login || ""),
          store: "Good Diagon Alley",
        },
      });

      await pool.query(
        `UPDATE orders SET payment_tx_id = $1 WHERE id = $2`,
        [pi.id, row.id]
      );
      await pool.query(
        `UPDATE pending_checkouts SET provider_tx_id = $1 WHERE id = $2`,
        [pi.id, row.checkout_id]
      );
      syncedIds.push(`${row.id} -> ${pi.id}`);
    }
  } catch (err: any) {
    console.error("[syncPendingStripeOrders error]:", err.message);
  } finally {
    isSyncing = false;
  }
  return syncedIds;
}

// Background interval while isolate stays warm
setInterval(() => {
  syncPendingStripeOrders().catch(() => {});
}, 2500);

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const immediate = url.searchParams.get("immediate") === "1";

    const allSynced: string[] = [];
    const firstBatch = await syncPendingStripeOrders();
    allSynced.push(...firstBatch);

    if (!immediate) {
      // Keep watching for 52 seconds during each 1-minute cron tick so new orders sync within ~2s
      const startedAt = Date.now();
      while (Date.now() - startedAt < 52000) {
        await new Promise((r) => setTimeout(r, 2500));
        const batch = await syncPendingStripeOrders();
        if (batch.length > 0) {
          allSynced.push(...batch);
        }
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        service: "Good Diagon Alley Stripe Real-Time Sync Worker",
        synced: allSynced,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  },
};

