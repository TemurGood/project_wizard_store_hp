import fs from "fs";
import path from "path";

// Load .env.local or .env before importing db
for (const envFile of [".env.local", ".env"]) {
  const fullPath = path.join(process.cwd(), envFile);
  if (fs.existsSync(fullPath)) {
    const lines = fs.readFileSync(fullPath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
      }
    }
  }
}

import { ensureSchemaAndSeed } from "../src/lib/init-db";
import { query } from "../src/lib/db";

async function main() {
  console.log("🪄 Initializing Good Diagon Alley database on Neon Postgres...");
  await ensureSchemaAndSeed(true);

  const cats = await query(`SELECT COUNT(*)::int AS cnt FROM categories`);
  const prods = await query(`SELECT COUNT(*)::int AS cnt FROM products`);
  const questions = await query(`SELECT COUNT(*)::int AS cnt FROM quiz_questions`);
  const users = await query(`SELECT COUNT(*)::int AS cnt FROM users`);

  console.log(`✅ Categories seeded: ${cats.rows[0].cnt}`);
  console.log(`✅ Products seeded: ${prods.rows[0].cnt}`);
  console.log(`✅ Trivia Questions (RU) seeded: ${questions.rows[0].cnt}`);
  console.log(`✅ Wizard Accounts seeded: ${users.rows[0].cnt}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Seed error:", err);
  process.exit(1);
});

