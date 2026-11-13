import { Pool, QueryResultRow } from "pg";
import { attachDatabasePool } from "@vercel/functions";

declare global {
  // eslint-disable-next-line no-var
  var __neonPool: Pool | undefined;
}

function createPool(): Pool {
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) {
    throw new Error("DATABASE_URL environment variable is not set");
  }
  const connectionString = rawUrl.replace(
    "sslmode=require",
    "sslmode=verify-full"
  );
  const pool = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000,
  });

  pool.on("error", (err: Error) => {
    console.error("[Neon Pool Error]:", err.message);
  });

  try {
    attachDatabasePool(pool);
  } catch {
    // Ignore outside Vercel Fluid runtime (e.g. local scripts)
  }

  return pool;
}

export function getPool(): Pool {
  if (!global.__neonPool) {
    global.__neonPool = createPool();
  }
  return global.__neonPool;
}

export async function query<T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<{ rows: T[]; rowCount: number | null }> {
  const pool = getPool();
  return pool.query<T>(text, params);
}

export function calculateWizardRank(score: number): string {
  if (score > 500) return "Орден Мерлина I степени (Order of Merlin, First Class)";
  if (score >= 301) return "Мракоборец (Auror)";
  if (score >= 151) return "Староста (Prefect)";
  if (score >= 51) return "Первокурсник (First-Year)";
  return "Магл (Muggle)";
}

export const USD_TO_UZS_RATE = 12850;

