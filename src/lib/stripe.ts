import Stripe from "stripe";
import { query } from "@/lib/db";

let cachedStripeKey: string | null = process.env.STRIPE_SECRET_KEY || null;

export async function getStripeSecretKey(): Promise<string | null> {
  if (process.env.STRIPE_SECRET_KEY) {
    return process.env.STRIPE_SECRET_KEY;
  }
  if (cachedStripeKey) {
    return cachedStripeKey;
  }
  try {
    const res = await query(
      `SELECT value FROM system_config WHERE key = 'stripe_secret_key' LIMIT 1`
    );
    if (res.rows.length > 0 && res.rows[0].value) {
      cachedStripeKey = String(res.rows[0].value).trim();
      return cachedStripeKey;
    }
  } catch (err: any) {
    console.warn("[getStripeSecretKey warning]:", err.message);
  }
  return null;
}

export async function getStripeClient(): Promise<Stripe | null> {
  const key = await getStripeSecretKey();
  if (!key) return null;
  return new Stripe(key);
}

