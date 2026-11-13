import { query, calculateWizardRank } from "./db";
import { SEED_CATEGORIES, SEED_PRODUCTS } from "../data/products-seed";
import { ALL_TRIVIA_QUESTIONS } from "../data/trivia-questions";

let initialized = false;

export async function ensureSchemaAndSeed(forceReseed = false) {
  if (initialized && !forceReseed) return;

  // 1. Create tables (All tables have primary keys and no RLS so Neon Realtime works seamlessly)
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      login VARCHAR(100) UNIQUE NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      phone VARCHAR(60) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      first_name VARCHAR(100),
      last_name VARCHAR(100),
      age INTEGER,
      gender VARCHAR(20),
      house VARCHAR(60),
      trivia_score INTEGER NOT NULL DEFAULT 0,
      wizard_rank VARCHAR(120) NOT NULL DEFAULT 'Магл (Muggle)',
      games_played INTEGER NOT NULL DEFAULT 0,
      delivery_address TEXT,
      delivery_lat DOUBLE PRECISION,
      delivery_lng DOUBLE PRECISION,
      telegram_chat_id VARCHAR(80),
      role VARCHAR(30) NOT NULL DEFAULT 'user',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS categories (
      id SERIAL PRIMARY KEY,
      slug VARCHAR(60) UNIQUE NOT NULL,
      name_ru VARCHAR(100) NOT NULL,
      name_en VARCHAR(100) NOT NULL,
      description TEXT,
      icon VARCHAR(30),
      sort_order INTEGER NOT NULL DEFAULT 0
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      category_slug VARCHAR(60) NOT NULL,
      category_name VARCHAR(100) NOT NULL,
      price_usd NUMERIC(10, 2) NOT NULL,
      discount_percent INTEGER NOT NULL DEFAULT 0,
      fixed_discount_usd NUMERIC(10, 2) NOT NULL DEFAULT 0,
      short_description TEXT,
      lore_description TEXT NOT NULL,
      image_url TEXT NOT NULL,
      storage_key VARCHAR(255),
      origin_wizard VARCHAR(180),
      rarity VARCHAR(100),
      stock INTEGER NOT NULL DEFAULT 20,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS favorites (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, product_id)
    );
  `);

  // CRITICAL HOMEWORK REQUIREMENT:
  // Before payment confirmation, checkouts stay ONLY in pending_checkouts!
  await query(`
    CREATE TABLE IF NOT EXISTS pending_checkouts (
      id VARCHAR(100) PRIMARY KEY,
      user_id INTEGER,
      customer_login VARCHAR(100) NOT NULL,
      customer_email VARCHAR(255) NOT NULL,
      customer_phone VARCHAR(60) NOT NULL,
      items_json JSONB NOT NULL,
      subtotal_usd NUMERIC(10, 2) NOT NULL,
      discount_usd NUMERIC(10, 2) NOT NULL DEFAULT 0,
      promo_code VARCHAR(60),
      total_usd NUMERIC(10, 2) NOT NULL,
      total_uzs NUMERIC(14, 0) NOT NULL,
      currency VARCHAR(10) NOT NULL DEFAULT 'USD',
      payment_provider VARCHAR(40) NOT NULL,
      provider_tx_id VARCHAR(120),
      provider_state INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Final orders table — populated ONLY after verified payment webhook/callback!
  await query(`
    CREATE TABLE IF NOT EXISTS orders (
      id VARCHAR(80) PRIMARY KEY,
      checkout_id VARCHAR(100) UNIQUE,
      user_id INTEGER,
      customer_login VARCHAR(100) NOT NULL,
      customer_email VARCHAR(255) NOT NULL,
      customer_phone VARCHAR(60) NOT NULL,
      items_json JSONB NOT NULL,
      subtotal_usd NUMERIC(10, 2) NOT NULL,
      discount_usd NUMERIC(10, 2) NOT NULL DEFAULT 0,
      promo_code VARCHAR(60),
      total_usd NUMERIC(10, 2) NOT NULL,
      total_uzs NUMERIC(14, 0) NOT NULL,
      currency VARCHAR(10) NOT NULL DEFAULT 'USD',
      payment_provider VARCHAR(40) NOT NULL,
      payment_tx_id VARCHAR(120),
      status VARCHAR(120) NOT NULL DEFAULT 'Paid - Awaiting Delivery Location',
      delivery_address TEXT,
      delivery_lat DOUBLE PRECISION,
      delivery_lng DOUBLE PRECISION,
      telegram_chat_id VARCHAR(80),
      paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      shipped_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS quiz_questions (
      id SERIAL PRIMARY KEY,
      question_ru TEXT UNIQUE NOT NULL,
      options_json JSONB NOT NULL,
      correct_index INTEGER NOT NULL,
      category VARCHAR(80) NOT NULL,
      difficulty VARCHAR(30) NOT NULL DEFAULT 'medium',
      points INTEGER NOT NULL DEFAULT 20,
      explanation_ru TEXT
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS leaderboard_records (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      login VARCHAR(100) NOT NULL,
      house VARCHAR(60),
      wizard_rank VARCHAR(120) NOT NULL,
      score INTEGER NOT NULL,
      accuracy_percent INTEGER NOT NULL DEFAULT 100,
      played_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // 2. Seed categories
  for (const cat of SEED_CATEGORIES) {
    await query(
      `INSERT INTO categories (slug, name_ru, name_en, description, icon, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (slug) DO UPDATE SET
         name_ru = EXCLUDED.name_ru,
         name_en = EXCLUDED.name_en,
         description = EXCLUDED.description,
         icon = EXCLUDED.icon,
         sort_order = EXCLUDED.sort_order`,
      [cat.slug, cat.name_ru, cat.name_en, cat.description, cat.icon, cat.sort_order]
    );
  }

  // 3. Seed products if empty or forceReseed
  const prodCountRes = await query(`SELECT COUNT(*)::int AS cnt FROM products`);
  const prodCount = prodCountRes.rows[0]?.cnt || 0;
  if (prodCount === 0 || forceReseed) {
    if (forceReseed && prodCount > 0) {
      await query(`DELETE FROM products WHERE storage_key IS NULL`);
    }
    for (const p of SEED_PRODUCTS) {
      const exists = await query(`SELECT id FROM products WHERE title = $1 LIMIT 1`, [p.title]);
      if (exists.rows.length === 0) {
        await query(
          `INSERT INTO products (
            title, category_slug, category_name, price_usd, discount_percent, fixed_discount_usd,
            short_description, lore_description, image_url, origin_wizard, rarity, stock
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            p.title,
            p.category_slug,
            p.category_name,
            p.price_usd,
            p.discount_percent,
            p.fixed_discount_usd,
            p.short_description,
            p.lore_description,
            p.image_url,
            p.origin_wizard,
            p.rarity,
            p.stock,
          ]
        );
      }
    }
  }

  // 4. Seed 250+ trivia questions
  const qCountRes = await query(`SELECT COUNT(*)::int AS cnt FROM quiz_questions`);
  const qCount = qCountRes.rows[0]?.cnt || 0;
  if (qCount < 250 || forceReseed) {
    for (const q of ALL_TRIVIA_QUESTIONS) {
      await query(
        `INSERT INTO quiz_questions (question_ru, options_json, correct_index, category, difficulty, points, explanation_ru)
         VALUES ($1, $2::jsonb, $3, $4, $5, $6, $7)
         ON CONFLICT (question_ru) DO NOTHING`,
        [
          q.question_ru,
          JSON.stringify(q.options),
          q.correct_index,
          q.category,
          q.difficulty,
          q.points,
          q.explanation_ru,
        ]
      );
    }
  }

  // 5. Seed initial Wizard Profiles & Leaderboard Champions
  const initialWizards = [
    {
      login: "Albus_Dumbledore",
      email: "dumbledore@hogwarts.ac.uk",
      phone: "+44 7700 900001",
      first_name: "Альбус",
      last_name: "Дамблдор",
      age: 115,
      gender: "male",
      house: "Gryffindor",
      score: 680,
      games: 12,
      role: "admin",
      address: "Кабинет Директора, Северная башня Хогвартса",
    },
    {
      login: "Hermione_Granger",
      email: "hermione@hogwarts.ac.uk",
      phone: "+44 7700 900002",
      first_name: "Гермиона",
      last_name: "Грейнджер",
      age: 18,
      gender: "female",
      house: "Gryffindor",
      score: 620,
      games: 10,
      role: "user",
      address: "Гостиная Гриффиндора, 7 этаж",
    },
    {
      login: "Severus_Snape",
      email: "snape@hogwarts.ac.uk",
      phone: "+44 7700 900003",
      first_name: "Северус",
      last_name: "Снейп",
      age: 38,
      gender: "male",
      house: "Slytherin",
      score: 545,
      games: 9,
      role: "user",
      address: "Подземелья Зельеварения, Хогвартс",
    },
    {
      login: "Harry_Potter",
      email: "harry@hogwarts.ac.uk",
      phone: "+44 7700 900004",
      first_name: "Гарри",
      last_name: "Поттер",
      age: 17,
      gender: "male",
      house: "Gryffindor",
      score: 430,
      games: 8,
      role: "user",
      address: "Площадь Гриммо, дом 12, Лондон",
    },
    {
      login: "Viktor_Krum",
      email: "krum@durmstrang.edu",
      phone: "+359 88 900005",
      first_name: "Виктор",
      last_name: "Крам",
      age: 18,
      gender: "male",
      house: "Durmstrang",
      score: 360,
      games: 6,
      role: "user",
      address: "Корабль Института Дурмстранг, Северные фьорды",
    },
    {
      login: "Fleur_Delacour",
      email: "fleur@beauxbatons.fr",
      phone: "+33 6 900006",
      first_name: "Флёр",
      last_name: "Делакур",
      age: 18,
      gender: "female",
      house: "Beauxbatons",
      score: 325,
      games: 5,
      role: "user",
      address: "Коттедж «Ракушка», Тинворт",
    },
    {
      login: "Luna_Lovegood",
      email: "luna@hogwarts.ac.uk",
      phone: "+44 7700 900007",
      first_name: "Полумна",
      last_name: "Лавгуд",
      age: 17,
      gender: "female",
      house: "Ravenclaw",
      score: 280,
      games: 5,
      role: "user",
      address: "Башня Когтеврана, Хогвартс",
    },
    {
      login: "Cedric_Diggory",
      email: "cedric@hogwarts.ac.uk",
      phone: "+44 7700 900008",
      first_name: "Седрик",
      last_name: "Диггори",
      age: 17,
      gender: "male",
      house: "Hufflepuff",
      score: 245,
      games: 4,
      role: "user",
      address: "Гостиная Пуффендуя у кухонь Хогвартса",
    },
  ];

  for (const w of initialWizards) {
    const rank = calculateWizardRank(w.score);
    await query(
      `INSERT INTO users (
        login, email, phone, password_hash, first_name, last_name, age, gender,
        house, trivia_score, wizard_rank, games_played, delivery_address, role
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      ON CONFLICT (login) DO NOTHING`,
      [
        w.login,
        w.email,
        w.phone,
        "hogwarts123",
        w.first_name,
        w.last_name,
        w.age,
        w.gender,
        w.house,
        w.score,
        rank,
        w.games,
        w.address,
        w.role,
      ]
    );
  }

  initialized = true;
}

