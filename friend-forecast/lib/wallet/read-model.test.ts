import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { loadWallet } from "./read-model";

const baseSnapshot = {
  activity_count: "2",
  balance: "925",
  ends_at: "2026-10-04T10:00:00.000Z",
  max_market_stake: 100,
  minimum_position: 10,
  next_weekly_grant_at: "2026-07-19T10:00:00.000Z",
  opening_grant: 1000,
  season_id: "season-one",
  season_name: "Season 1",
  starts_at: "2026-07-12T10:00:00.000Z",
  wallet_cap: 2000,
  weekly_grant: 200,
  weekly_grant_credited: 0,
  weekly_grant_due: false,
  weekly_grant_processed: false
};

function fakeSupabase(options: {
  activity?: unknown[];
  activityError?: unknown;
  snapshot?: unknown[] | null;
  snapshotError?: unknown;
}) {
  const query = {
    eq: vi.fn(() => query),
    limit: vi.fn().mockResolvedValue({ data: options.activity ?? [], error: options.activityError ?? null }),
    order: vi.fn(() => query),
    select: vi.fn(() => query)
  };

  return {
    client: {
      from: vi.fn(() => query),
      rpc: vi.fn().mockResolvedValue({ data: options.snapshot ?? null, error: options.snapshotError ?? null })
    } as unknown as SupabaseClient,
    query
  };
}

describe("loadWallet", () => {
  it("normalizes bigint strings and returns bounded activity", async () => {
    const { client, query } = fakeSupabase({
      snapshot: [baseSnapshot],
      activity: [
        {
          amount: -75,
          created_at: "2026-07-13T10:00:00.000Z",
          id: "entry-two",
          idempotency_key: "position-one",
          type: "position_debit"
        },
        {
          amount: 1000,
          created_at: "2026-07-12T10:00:00.000Z",
          id: "entry-one",
          idempotency_key: "opening-one",
          type: "opening_grant"
        }
      ]
    });

    const wallet = await loadWallet(client, "group-one", "user-one", 2);

    expect(wallet?.balance).toBe(925);
    expect(wallet?.activityCount).toBe(2);
    expect(wallet?.activity[0].type).toBe("position_debit");
    expect(query.limit).toHaveBeenCalledWith(2);
  });

  it("returns null when a group has no active season", async () => {
    const { client } = fakeSupabase({ snapshot: [] });
    await expect(loadWallet(client, "group-one", "user-one")).resolves.toBeNull();
    expect(client.from).not.toHaveBeenCalled();
  });

  it("distinguishes snapshot and activity failures", async () => {
    const snapshotFailure = fakeSupabase({ snapshotError: new Error("rpc failed") });
    await expect(loadWallet(snapshotFailure.client, "group-one", "user-one")).rejects.toThrow(
      "Wallet snapshot is unavailable."
    );

    const activityFailure = fakeSupabase({ snapshot: [baseSnapshot], activityError: new Error("query failed") });
    await expect(loadWallet(activityFailure.client, "group-one", "user-one")).rejects.toThrow(
      "Wallet activity is unavailable."
    );
  });

  it("rejects unknown ledger types and unsafe bigint values", async () => {
    const invalidType = fakeSupabase({
      snapshot: [{ ...baseSnapshot, activity_count: 1 }],
      activity: [
        {
          amount: 1,
          created_at: "2026-07-12T10:00:00.000Z",
          id: "entry",
          idempotency_key: "key",
          type: "mystery"
        }
      ]
    });
    await expect(loadWallet(invalidType.client, "group-one", "user-one")).rejects.toThrow(
      "Unsupported wallet entry type"
    );

    const unsafeBalance = fakeSupabase({ snapshot: [{ ...baseSnapshot, balance: "9007199254740992" }] });
    await expect(loadWallet(unsafeBalance.client, "group-one", "user-one")).rejects.toThrow("safe integers");
  });
});
