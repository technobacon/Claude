// @vitest-environment node

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const OWNER_ID = "13000000-0000-4000-8000-000000000001";
const MEMBER_ID = "13000000-0000-4000-8000-000000000002";
const RIVAL_ID = "13000000-0000-4000-8000-000000000003";
const INTRUDER_ID = "13000000-0000-4000-8000-000000000004";

let database: PGlite;
let groupId: string;
let requestCounter = 1;

function requestId() {
  return `14000000-0000-4000-8000-${String(requestCounter++).padStart(12, "0")}`;
}

async function resetRole() {
  await database.exec("reset role;");
}

async function setAuthenticatedUser(userId: string) {
  await resetRole();
  await database.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
  await database.query("select set_config('request.jwt.claim.role', 'authenticated', false)");
  await database.exec("set role authenticated;");
}

async function createAuthUser(userId: string, displayName: string) {
  await resetRole();
  await database.query(
    "insert into auth.users (id, raw_user_meta_data) values ($1::uuid, jsonb_build_object('display_name', $2::text))",
    [userId, displayName]
  );
}

async function createOpenMarket(overrides: { creatorCanParticipate?: boolean; publish?: boolean } = {}) {
  await setAuthenticatedUser(OWNER_ID);
  const result = await database.query<{ market_id: string }>(
    `select public.create_market(
      $1::uuid, $2::uuid, 'sports',
      'Will Team Violet meet the official threshold tomorrow?',
      'YES if the official final result meets the threshold.',
      'NO if the official final result does not meet the threshold.',
      'Cancel if the official result is unavailable after 24 hours.',
      'The official event result page.', 'https://example.com/results',
      $3::timestamptz, $4::timestamptz, 'UTC', 'disputable', $5::boolean, 'independent', $6::boolean
    ) as market_id`,
    [
      groupId,
      requestId(),
      new Date(Date.now() + 86_400_000).toISOString(),
      new Date(Date.now() + 2 * 86_400_000).toISOString(),
      overrides.creatorCanParticipate ?? true,
      overrides.publish ?? true
    ]
  );
  return result.rows[0].market_id;
}

type CommitState = {
  no_backers: number;
  no_pool: number;
  position_points: number;
  position_side: string;
  transaction_id: string;
  undo_expires_at: string | null;
  wallet_balance: number;
  yes_backers: number;
  yes_pool: number;
};

async function commitPosition(userId: string, marketId: string, commitRequestId: string, side: string, points: number) {
  await setAuthenticatedUser(userId);
  const result = await database.query<CommitState>(
    "select * from public.commit_position($1::uuid, $2::uuid, $3::text, $4::integer)",
    [marketId, commitRequestId, side, points]
  );
  return result.rows[0];
}

async function undoCommit(userId: string, transactionId: string, undoRequestId: string) {
  await setAuthenticatedUser(userId);
  const result = await database.query<CommitState>(
    "select * from public.undo_position_commit($1::uuid, $2::uuid)",
    [transactionId, undoRequestId]
  );
  return result.rows[0];
}

async function walletBalance(userId: string) {
  await resetRole();
  const result = await database.query<{ balance: number }>(
    `select coalesce(sum(entry.amount), 0)::integer as balance
     from public.wallet_ledger_entries entry
     join public.seasons season on season.id = entry.season_id
     where entry.user_id = $1 and season.group_id = $2`,
    [userId, groupId]
  );
  return result.rows[0].balance;
}

