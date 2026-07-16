"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { countdownIntervalMs, formatTimeRemaining } from "@/lib/markets/countdown";
import { createClient } from "@/lib/supabase/client";

type MarketLiveStatusProps = {
  marketId: string;
  tradingClosesAt: string;
};

/**
 * Advisory countdown plus realtime pool updates. Every refresh re-reads
 * server-authoritative state; the deadline itself is enforced in PostgreSQL.
 */
export function MarketLiveStatus({ marketId, tradingClosesAt }: MarketLiveStatusProps) {
  const router = useRouter();
  const deadline = new Date(tradingClosesAt).valueOf();
  const [label, setLabel] = useState(() => formatTimeRemaining(deadline - Date.now()));
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closedRefreshDoneRef = useRef(false);

  useEffect(() => {
    let tickTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    function scheduleRefresh() {
      if (refreshTimerRef.current !== null) {
        return;
      }
      refreshTimerRef.current = setTimeout(() => {
        refreshTimerRef.current = null;
        router.refresh();
      }, 400);
    }

    function tick() {
      if (cancelled) {
        return;
      }
      const remaining = deadline - Date.now();
      setLabel(formatTimeRemaining(remaining));
      if (remaining <= 0) {
        if (!closedRefreshDoneRef.current) {
          closedRefreshDoneRef.current = true;
          scheduleRefresh();
        }
        return;
      }
      tickTimer = setTimeout(tick, countdownIntervalMs(remaining));
    }

    tickTimer = setTimeout(tick, countdownIntervalMs(deadline - Date.now()));

    const supabase = createClient();
    let sawInterruption = false;
    const channel = supabase
      .channel(`market-live-${marketId}`)
      .on(
        "postgres_changes",
        { event: "*", filter: `market_id=eq.${marketId}`, schema: "public", table: "positions" },
        scheduleRefresh
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", filter: `id=eq.${marketId}`, schema: "public", table: "markets" },
        scheduleRefresh
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED" && sawInterruption) {
          sawInterruption = false;
          scheduleRefresh();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          sawInterruption = true;
        }
      });

    return () => {
      cancelled = true;
      if (tickTimer !== null) {
        clearTimeout(tickTimer);
      }
      if (refreshTimerRef.current !== null) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      supabase.removeChannel(channel);
    };
  }, [deadline, marketId, router]);

  return (
    <p className="market-countdown" role="status" aria-live="polite" suppressHydrationWarning>
      {label}
    </p>
  );
}
