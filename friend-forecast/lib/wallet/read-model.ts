import type { SupabaseClient } from "@supabase/supabase-js";

import {
  coerceLedgerInteger,
  isWalletLedgerType,
  type WalletLedgerType
} from "./ledger";

type SnapshotRow = {
  activity_count: number | string;
  balance: number | string;
  ends_at: string;
  max_market_stake: number;
  minimum_position: number;
  next_weekly_grant_at: string;
  opening_grant: number;
  season_id: string;
  season_name: string;
  starts_at: string;
  wallet_cap: number;
  weekly_grant: number;
  weekly_grant_credited: number;
  weekly_grant_due: boolean;
  weekly_grant_processed: boolean;
};

type ActivityRow = {
  amount: number;
  created_at: string;
  id: string;
  idempotency_key: string;
  type: string;
};

export type WalletActivity = {
  amount: number;
  createdAt: string;
  id: string;
  idempotencyKey: string;
  type: WalletLedgerType;
};

export type WalletReadModel = {
  activity: WalletActivity[];
  activityCount: number;
  balance: number;
  endsAt: string;
  maxMarketStake: number;
  minimumPosition: number;
  nextWeeklyGrantAt: string;
  openingGrant: number;
  seasonId: string;
  seasonName: string;
  startsAt: string;
  walletCap: number;
  weeklyGrant: number;
  weeklyGrantCredited: number;
  weeklyGrantDue: boolean;
  weeklyGrantProcessed: boolean;
};

export async function loadWallet(
  supabase: SupabaseClient,
  groupId: string,
  userId: string,
  activityLimit = 50
): Promise<WalletReadModel | null> {
  const { data: snapshotData, error: snapshotError } = await supabase.rpc("get_wallet_snapshot", {
    target_group_id: groupId
  });

  if (snapshotError) {
    throw new Error("Wallet snapshot is unavailable.", { cause: snapshotError });
  }

  const snapshot = ((snapshotData as SnapshotRow[] | null) ?? [])[0];
  if (!snapshot) {
    return null;
  }

  const { data: activityData, error: activityError } = await supabase
    .from("wallet_ledger_entries")
    .select("id, type, amount, idempotency_key, created_at")
    .eq("group_id", groupId)
    .eq("season_id", snapshot.season_id)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(activityLimit);

  if (activityError) {
    throw new Error("Wallet activity is unavailable.", { cause: activityError });
  }

  const activity = ((activityData as ActivityRow[] | null) ?? []).map((row): WalletActivity => {
    if (!isWalletLedgerType(row.type)) {
      throw new Error(`Unsupported wallet entry type: ${row.type}`);
    }

    return {
      amount: coerceLedgerInteger(row.amount),
      createdAt: row.created_at,
      id: row.id,
      idempotencyKey: row.idempotency_key,
      type: row.type
    };
  });

  const snapshotBalance = coerceLedgerInteger(snapshot.balance);
  const snapshotActivityCount = coerceLedgerInteger(snapshot.activity_count);

  return {
    activity,
    activityCount: snapshotActivityCount,
    balance: snapshotBalance,
    endsAt: snapshot.ends_at,
    maxMarketStake: coerceLedgerInteger(snapshot.max_market_stake),
    minimumPosition: coerceLedgerInteger(snapshot.minimum_position),
    nextWeeklyGrantAt: snapshot.next_weekly_grant_at,
    openingGrant: coerceLedgerInteger(snapshot.opening_grant),
    seasonId: snapshot.season_id,
    seasonName: snapshot.season_name,
    startsAt: snapshot.starts_at,
    walletCap: coerceLedgerInteger(snapshot.wallet_cap),
    weeklyGrant: coerceLedgerInteger(snapshot.weekly_grant),
    weeklyGrantCredited: coerceLedgerInteger(snapshot.weekly_grant_credited),
    weeklyGrantDue: snapshot.weekly_grant_due,
    weeklyGrantProcessed: snapshot.weekly_grant_processed
  };
}
