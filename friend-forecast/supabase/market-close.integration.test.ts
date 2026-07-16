// @vitest-environment node

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const OWNER_ID = "15000000-0000-4000-8000-000000000001";
const MEMBER_ID = "15000000-0000-4000-8000-000000000002";
const RIVAL_ID = "15000000-0000-4000-8000-000000000003";
const INTRUDER_ID = "15000000-0000-4000-8000-000000000004";

let database: PGlite;
let groupId: string;
let requestCounter = 1;

function requestId() {
  return `16000000-0000-4000-8000-${String(requestCounter++).padStart(12, "0")}`;
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

async function createOpenMarket() {
  await setAuthenticatedUser(OWNER_ID);
  const result = await database.query<{ market_id: string }>(
    `select public.create_market(
      $1::uuid, $2::uuid, 'sports',
      'Will Team Violet meet the official threshold tomorrow?',
      'YES if the official final result meets the threshold.',
      'NO if the official final result does not meet the threshold.',
      'Cancel if the official result is unavailable after 24 hours.',
      'The official event result page.', 'https://example.com/results',
      $3::timestamptz, $4::timestamptz, 'UTC', 'disputable', true, 'independent', true
    ) as market_id`,
    [
      groupId,
      requestId(),
      new Date(Date.now() + 86_400_000).toISOString(),
      new Date(Date.now() + 2 * 86_400_000).toISOString()
    ]
  );
  return result.rows[0].market_id;
}

async function commitPosition(userId: string, marketId: string, side: string, points: number) {
  await setAuthenticatedUser(userId);
  const result = await database.query<{ transaction_id: string }>(
    "select transaction_id from public.commit_position($1::uuid, $2::uuid, $3::text, $4::integer)",
    [marketId, requestId(), side, points]
  );
  return result.rows[0];
}

// Simulates the deadline passing. Funded markets freeze their rules behind
// the contract-protection trigger, so time travel needs it briefly disabled;
// the funded case keeps first_stake_at < trading_closes_at to satisfy the
// rules-lock check constraint.
async function expireMarket(marketId: string) {
  await resetRole();
  await database.exec("alter table public.markets disable trigger protect_market_contract_before_update;");
  try {
    await database.query(
      `update public.markets
       set trading_closes_at = case
         when first_stake_at is null then now() - interval '1 minute'
         else now()
       end
       where id = $1`,
      [marketId]
    );
  } finally {
    await database.exec("alter table public.markets enable trigger protect_market_contract_before_update;");
  }
}

async function closeIfDue(userId: string, marketId: string) {
  await setAuthenticatedUser(userId);
  const result = await database.query<{ status: string }>(
    "select public.close_market_if_due($1::uuid) as status",
    [marketId]
  );
  return result.rows[0].status;
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
    "select public.create_group('Deadline Crew', 'violet', 'members') as group_id"
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

describe.sequential("market close PostgreSQL integration", () => {
  it("leaves open markets untouched before the deadline", async () => {
    const marketId = await createOpenMarket();
    await commitPosition(MEMBER_ID, marketId, "yes", 20);

    expect(await closeIfDue(MEMBER_ID, marketId)).toBe("open");

    await resetRole();
    const market = await database.query<{ status: string }>(
      "select status from public.markets where id = $1",
      [marketId]
    );
    expect(market.rows[0].status).toBe("open");
  });

  it("closes a contested market exactly once and locks out late stakes and undo", async () => {
    const marketId = await createOpenMarket();
    await commitPosition(MEMBER_ID, marketId, "yes", 60);
    const rival = await commitPosition(RIVAL_ID, marketId, "no", 40);
    await expireMarket(marketId);

    expect(await closeIfDue(MEMBER_ID, marketId)).toBe("closed");
    expect(await closeIfDue(RIVAL_ID, marketId)).toBe("closed");

    await expect(commitPosition(MEMBER_ID, marketId, "yes", 10))
      .rejects.toThrow("not open");
    await setAuthenticatedUser(RIVAL_ID);
    await expect(database.query(
      "select * from public.undo_position_commit($1::uuid, $2::uuid)",
      [rival.transaction_id, requestId()]
    )).rejects.toThrow(/window has closed|no longer accepting/);

    await resetRole();
    const audit = await database.query<{ count: number }>(
      "select count(*)::integer as count from public.audit_events where market_id = $1 and event_type = 'market_closed'",
      [marketId]
    );
    expect(audit.rows[0].count).toBe(1);

    const refunds = await database.query<{ count: number }>(
      "select count(*)::integer as count from public.wallet_ledger_entries where market_id = $1 and type = 'refund_credit'",
      [marketId]
    );
    expect(refunds.rows[0].count).toBe(0);
  });

  it("refunds a one-sided market exactly, once, and keeps position history", async () => {
    const memberBefore = await walletBalance(MEMBER_ID);
    const rivalBefore = await walletBalance(RIVAL_ID);
    const marketId = await createOpenMarket();
    await commitPosition(MEMBER_ID, marketId, "yes", 45);
    await commitPosition(RIVAL_ID, marketId, "yes", 25);
    await expireMarket(marketId);

    expect(await closeIfDue(MEMBER_ID, marketId)).toBe("cancelled");
    expect(await closeIfDue(MEMBER_ID, marketId)).toBe("cancelled");

    expect(await walletBalance(MEMBER_ID)).toBe(memberBefore);
    expect(await walletBalance(RIVAL_ID)).toBe(rivalBefore);

    await resetRole();
    const records = await database.query<{ positions: number; refunds: number; resolved: number }>(
      `select
        (select count(*)::integer from public.positions where market_id = $1 and points > 0) as positions,
        (select count(*)::integer from public.wallet_ledger_entries where market_id = $1 and type = 'refund_credit') as refunds,
        (select count(*)::integer from public.markets where id = $1 and status = 'cancelled' and resolved_at is not null) as resolved`,
      [marketId]
    );
    expect(records.rows[0]).toEqual({ positions: 2, refunds: 2, resolved: 1 });

    const audit = await database.query<{ new_state: { reason: string } }>(
      "select new_state from public.audit_events where market_id = $1 and event_type = 'market_refunded'",
      [marketId]
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].new_state.reason).toBe("one_sided");
  });

  it("skips fully undone stakes when refunding and cancels unfunded markets quietly", async () => {
    const rivalBefore = await walletBalance(RIVAL_ID);
    const marketId = await createOpenMarket();
    const stake = await commitPosition(RIVAL_ID, marketId, "no", 30);
    await setAuthenticatedUser(RIVAL_ID);
    await database.query(
      "select * from public.undo_position_commit($1::uuid, $2::uuid)",
      [stake.transaction_id, requestId()]
    );
    await expireMarket(marketId);

    expect(await closeIfDue(RIVAL_ID, marketId)).toBe("cancelled");
    expect(await walletBalance(RIVAL_ID)).toBe(rivalBefore);

    await resetRole();
    const refunds = await database.query<{ count: number }>(
      "select count(*)::integer as count from public.wallet_ledger_entries where market_id = $1 and type = 'refund_credit'",
      [marketId]
    );
    expect(refunds.rows[0].count).toBe(0);

    const audit = await database.query<{ new_state: { reason: string } }>(
      "select new_state from public.audit_events where market_id = $1 and event_type = 'market_refunded'",
      [marketId]
    );
    expect(audit.rows[0].new_state.reason).toBe("unfunded");
  });

  it("scopes closing to group members and sweeps due markets per group", async () => {
    const firstDue = await createOpenMarket();
    const secondDue = await createOpenMarket();
    const stillOpen = await createOpenMarket();
    await commitPosition(MEMBER_ID, firstDue, "yes", 15);
    await commitPosition(RIVAL_ID, firstDue, "no", 15);
    await commitPosition(MEMBER_ID, secondDue, "yes", 15);
    await expireMarket(firstDue);
    await expireMarket(secondDue);

    await setAuthenticatedUser(INTRUDER_ID);
    await expect(database.query("select public.close_market_if_due($1::uuid)", [firstDue]))
      .rejects.toThrow("not found");
    await expect(database.query("select * from public.close_due_group_markets($1::uuid)", [groupId]))
      .rejects.toThrow("membership");

    await setAuthenticatedUser(MEMBER_ID);
    const sweep = await database.query<{ markets_closed: number; markets_refunded: number }>(
      "select * from public.close_due_group_markets($1::uuid)",
      [groupId]
    );
    expect(sweep.rows[0].markets_closed).toBe(1);
    expect(sweep.rows[0].markets_refunded).toBe(1);

    const repeat = await database.query<{ markets_closed: number; markets_refunded: number }>(
      "select * from public.close_due_group_markets($1::uuid)",
      [groupId]
    );
    expect(repeat.rows[0]).toEqual({ markets_closed: 0, markets_refunded: 0 });

    await resetRole();
    const statuses = await database.query<{ id: string; status: string }>(
      "select id, status from public.markets where id = any($1::uuid[]) order by id",
      [[firstDue, secondDue, stillOpen]]
    );
    const byId = new Map(statuses.rows.map((row) => [row.id, row.status]));
    expect(byId.get(firstDue)).toBe("closed");
    expect(byId.get(secondDue)).toBe("cancelled");
    expect(byId.get(stillOpen)).toBe("open");
  });
});