beforeAll(async () => {
  database = await PGlite.create({ extensions: { pgcrypto } });
  await database.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin;
    create schema auth;
    create table auth.users (
      id uuid primary key,
      raw_user_meta_data jsonb not null default '{}'::jsonb
    );
    create or replace function auth.uid()
    returns uuid
    language sql
    stable
    as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    create or replace function auth.role()
    returns text
    language sql
    stable
    as $$
      select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon');
    $$;
  `);

  const migrationDirectory = path.join(process.cwd(), "supabase", "migrations");
  const migrationFiles = (await readdir(migrationDirectory)).filter((file) => file.endsWith(".sql")).sort();
  for (const migrationFile of migrationFiles) {
    await database.exec(await readFile(path.join(migrationDirectory, migrationFile), "utf8"));
  }

  await createAuthUser(OWNER_ID, "Owner");
  await createAuthUser(MEMBER_ID, "Member");
  await createAuthUser(RIVAL_ID, "Rival");
  await createAuthUser(INTRUDER_ID, "Intruder");
  await setAuthenticatedUser(OWNER_ID);
  const created = await database.query<{ group_id: string }>(
    "select public.create_group('Position Crew', 'violet', 'members') as group_id"
  );
  groupId = created.rows[0].group_id;

  await resetRole();
  await database.query(
    `insert into public.group_memberships (group_id, user_id, role, status)
     values ($1, $2, 'member', 'active'), ($1, $3, 'member', 'active')`,
    [groupId, MEMBER_ID, RIVAL_ID]
  );
  const season = await database.query<{ id: string }>(
    "select id from public.seasons where group_id = $1 and status = 'active'",
    [groupId]
  );
  for (const userId of [MEMBER_ID, RIVAL_ID]) {
    await database.query("select public.ensure_season_wallet($1, $2, null)", [season.rows[0].id, userId]);
  }
}, 60_000);

afterAll(async () => {
  await database?.close();
});

describe.sequential("position commitment PostgreSQL integration", () => {
  it("commits the first stake, locks the rules, debits the wallet, and moves the pool", async () => {
    const marketId = await createOpenMarket();
    const state = await commitPosition(MEMBER_ID, marketId, requestId(), "yes", 60);

    expect(state.position_side).toBe("yes");
    expect(Number(state.position_points)).toBe(60);
    expect(Number(state.wallet_balance)).toBe(940);
    expect(Number(state.yes_pool)).toBe(60);
    expect(Number(state.no_pool)).toBe(0);
    expect(state.undo_expires_at).not.toBeNull();

    await resetRole();
    const market = await database.query<{ first_stake_at: string | null; rules_locked_at: string | null }>(
      "select first_stake_at, rules_locked_at from public.markets where id = $1",
      [marketId]
    );
    expect(market.rows[0].first_stake_at).not.toBeNull();
    expect(market.rows[0].rules_locked_at).toStrictEqual(market.rows[0].first_stake_at);

    const snapshot = await database.query<{ count: number }>(
      "select count(*)::integer as count from public.market_rule_snapshots where market_id = $1",
      [marketId]
    );
    expect(snapshot.rows[0].count).toBe(1);

    const audit = await database.query<{ count: number }>(
      "select count(*)::integer as count from public.audit_events where market_id = $1 and event_type = 'position_committed'",
      [marketId]
    );
    expect(audit.rows[0].count).toBe(1);
  });

  it("replays duplicate commit requests without double-charging and rejects payload changes", async () => {
    const marketId = await createOpenMarket();
    const duplicateRequestId = requestId();
    const first = await commitPosition(MEMBER_ID, marketId, duplicateRequestId, "yes", 40);
    const replay = await commitPosition(MEMBER_ID, marketId, duplicateRequestId, "yes", 40);

    expect(replay.transaction_id).toBe(first.transaction_id);
    expect(Number(replay.position_points)).toBe(40);
    expect(Number(replay.yes_pool)).toBe(40);

    await expect(commitPosition(MEMBER_ID, marketId, duplicateRequestId, "yes", 41))
      .rejects.toThrow("different stake");
    await expect(commitPosition(MEMBER_ID, marketId, duplicateRequestId, "no", 40))
      .rejects.toThrow("different stake");

    await resetRole();
    const ledger = await database.query<{ count: number }>(
      "select count(*)::integer as count from public.wallet_ledger_entries where market_id = $1 and type = 'position_debit'",
      [marketId]
    );
    expect(ledger.rows[0].count).toBe(1);
  });

  it("aggregates same-side top-ups and refuses to switch sides", async () => {
    const marketId = await createOpenMarket();
    await commitPosition(MEMBER_ID, marketId, requestId(), "no", 30);
    const topUp = await commitPosition(MEMBER_ID, marketId, requestId(), "no", 5);

    expect(Number(topUp.position_points)).toBe(35);
    expect(Number(topUp.no_backers)).toBe(1);

    await expect(commitPosition(MEMBER_ID, marketId, requestId(), "yes", 20))
      .rejects.toThrow("cannot switch sides");

    const contested = await commitPosition(RIVAL_ID, marketId, requestId(), "yes", 65);
    expect(Number(contested.yes_pool)).toBe(65);
    expect(Number(contested.no_pool)).toBe(35);
    expect(Number(contested.yes_backers)).toBe(1);
    expect(Number(contested.no_backers)).toBe(1);
  });

  it("enforces the season minimum, per-market cap, and wallet balance", async () => {
    const marketId = await createOpenMarket();

    await expect(commitPosition(MEMBER_ID, marketId, requestId(), "yes", 9))
      .rejects.toThrow("start at 10");
    await expect(commitPosition(MEMBER_ID, marketId, requestId(), "yes", 101))
      .rejects.toThrow("capped at 100");
    await expect(commitPosition(MEMBER_ID, marketId, requestId(), "yes", 0))
      .rejects.toThrow("positive whole number");

    await commitPosition(MEMBER_ID, marketId, requestId(), "yes", 90);
    await expect(commitPosition(MEMBER_ID, marketId, requestId(), "yes", 11))
      .rejects.toThrow("capped at 100");

    await resetRole();
    const balance = await walletBalance(MEMBER_ID);
    const drained = await database.query<{ season_id: string }>(
      "select id as season_id from public.seasons where group_id = $1 and status = 'active'",
      [groupId]
    );
    await database.query(
      `insert into public.wallet_ledger_entries (user_id, group_id, season_id, type, amount, idempotency_key, metadata)
       values ($1, $2, $3, 'admin_adjustment', $4, $5, '{}'::jsonb)`,
      [MEMBER_ID, groupId, drained.rows[0].season_id, -(balance - 5), `drain:${requestCounter++}`]
    );

    const secondMarketId = await createOpenMarket();
    await expect(commitPosition(MEMBER_ID, secondMarketId, requestId(), "yes", 10))
      .rejects.toThrow("5 points available");

    await resetRole();
    await database.query(
      `insert into public.wallet_ledger_entries (user_id, group_id, season_id, type, amount, idempotency_key, metadata)
       values ($1, $2, $3, 'admin_adjustment', $4, $5, '{}'::jsonb)`,
      [MEMBER_ID, groupId, drained.rows[0].season_id, balance - 5, `restore:${requestCounter++}`]
    );
  });

  it("rejects stakes from non-members, sidelined creators, drafts, and expired deadlines", async () => {
    const marketId = await createOpenMarket();
    await expect(commitPosition(INTRUDER_ID, marketId, requestId(), "yes", 20))
      .rejects.toThrow("not found");

    const sidelinedMarketId = await createOpenMarket({ creatorCanParticipate: false });
    await expect(commitPosition(OWNER_ID, sidelinedMarketId, requestId(), "yes", 20))
      .rejects.toThrow("sat out");
    await expect(commitPosition(MEMBER_ID, sidelinedMarketId, requestId(), "yes", 20)).resolves.toBeTruthy();

    const draftMarketId = await createOpenMarket({ publish: false });
    await expect(commitPosition(OWNER_ID, draftMarketId, requestId(), "yes", 20))
      .rejects.toThrow("not open");

    const expiredMarketId = await createOpenMarket();
    await resetRole();
    await database.query(
      "update public.markets set trading_closes_at = now() - interval '1 minute' where id = $1",
      [expiredMarketId]
    );
    await expect(commitPosition(MEMBER_ID, expiredMarketId, requestId(), "yes", 20))
      .rejects.toThrow("deadline has passed");
  });

  it("undoes only the latest commitment inside the window, exactly once, with reversing records", async () => {
    const marketId = await createOpenMarket();
    const startingBalance = await walletBalance(RIVAL_ID);
    const first = await commitPosition(RIVAL_ID, marketId, requestId(), "yes", 30);
    const second = await commitPosition(RIVAL_ID, marketId, requestId(), "yes", 20);

    await expect(undoCommit(RIVAL_ID, first.transaction_id, requestId()))
      .rejects.toThrow("latest commitment");
    await expect(undoCommit(MEMBER_ID, second.transaction_id, requestId()))
      .rejects.toThrow("not found");

    const undoRequestId = requestId();
    const undone = await undoCommit(RIVAL_ID, second.transaction_id, undoRequestId);
    expect(Number(undone.position_points)).toBe(30);
    expect(Number(undone.yes_pool)).toBe(30);
    expect(Number(undone.wallet_balance)).toBe(startingBalance - 30);

    const replay = await undoCommit(RIVAL_ID, second.transaction_id, undoRequestId);
    expect(Number(replay.wallet_balance)).toBe(startingBalance - 30);

    await expect(undoCommit(RIVAL_ID, second.transaction_id, requestId()))
      .rejects.toThrow("already undone");

    await resetRole();
    const records = await database.query<{ reversals: number; reversed: number }>(
      `select
        (select count(*)::integer from public.wallet_ledger_entries where market_id = $1 and type = 'position_reversal') as reversals,
        (select count(*)::integer from public.position_transactions where market_id = $1 and reversed_at is not null) as reversed`,
      [marketId]
    );
    expect(records.rows[0]).toEqual({ reversals: 1, reversed: 1 });

    const fullUndo = await undoCommit(RIVAL_ID, first.transaction_id, requestId());
    expect(Number(fullUndo.position_points)).toBe(0);
    expect(Number(fullUndo.yes_backers)).toBe(0);
    expect(Number(fullUndo.wallet_balance)).toBe(startingBalance);

    await resetRole();
    const rulesStillLocked = await database.query<{ rules_locked_at: string | null }>(
      "select rules_locked_at from public.markets where id = $1",
      [marketId]
    );
    expect(rulesStillLocked.rows[0].rules_locked_at).not.toBeNull();

    const transactionHistory = await database.query<{ count: number }>(
      "select count(*)::integer as count from public.position_transactions where market_id = $1 and user_id = $2",
      [marketId, RIVAL_ID]
    );
    expect(transactionHistory.rows[0].count).toBe(2);

    const switched = await commitPosition(RIVAL_ID, marketId, requestId(), "no", 15);
    expect(switched.position_side).toBe("no");
    expect(Number(switched.position_points)).toBe(15);
    expect(Number(switched.no_backers)).toBe(1);
    expect(Number(switched.yes_backers)).toBe(0);
  });

  it("rejects undo after the window closes and allows recommitting afterwards", async () => {
    const marketId = await createOpenMarket();
    const committed = await commitPosition(RIVAL_ID, marketId, requestId(), "no", 25);

    await resetRole();
    await database.query(
      "update public.position_transactions set undo_expires_at = created_at where id = $1",
      [committed.transaction_id]
    );

    await expect(undoCommit(RIVAL_ID, committed.transaction_id, requestId()))
      .rejects.toThrow("window has closed");

    const followUp = await commitPosition(RIVAL_ID, marketId, requestId(), "no", 10);
    expect(Number(followUp.position_points)).toBe(35);
  });

  it("keeps ledgers, positions, and the pool view consistent and membership-scoped", async () => {
    const marketId = await createOpenMarket();
    await commitPosition(MEMBER_ID, marketId, requestId(), "yes", 60);
    await commitPosition(RIVAL_ID, marketId, requestId(), "no", 40);

    await setAuthenticatedUser(MEMBER_ID);
    const memberPools = await database.query<{ no_pool: number; yes_pool: number }>(
      "select yes_pool, no_pool from public.market_pools where market_id = $1",
      [marketId]
    );
    expect(Number(memberPools.rows[0].yes_pool)).toBe(60);
    expect(Number(memberPools.rows[0].no_pool)).toBe(40);

    await setAuthenticatedUser(INTRUDER_ID);
    const intruderPools = await database.query(
      "select yes_pool from public.market_pools where market_id = $1",
      [marketId]
    );
    expect(intruderPools.rows).toHaveLength(0);
    await expect(database.query("select * from public.position_commit_receipts"))
      .rejects.toThrow(/permission denied/i);
    await expect(database.query(
      "insert into public.positions (market_id, user_id, side, points) values ($1, $2, 'yes', 10)",
      [marketId, INTRUDER_ID]
    )).rejects.toThrow(/permission denied/i);

    await resetRole();
    const reconciliation = await database.query<{ ledger_sum: number; position_sum: number }>(
      `select
        (select coalesce(-sum(entry.amount), 0)::integer
         from public.wallet_ledger_entries entry
         where entry.market_id = $1 and entry.type in ('position_debit', 'position_reversal')) as ledger_sum,
        (select coalesce(sum(position.points), 0)::integer from public.positions position where position.market_id = $1) as position_sum`,
      [marketId]
    );
    expect(reconciliation.rows[0].ledger_sum).toBe(reconciliation.rows[0].position_sum);
  });
});
