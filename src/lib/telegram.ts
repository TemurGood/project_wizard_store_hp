import { query } from "./db";

const getBotToken = () => process.env.TELEGRAM_BOT_TOKEN || "";
const getAdminId = () => process.env.TELEGRAM_ADMIN_ID || "3540653";

export async function sendTelegramMessage(
  chatId: string | number,
  text: string,
  extra?: Record<string, any>
): Promise<any> {
  const token = getBotToken();
  if (!token) {
    console.warn("[Telegram] TELEGRAM_BOT_TOKEN not configured");
    return { ok: false, error: "No token" };
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        ...extra,
      }),
    });
    return await res.json();
  } catch (err: any) {
    console.error("[Telegram sendMessage Error]:", err.message);
    return { ok: false, error: err.message };
  }
}

export async function notifyBuyerOrderShipped(order: {
  id: string;
  customer_login: string;
  telegram_chat_id?: string | null;
  delivery_address?: string | null;
  total_usd?: string | number;
}) {
  const results: any = {};

  if (order.telegram_chat_id) {
    results.buyer = await sendTelegramMessage(
      order.telegram_chat_id,
      `🦉 <b>Ваш заказ отправлен совиной почтой! 🦉</b>\n\n` +
        `📜 <b>Заказ:</b> <code>${order.id}</code>\n` +
        `🧙‍♂️ <b>Получатель:</b> ${order.customer_login}\n` +
        `📍 <b>Адрес доставки:</b> ${order.delivery_address || "Косой Переулок (Указан в профиле)"}\n\n` +
        `✨ Почтовая сова Букля уже в пути! Благодарим за покупку в <b>Good Diagon Alley</b>!`
    );
  }

  // Also notify Admin (3540653) that the order was marked as shipped
  const adminId = getAdminId();
  if (adminId) {
    results.admin = await sendTelegramMessage(
      adminId,
      `✅ <b>Заказ #${order.id} отмечен как ОТПРАВЛЕННЫЙ!</b>\n` +
        `Покупатель: <b>${order.customer_login}</b>\n` +
        `Статус: <i>Ваш заказ отправлен совиной почтой! 🦉</i>`
    );
  }

  return results;
}

