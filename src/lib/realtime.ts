import { createRealtime, rawSql } from "@neon/realtime/server";

export interface LiveLeaderboardRow {
  id: number;
  login: string;
  house: string | null;
  trivia_score: number;
  wizard_rank: string;
  games_played: number;
}

export interface LiveOrderRow {
  id: string;
  customer_login: string;
  total_usd: string;
  total_uzs: string;
  currency: string;
  payment_provider: string;
  status: string;
  delivery_address: string | null;
  paid_at: string;
}

let realtimeInstance: ReturnType<typeof createRealtime> | null = null;

export function getRealtimeServer() {
  if (!realtimeInstance) {
    const secret = process.env.NEON_REALTIME_SECRET;
    if (!secret) {
      throw new Error("NEON_REALTIME_SECRET is not set");
    }
    realtimeInstance = createRealtime({
      secret,
      db: "neondb",
    });
  }
  return realtimeInstance;
}

export const liveLeaderboardQuery = rawSql<LiveLeaderboardRow>(
  `SELECT id, login, house, trivia_score, wizard_rank, games_played FROM users ORDER BY trivia_score DESC, games_played DESC LIMIT 50`
);

export const liveOrdersQuery = rawSql<LiveOrderRow>(
  `SELECT id, customer_login, total_usd, total_uzs, currency, payment_provider, status, delivery_address, paid_at FROM orders ORDER BY paid_at DESC LIMIT 50`
);

export function liveUserOrdersQuery(userId: number) {
  return rawSql<LiveOrderRow>(
    `SELECT id, customer_login, total_usd, total_uzs, currency, payment_provider, status, delivery_address, paid_at FROM orders WHERE user_id = $1 ORDER BY paid_at DESC LIMIT 30`,
    [userId]
  );
}

