import fs from "fs";
import path from "path";

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

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000";

function assert(cond: any, message: string) {
  if (!cond) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

async function runTests() {
  console.log(`🧪 Running End-to-End Verification against ${BASE_URL}...`);

  // 1. Storefront & 6 Categories
  const prodRes = await fetch(`${BASE_URL}/api/products`);
  assert(prodRes.ok, "GET /api/products should return 200");
  const prodData = await prodRes.json();
  assert(
    prodData.categories.length === 6,
    `Expected 6 categories, got ${prodData.categories.length}`
  );
  assert(
    prodData.products.length >= 36,
    `Expected >= 36 products across 6 categories, got ${prodData.products.length}`
  );
  console.log(
    `✅ [1/8] Storefront verified: ${prodData.categories.length} categories, ${prodData.products.length} products.`
  );

  // 2. Neon Object Storage Upload & Download
  const tinyPngBase64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const uploadRes = await fetch(`${BASE_URL}/api/upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: "test-wand.png",
      base64: tinyPngBase64,
      contentType: "image/png",
    }),
  });
  assert(uploadRes.ok, "POST /api/upload to Neon Object Storage should succeed");
  const uploadData = await uploadRes.json();
  assert(uploadData.key && uploadData.url, "Upload should return key and url");

  const storageGetRes = await fetch(`${BASE_URL}${uploadData.url}`);
  assert(
    storageGetRes.ok,
    `GET ${uploadData.url} from Neon Object Storage should return 200`
  );
  console.log(
    `✅ [2/8] Neon Object Storage verified: uploaded & downloaded ${uploadData.key}.`
  );

  // 3. Admin Product Creation, Edit & Delete
  const createProdRes = await fetch(`${BASE_URL}/api/products`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Тестовый Артефакт Гриффиндора (E2E)",
      category_slug: "artifacts",
      price_usd: 99,
      discount_percent: 15,
      lore_description: "Тестовое описание артефакта для проверки Админ-панели.",
      image_url: uploadData.url,
      storage_key: uploadData.key,
    }),
  });
  assert(createProdRes.ok, "POST /api/products (Admin Create) should return 201");
  const createdProd = (await createProdRes.json()).product;

  const editProdRes = await fetch(`${BASE_URL}/api/products/${createdProd.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ discount_percent: 25 }),
  });
  assert(editProdRes.ok, "PUT /api/products/[id] (Admin Edit) should return 200");

  const delProdRes = await fetch(`${BASE_URL}/api/products/${createdProd.id}`, {
    method: "DELETE",
  });
  assert(delProdRes.ok, "DELETE /api/products/[id] (Admin Delete) should return 200");
  console.log(
    `✅ [3/8] Admin CRUD verified: created, updated discount, and deleted product #${createdProd.id}.`
  );

  // 4. User Registration / Login & Favorites
  const testLogin = `Wizard_${Date.now().toString().slice(-5)}`;
  const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      login: testLogin,
      email: `${testLogin.toLowerCase()}@hogwarts.ac.uk`,
      phone: "+998 90 777 88 99",
      password: "secret123",
      first_name: "Темур",
      last_name: "Маг",
      age: 20,
    }),
  });
  assert(regRes.ok, "POST /api/auth/register should return 201");
  const testUser = (await regRes.json()).user;

  const favRes = await fetch(`${BASE_URL}/api/favorites`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId: testUser.id,
      productId: prodData.products[0].id,
    }),
  });
  assert(favRes.ok, "POST /api/favorites should succeed");
  console.log(
    `✅ [4/8] User Account & Favorites verified: registered ${testUser.login} (ID #${testUser.id}).`
  );

  // 5. Stripe Test Checkout Flow (Verify order NOT in orders before payment, then saved AFTER webhook)
  const pendingStripeRes = await fetch(`${BASE_URL}/api/checkout/pending`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: testUser.id,
      customer_login: testUser.login,
      customer_email: testUser.email,
      customer_phone: testUser.phone,
      items: [
        {
          id: prodData.products[0].id,
          title: prodData.products[0].title,
          quantity: 1,
          price_usd: 85,
          final_price_usd: 76.5,
        },
      ],
      promo_code: "LUMOS10",
      currency: "USD",
      payment_provider: "stripe",
    }),
  });
  assert(pendingStripeRes.ok, "POST /api/checkout/pending (Stripe) should succeed");
  const pendingStripe = (await pendingStripeRes.json()).checkout;

  // Verify no order exists for this checkout_id yet
  const ordersBeforeRes = await fetch(
    `${BASE_URL}/api/orders?userId=${testUser.id}`
  );
  const ordersBefore = (await ordersBeforeRes.json()).orders;
  assert(
    !ordersBefore.some((o: any) => o.checkout_id === pendingStripe.id),
    "Order MUST NOT exist in orders table before payment confirmation!"
  );

  // Now trigger Stripe Test Webhook (4242 4242 4242 4242)
  const stripeWebhookRes = await fetch(`${BASE_URL}/api/webhooks/stripe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "checkout.session.completed",
      data: {
        object: {
          id: `cs_test_${Date.now()}`,
          client_reference_id: pendingStripe.id,
          card_number: "4242 4242 4242 4242",
        },
      },
    }),
  });
  assert(stripeWebhookRes.ok, "POST /api/webhooks/stripe should return 200");
  const stripeResult = await stripeWebhookRes.json();
  assert(
    stripeResult.order &&
      stripeResult.order.status === "Paid - Awaiting Delivery Location",
    "Stripe order should be saved with status 'Paid - Awaiting Delivery Location'"
  );
  console.log(
    `✅ [5/8] Stripe Test Checkout verified: Order ${stripeResult.order.id} saved ONLY after payment.`
  );

  // 6. Payme Sandbox Checkout Flow (8600 0000 0000 0000 + SMS 666666)
  const pendingPaymeRes = await fetch(`${BASE_URL}/api/checkout/pending`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: testUser.id,
      customer_login: testUser.login,
      customer_email: testUser.email,
      customer_phone: testUser.phone,
      items: [
        {
          id: prodData.products[1].id,
          title: prodData.products[1].title,
          quantity: 1,
          price_usd: 88,
          final_price_usd: 88,
        },
      ],
      promo_code: "ALOHOMORA",
      currency: "UZS",
      payment_provider: "payme",
    }),
  });
  const pendingPayme = (await pendingPaymeRes.json()).checkout;

  const paymePerformRes = await fetch(`${BASE_URL}/api/webhooks/payme`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 10,
      method: "PerformTransaction",
      params: {
        id: `payme_tx_${Date.now()}`,
        card_number: "8600 0000 0000 0000",
        sms_code: "666666",
        account: { checkout_id: pendingPayme.id },
      },
    }),
  });
  assert(paymePerformRes.ok, "POST /api/webhooks/payme should return 200");
  const paymeData = await paymePerformRes.json();
  assert(
    paymeData.result?.order?.id,
    "Payme PerformTransaction should create and return paid order"
  );
  console.log(
    `✅ [6/8] Payme Sandbox JSON-RPC verified: Order ${paymeData.result.order.id} saved to DB.`
  );

  // 7. Telegram Bot Delivery Flow + Admin Mark as Shipped
  const orderIdToDeliver = stripeResult.order.id;
  await fetch(`${BASE_URL}/api/telegram/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        chat: { id: 3540653 },
        text: `/start order_${orderIdToDeliver}`,
      },
    }),
  });

  const locRes = await fetch(`${BASE_URL}/api/telegram/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        chat: { id: 3540653 },
        text: "г. Ташкент, ул. Амира Темура 108, кв. 12",
      },
    }),
  });
  assert(locRes.ok, "Telegram location update should succeed");

  const shipRes = await fetch(
    `${BASE_URL}/api/orders/${orderIdToDeliver}/ship`,
    { method: "POST" }
  );
  assert(shipRes.ok, "Admin Mark as Shipped should succeed");
  const shippedData = await shipRes.json();
  assert(
    shippedData.order.status.includes("Отправлен совиной почтой"),
    "Order status should be updated to 'Отправлен совиной почтой 🦉'"
  );
  console.log(
    `✅ [7/8] Telegram Bot & Admin Shipping verified: Order ${orderIdToDeliver} -> "${shippedData.order.status}".`
  );

  // 8. Mini-Games (Sorting Hat gender rule + 250-question Trivia + Neon Realtime Sealing)
  const sortMaleRes = await fetch(`${BASE_URL}/api/sorting`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId: testUser.id,
      gender: "male",
      answers: [0, 1, 1, 1, 1, 2, 0, 1, 1, 0], // Heavy Durmstrang weights
    }),
  });
  const sortMaleData = await sortMaleRes.json();
  assert(
    sortMaleData.sortedHouse.key !== "Beauxbatons",
    "Male wizard must NEVER be routed to Beauxbatons"
  );

  const sortFemaleRes = await fetch(`${BASE_URL}/api/sorting`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId: testUser.id,
      gender: "female",
      answers: [1, 1, 1, 1, 1, 2, 0, 1, 1, 0], // Even with Durmstrang answers, female cannot go to Durmstrang
    }),
  });
  const sortFemaleData = await sortFemaleRes.json();
  assert(
    sortFemaleData.sortedHouse.key !== "Durmstrang",
    "Female wizard must NEVER be routed to Durmstrang"
  );

  const triviaGetRes = await fetch(`${BASE_URL}/api/trivia?count=10`);
  const triviaGetData = await triviaGetRes.json();
  assert(
    triviaGetData.totalPoolSize >= 250 && triviaGetData.questions.length === 10,
    `Expected >=250 pool and 10 questions, got pool=${triviaGetData.totalPoolSize}, len=${triviaGetData.questions.length}`
  );

  const triviaPostRes = await fetch(`${BASE_URL}/api/trivia`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId: testUser.id,
      sessionScore: 180,
      accuracyPercent: 90,
    }),
  });
  const triviaPostData = await triviaPostRes.json();
  assert(
    triviaPostData.wizardRank.includes("Староста"),
    `Expected rank Староста (Prefect) for 180 pts, got ${triviaPostData.wizardRank}`
  );

  const sealRes = await fetch(`${BASE_URL}/api/realtime/seal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "leaderboard" }),
  });
  assert(sealRes.ok, "POST /api/realtime/seal should succeed");
  const sealData = await sealRes.json();
  assert(
    sealData.sealed?.capability && sealData.sealed?.queryFingerprint,
    "Neon Realtime seal should return capability and queryFingerprint"
  );

  console.log(
    `✅ [8/8] Sorting Hat, Trivia (${triviaGetData.totalPoolSize} RU questions), Ranks & Neon Realtime verified!`
  );
  console.log("\n🎉 ALL 8 END-TO-END VERIFICATION SUITES PASSED WITH ZERO ERRORS!");
}

runTests().catch((err) => {
  console.error("❌ E2E Verification Failed:", err);
  process.exit(1);
});

