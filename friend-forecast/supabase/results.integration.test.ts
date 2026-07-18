// @vitest-environment node

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const OWNER_ID = "23000000-0000-4000-8000-000000000001";
const MEMBER_ID = "23000000-0000-4000-8000-000000000002";
const RIVAL_ID = "23000000-0000-4000-8000-000000000003";
const FOURTH_ID = "23000000-0000-4000-8000-000000000004";
const INTRUDER_ID = "23000000-0000-4000-8000-000000000005";

let database: PGlite;
let groupId: string;
let requestCounter = 1;

function requestId() {
  return `24000000-0000-4000-8000-${String(requestCounter++).padStart(12, "0")}`;
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

type Stake = { points: number; side: "no" | "yes"; userId: string };

async function timeTravelMarket(marketId: string, closesAgoMinutes: number, eligibleAgoMinutes: number) {
  await resetRole();
  await database.exec("alter table public.markets disable trigger protect_market_contract_before_update;");
  try {
    await database.query(
      `update public.markets
       set trading_closes_at = now() - make_interval(mins => $2::integer),
           resolution_eligible_at = now() - make_interval(mins => $3::integer),
           first_stake_at = least(first_stake_at, now() - make_interval(mins => $2::integer + 1)),
           rules_locked_at = least(rules_locked_at, now() - make_interval(mins => $2::integer + 1)),
           published_at = least(published_at, now() - make_interval(mins => $2::integer + 2))
       where id = $1`,
      [marketId, closesAgoMinutes, eligibleAgoMinutes]
    );
  } finally {
    await database.exec("alter table public.markets enable trigger protect_market_contract_before_update;");
  }
}

async function settledMarket(stakes: Stake[], outcome: "cancel" | "yes") {
  await setAuthenticatedUser(OWNER_ID);
  const created = await database.query<{ market_id: string }>(
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
  const marketId = created.rows[0].market_id;

  for (const stake of stakes) {
    await setAuthenticatedUser(stake.userId);
    await database.query(
      "select transaction_id from public.commit_position($1::uuid, $2::uuid, $3::text, $4::integer)",
      [marketId, requestId(), stake.side, stake.points]
    );
  }
  await timeTravelMarket(marketId, 60, 30);
  await setAuthenticatedUser(OWNER_ID);
  await database.query("select public.close_market_if_due($1::uuid)", [marketId]);
  await database.query(
    "select public.propose_resolution($1::uuid, $2::uuid, $3::text, 'The official page shows the final result.', 'https://example.com/results')",
    [marketId, requestId(), outcome]
  );
  await resetRole();
  await database.exec("alter table public.market_resolution_proposals disable trigger market_resolution_proposals_are_immutable;");
  try {
    await database.query(
      "update public.market_resolution_proposals set challenge_deadline = now() - interval '1 minute' where market_id = $1 and status = 'pending'",
      [marketId]
    );
  } finally {
    await database.exec("alter table public.market_resolution_proposals enable trigger market_resolution_proposals_are_immutable;");
  }
  await setAuthenticatedUser(OWNER_ID);
  await database.query("select public.settle_market_if_due($1::uuid)", [marketId]);
  return marketId;
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
  await createAuthUser(FOURTH_ID, "Fourth");
  await createAuthUser(INTRUDER_ID, "Intruder");
  await setAuthenticatedUser(OWNER_ID);
  const created = await database.query<{ group_id: string }>(
    "select public.create_group('Results Crew', 'violet', 'members') as group_id"
  );
  groupId = created.rows[0].group_id;

  await resetRole();
  await database.query(
    "update public.group_memberships set joined_at = now() - interval '30 days' where group_id = $1 and user_id = $2",
    [groupId, OWNER_ID]
  );
  await database.query(
    `insert into public.group_memberships (group_id, user_id, role, status, joined_at)
     values ($1, $2, 'member', 'active', now() - interval '30 days'),
            ($1, $3, 'member', 'active', now() - interval '30 days'),
            ($1, $4, 'member', 'active', now() - interval '30 days')`,
    [groupId, MEMBER_ID, RIVAL_ID, FOURTH_ID]
  );
  await database.query(
    "update public.seasons set starts_at = now() - interval '30 days' where group_id = $1",
    [groupId]
  );
  const season = await database.query<{ id: string }>(
    "select id from public.seasons where group_id = $1 and status = 'active'",
    [groupId]
  );
  for (const userId of [MEMBER_ID, RIVAL_ID, FOURTH_ID]) {
    await database.query("select public.ensure_season_wallet($1, $2, null)", [season.rows[0].id, userId]);
  }
}, 60_000);

afterAll(async () => {
  await database?.close();
});

describe.sequential("results and standings PostgreSQL integration", () => {
  it("returns ledger-backed results with winner flags and superlatives", async () => {
    // Member commits first (first believer), Fourth commits most (biggest
    // conviction). Pool 133 pays 40/53 with floors plus remainders.
    const marketId = await settledMarket([
      { points: 30, side: "yes", userId: MEMBER_ID },
      { points: 40, side: "yes", userId: FOURTH_ID },
      { points: 63, side: "no", userId: RIVAL_ID }
    ], "yes");

    await setAuthenticatedUser(RIVAL_ID);
    const results = await database.query<{
      display_name: string;
      is_biggest_conviction: boolean;
      is_first_believer: boolean;
      is_winner: boolean;
      net: number;
      payout: number;
      side: string;
      stake: number;
    }>(
      "select display_name, side, stake, payout::integer, net::integer, is_winner, is_first_believer, is_biggest_conviction from public.get_market_results($1::uuid)",
      [marketId]
    );

    expect(results.rows).toEqual([
      {
        display_name: "Fourth",
        is_biggest_conviction: true,
        is_first_believer: false,
        is_winner: true,
        net: 36,
        payout: 76,
        side: "yes",
        stake: 40
      },
      {
        display_name: "Member",
        is_biggest_conviction: false,
        is_first_believer: true,
        is_winner: true,
        net: 27,
        payout: 57,
        side: "yes",
        stake: 30
      },
      {
        display_name: "Rival",
        is_biggest_conviction: false,
        is_first_believer: false,
        is_winner: false,
        net: -63,
        payout: 0,
        side: "no",
        stake: 63
      }
    ]);
  });

  it("marks refunds as neutral results without winners", async () => {
    const marketId = await settledMarket([
      { points: 20, side: "yes", userId: MEMBER_ID },
      { points: 20, side: "no", userId: RIVAL_ID }
    ], "cancel");

    await setAuthenticatedUser(MEMBER_ID);
    const results = await database.query<{ is_winner: boolean; net: number }>(
      "select is_winner, net::integer from public.get_market_results($1::uuid)",
      [marketId]
    );
    expect(results.rows).toHaveLength(2);
    expect(results.rows.every((row) => !row.is_winner && Number(row.net) === 0)).toBe(true);
  });

  it("blocks results before settlement and outside the group", async () => {
    await setAuthenticatedUser(OWNER_ID);
    const open = await database.query<{ market_id: string }>(
      `select public.create_market(
        $1::uuid, $2::uuid, 'sports',
        'Will Team Violet win the rematch this weekend?',
        'YES if the official final result is a win.',
        'NO if the official final result is not a win.',
        'Cancel if the match is abandoned.',
        'The official event result page.', 'https://example.com/results',
        $3::timestamptz, $4::timestamptz, 'UTC', 'disputable', true, 'independent', true
      ) as market_id`,
      [groupId, requestId(), new Date(Date.now() + 86_400_000).toISOString(), new Date(Date.now() + 2 * 86_400_000).toISOString()]
    );
    await expect(database.query("select * from public.get_market_results($1::uuid)", [open.rows[0].market_id]))
      .rejects.toThrow("once the market settles");

    const settled = await settledMarket([
      { points: 15, side: "yes", userId: MEMBER_ID },
      { points: 15, side: "no", userId: RIVAL_ID }
    ], "yes");
    await setAuthenticatedUser(INTRUDER_ID);
    await expect(database.query("select * from public.get_market_results($1::uuid)", [settled]))
      .rejects.toThrow("once the market settles");
    await expect(database.query("select * from public.get_group_standings($1::uuid)", [groupId]))
      .rejects.toThrow("membership");
  });

  it("ranks standings by market net, reconciled to the ledger", async () => {
    await setAuthenticatedUser(OWNER_ID);
    const standings = await database.query<{
      balance: number;
      display_name: string;
      market_net: number;
      markets_played: number;
      markets_won: number;
      staked_total: number;
    }>(
      "select display_name, balance::integer, market_net::integer, staked_total::integer, markets_played, markets_won from public.get_group_standings($1::uuid)",
      [groupId]
    );

    expect(standings.rows).toHaveLength(4);
    // Member: +27 +0 +15 = 42 across three markets; Fourth: +36 from one;
    // Owner never staked; Rival lost both contested markets.
    expect(standings.rows.map((row) => row.display_name)).toEqual(["Member", "Fourth", "Owner", "Rival"]);

    const byName = new Map(standings.rows.map((row) => [row.display_name, row]));
    // Fourth: one market, +36. Member: 27 + 0 + 15 across three markets.
    expect(byName.get("Fourth")).toMatchObject({ market_net: 36, markets_played: 1, markets_won: 1 });
    expect(byName.get("Member")).toMatchObject({ market_net: 42, markets_played: 3, markets_won: 2 });
    expect(byName.get("Rival")).toMatchObject({ market_net: -78, markets_played: 3, markets_won: 0 });
    expect(byName.get("Owner")).toMatchObject({ market_net: 0, markets_played: 0, markets_won: 0 });

    for (const row of standings.rows) {
      await resetRole();
      const ledger = await database.query<{ balance: number }>(
        `select coalesce(sum(entry.amount), 0)::integer as balance
         from public.wallet_ledger_entries entry
         join public.seasons season on season.id = entry.season_id
         where season.group_id = $1 and entry.user_id = (
           select profile.id from public.profiles profile where profile.display_name = $2
         )`,
        [groupId, row.display_name]
      );
      expect(Number(row.balance)).toBe(ledger.rows[0].balance);
    }
  });
});
