import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { notifyBuyerOrderShipped } from "@/lib/telegram";

export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    const { rows } = await query(
      `UPDATE orders
       SET status = 'Отправлен совиной почтой 🦉',
           shipped_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });
    }

    const updatedOrder = rows[0];
    const telegramResult = await notifyBuyerOrderShipped(updatedOrder);

    return NextResponse.json({
      order: updatedOrder,
      telegram_notification: telegramResult,
      message: "Ваш заказ отправлен совиной почтой! 🦉",
    });
  } catch (err: any) {
    console.error("[POST /api/orders/[id]/ship Error]:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