export async function processTelegramUpdate(update: any): Promise<{
  handled: boolean;
  action?: string;
  orderId?: string;
}> {
  try {
    // 1. Handle Inline Button Callback from Admin (e.g., ship_<ORDER_ID>)
    if (update.callback_query) {
      const cb = update.callback_query;
      const data: string = cb.data || "";
      const chatId = cb.message?.chat?.id;

      if (data.startsWith("ship_")) {
        const orderId = data.replace("ship_", "").trim();
        const { rows } = await query(
          `UPDATE orders
           SET status = 'Отправлен совиной почтой 🦉', shipped_at = NOW()
           WHERE id = $1
           RETURNING *`,
          [orderId]
        );

        if (rows.length > 0) {
          const order = rows[0];
          await notifyBuyerOrderShipped(order);
          if (chatId) {
            await sendTelegramMessage(
              chatId,
              `🦉 Заказ <code>${orderId}</code> успешно отправлен покупателю!`
            );
          }
          return { handled: true, action: "shipped_via_callback", orderId };
        }
      }
      return { handled: false };
    }

    const message = update.message;
    if (!message || !message.chat) return { handled: false };

    const chatId = String(message.chat.id);
    const text: string = (message.text || "").trim();

    // 2. Handle /start order_<ORDER_ID>
    if (text.startsWith("/start")) {
      const parts = text.split(/\s+/);
      const payload = parts[1] || "";

      if (payload.startsWith("order_")) {
        const orderId = payload.replace("order_", "").trim();
        const { rows } = await query(`SELECT * FROM orders WHERE id = $1`, [
          orderId,
        ]);

        if (rows.length === 0) {
          await sendTelegramMessage(
            chatId,
            `🔮 <b>Добро пожаловать в лавку "Good Diagon Alley"!</b>\n\n` +
              `К сожалению, свиток заказа <code>${orderId}</code> не найден в архивах Гринготтса.`
          );
          return { handled: true, action: "order_not_found", orderId };
        }

        const order = rows[0];
        // Link this Telegram chat_id to the order and user
        await query(
          `UPDATE orders SET telegram_chat_id = $1 WHERE id = $2`,
          [chatId, orderId]
        );
        if (order.user_id) {
          await query(
            `UPDATE users SET telegram_chat_id = $1 WHERE id = $2`,
            [chatId, order.user_id]
          );
        }

        let itemsList = "";
        try {
          const items =
            typeof order.items_json === "string"
              ? JSON.parse(order.items_json)
              : order.items_json;
          if (Array.isArray(items)) {
            itemsList = items
              .map((i: any) => `• ${i.title} × ${i.quantity} ($${Number(i.price_usd * i.quantity).toFixed(2)})`)
              .join("\n");
          }
        } catch {
          itemsList = "• Магические артефакты Косого Переулка";
        }

        await sendTelegramMessage(
          chatId,
          `🕯 <b>Приветствуем в "Good Diagon Alley", ${order.customer_login}!</b>\n\n` +
            `📜 <b>Детали вашего заказа:</b>\n` +
            `Номер заказа: <code>${order.id}</code>\n` +
            `Метод оплаты: <b>${String(order.payment_provider).toUpperCase()}</b>\n` +
            `Сумма: <b>$${Number(order.total_usd).toFixed(2)}</b> (${Number(order.total_uzs).toLocaleString("ru-RU")} сум)\n` +
            `Текущий статус: <b>Оплачено / Ожидает локацию доставки</b>\n\n` +
            `📦 <b>Состав заказа:</b>\n${itemsList}\n\n` +
            `🦉 <b>Куда направить почтовую сову?</b>\n` +
            `Пожалуйста, отправьте ваш <b>Адрес доставки текстом</b> (например: <i>г. Ташкент, ул. Навои 15, кв 42</i>) ИЛИ нажмите кнопку ниже, чтобы отправить <b>Геолокацию (Location pin)</b>:`,
          {
            reply_markup: {
              keyboard: [
                [
                  {
                    text: "📍 Отправить геолокацию для Совиной Почты",
                    request_location: true,
                  },
                ],
              ],
              resize_keyboard: true,
              one_time_keyboard: true,
            },
          }
        );

        return { handled: true, action: "start_order", orderId };
      }

      // Generic /start
      await sendTelegramMessage(
        chatId,
        `🧙‍♂️ <b>Добро пожаловать в официальный бот "Good Diagon Alley"!</b>\n\n` +
          `Оформите и оплатите заказ на сайте, затем перейдите по ссылке из квитанции, чтобы указать адрес для Совиной Почты! 🦉`
      );
      return { handled: true, action: "start_generic" };
    }

    // 3. Handle Location Pin or Text Delivery Address
    const hasLocation = Boolean(message.location);
    const isAddressText = text.length > 3 && !text.startsWith("/");

    if (hasLocation || isAddressText) {
      let formattedAddress = text;
      let lat: number | null = null;
      let lng: number | null = null;

      if (hasLocation) {
        lat = Number(message.location.latitude);
        lng = Number(message.location.longitude);
        formattedAddress = `📍 Координаты: ${lat.toFixed(5)}, ${lng.toFixed(5)} (Карта Мародёров)`;
      }

      // Find the latest order linked to this chat_id (or most recent order awaiting location)
      let orderRes = await query(
        `SELECT * FROM orders WHERE telegram_chat_id = $1 ORDER BY paid_at DESC LIMIT 1`,
        [chatId]
      );
      if (orderRes.rows.length === 0) {
        orderRes = await query(
          `SELECT * FROM orders WHERE status = 'Paid - Awaiting Delivery Location' ORDER BY paid_at DESC LIMIT 1`
        );
      }

      if (orderRes.rows.length > 0) {
        const order = orderRes.rows[0];
        await query(
          `UPDATE orders
           SET delivery_address = $1,
               delivery_lat = COALESCE($2, delivery_lat),
               delivery_lng = COALESCE($3, delivery_lng),
               telegram_chat_id = $4,
               status = 'Готовится к отправке'
           WHERE id = $5`,
          [formattedAddress, lat, lng, chatId, order.id]
        );

        if (order.user_id) {
          await query(
            `UPDATE users
             SET delivery_address = $1,
                 delivery_lat = COALESCE($2, delivery_lat),
                 delivery_lng = COALESCE($3, delivery_lng),
                 telegram_chat_id = $4
             WHERE id = $5`,
            [formattedAddress, lat, lng, chatId, order.user_id]
          );
        }

        // Confirm to buyer
        await sendTelegramMessage(
          chatId,
          `✨ <b>Локация доставки сохранена в магическом реестре!</b>\n\n` +
            `📜 <b>Заказ:</b> <code>${order.id}</code>\n` +
            `📍 <b>Адрес:</b> ${formattedAddress}\n` +
            `📦 <b>Новый статус:</b> <b>Готовится к отправке</b>\n\n` +
            `Мы уведомим вас, как только Хранитель Лавки отправит вашу сову! 🦉`,
          {
            reply_markup: { remove_keyboard: true },
          }
        );

        // Send instant notification to Admin (3540653)
        const adminId = getAdminId();
        if (adminId) {
          await sendTelegramMessage(
            adminId,
            `🔔 <b>НОВАЯ ЛОКАЦИЯ ДОСТАВКИ ПОЛУЧЕНА!</b>\n\n` +
              `📜 <b>Заказ:</b> <code>${order.id}</code>\n` +
              `👤 <b>Покупатель:</b> ${order.customer_login} (${order.customer_phone || order.customer_email})\n` +
              `💳 <b>Оплата:</b> ${String(order.payment_provider).toUpperCase()} — $${Number(order.total_usd).toFixed(2)}\n` +
              `📍 <b>Адрес доставки:</b> ${formattedAddress}\n` +
              `📦 <b>Статус заказа:</b> Готовится к отправке`,
            {
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: "🦉 Отправить заказ (Mark as Shipped)",
                      callback_data: `ship_${order.id}`,
                    },
                  ],
                ],
              },
            }
          );
        }

        return { handled: true, action: "location_saved", orderId: order.id };
      } else {
        await sendTelegramMessage(
          chatId,
          `⚠️ Активный оплаченный заказ не найден. Пожалуйста, перейдите по ссылке из чека оплаты на сайте!`
        );
        return { handled: true, action: "no_active_order" };
      }
    }

    return { handled: false };
  } catch (err: any) {
    console.error("[processTelegramUpdate Error]:", err.message);
    return { handled: false };
  }
}

