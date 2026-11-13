"use client";

import React, { useCallback, useEffect, useState } from "react";
import { createRealtimeClient, type SealedLiveQuery } from "@neon/realtime/client";
import { RealtimeProvider, useLiveQuery } from "@neon/realtime-react";
import type { LiveLeaderboardRow, LiveOrderRow } from "@/lib/realtime";

interface SubscriberProps<T> {
  sealedQuery: SealedLiveQuery<T>;
  refreshQuery: () => Promise<SealedLiveQuery<T>>;
  onRows: (rows: readonly T[]) => void;
  onStatus?: (status: string) => void;
}

function LiveQueryBridge<T>({
  sealedQuery,
  refreshQuery,
  onRows,
  onStatus,
}: SubscriberProps<T>) {
  const { data, status } = useLiveQuery(sealedQuery, { refreshQuery });

  useEffect(() => {
    if (onStatus) onStatus(status);
  }, [status, onStatus]);

  useEffect(() => {
    if (data) {
      onRows(data);
    }
  }, [data, onRows]);

  return null;
}

interface RealtimeLiveSyncProps {
  onLeaderboardUpdate: (rows: readonly LiveLeaderboardRow[]) => void;
  onOrdersUpdate: (rows: readonly LiveOrderRow[]) => void;
  onStatusChange?: (status: string) => void;
}

export function RealtimeLiveSync({
  onLeaderboardUpdate,
  onOrdersUpdate,
  onStatusChange,
}: RealtimeLiveSyncProps) {
  const realtimeUrl = process.env.NEXT_PUBLIC_NEON_REALTIME_URL;

  const [client] = useState(() => {
    if (typeof window === "undefined" || !realtimeUrl) return null;
    try {
      return createRealtimeClient({ url: realtimeUrl });
    } catch {
      return null;
    }
  });

  const [sealedLb, setSealedLb] = useState<SealedLiveQuery<LiveLeaderboardRow> | null>(null);
  const [sealedOrders, setSealedOrders] = useState<SealedLiveQuery<LiveOrderRow> | null>(null);

  const fetchSealedLeaderboard = useCallback(async () => {
    const res = await fetch("/api/realtime/seal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "leaderboard" }),
    });
    if (!res.ok) throw new Error("Failed to seal leaderboard query");
    const json = await res.json();
    return json.sealed as SealedLiveQuery<LiveLeaderboardRow>;
  }, []);

  const fetchSealedOrders = useCallback(async () => {
    const res = await fetch("/api/realtime/seal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "orders" }),
    });
    if (!res.ok) throw new Error("Failed to seal orders query");
    const json = await res.json();
    return json.sealed as SealedLiveQuery<LiveOrderRow>;
  }, []);

  useEffect(() => {
    if (!client) return;
    let active = true;

    fetchSealedLeaderboard()
      .then((s) => {
        if (active) setSealedLb(s);
      })
      .catch(() => {});

    fetchSealedOrders()
      .then((s) => {
        if (active) setSealedOrders(s);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [client, fetchSealedLeaderboard, fetchSealedOrders]);

  if (!client) return null;

  return (
    <RealtimeProvider client={client}>
      {sealedLb && (
        <LiveQueryBridge
          sealedQuery={sealedLb}
          refreshQuery={fetchSealedLeaderboard}
          onRows={onLeaderboardUpdate}
          onStatus={onStatusChange}
        />
      )}
      {sealedOrders && (
        <LiveQueryBridge
          sealedQuery={sealedOrders}
          refreshQuery={fetchSealedOrders}
          onRows={onOrdersUpdate}
        />
      )}
    </RealtimeProvider>
  );
}

