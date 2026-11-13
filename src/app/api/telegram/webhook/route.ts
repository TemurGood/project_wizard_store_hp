import { NextRequest, NextResponse } from "next/server";
import { processTelegramUpdate } from "@/lib/telegram";

let lastUpdateId = 0;

/**
 * POST /api/telegram/webhook
 * Receives standard Telegram Bot Webhook updates (and simulated updates from UI/tests)
 */
export async function POST(req: NextRequest) {
  try {
    const update = await req.json();
    const result = await processTelegramUpdate(update);
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    console.error("[POST /api/telegram/webhook Error]:", err.message);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

/**
 * GET /api/telegram/webhook
 * Polls recent updates from Telegram API (`getUpdates`) when running locally or before webhook registration,
 * or registers webhook if `?setWebhook=<url>` is passed.
 */
export async function GET(req: NextRequest) {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      return NextResponse.json({ ok: false, error: "TELEGRAM_BOT_TOKEN not set" });
    }

    const { searchParams } = new URL(req.url);
    const webhookUrl = searchParams.get("setWebhook");

    if (webhookUrl) {
      const res = await fetch(
        `https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(
          webhookUrl
        )}`
      );
      const data = await res.json();
      return NextResponse.json(data);
    }

    // Otherwise poll getUpdates so messages sent to @wizard_HP_store_bot are processed automatically!
    const offsetParam = lastUpdateId ? `?offset=${lastUpdateId + 1}&timeout=1` : "?timeout=1";
    const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates${offsetParam}`);
    const data = await res.json();

    const processed: any[] = [];
    if (data.ok && Array.isArray(data.result)) {
      for (const upd of data.result) {
        if (upd.update_id > lastUpdateId) {
          lastUpdateId = upd.update_id;
        }
        const outcome = await processTelegramUpdate(upd);
        processed.push({ update_id: upd.update_id, ...outcome });
      }
    }

    return NextResponse.json({
      ok: true,
      polled: processed.length,
      processed,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

