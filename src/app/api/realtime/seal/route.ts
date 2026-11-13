import { NextRequest, NextResponse } from "next/server";
import {
  getRealtimeServer,
  liveLeaderboardQuery,
  liveOrdersQuery,
  liveUserOrdersQuery,
} from "@/lib/realtime";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type = "leaderboard", userId } = body;
    const realtime = getRealtimeServer();

    if (type === "orders") {
      const sealed = await realtime.seal({ query: liveOrdersQuery });
      return NextResponse.json({ sealed });
    }

    if (type === "user_orders" && userId) {
      const sealed = await realtime.seal({
        query: liveUserOrdersQuery(Number(userId)),
      });
      return NextResponse.json({ sealed });
    }

    const sealed = await realtime.seal({ query: liveLeaderboardQuery });
    return NextResponse.json({ sealed });
  } catch (err: any) {
    console.error("[POST /api/realtime/seal Error]:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

