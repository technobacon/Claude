// @vitest-environment node

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const OWNER_ID = "17000000-0000-4000-8000-000000000001";
const MEMBER_ID = "17000000-0000-4000-8000-000000000002";
const RIVAL_ID = "17000000-0000-4000-8000-000000000003";
const LATECOMER_ID = "17000000-0000-4000-8000-000000000004";
const INTRUDER_ID = "17000000-0000-4000-8000-000000000005";

let database: PGlite;
let groupId: string;
let requestCounter = 1;

function requestId() {
  return `18000000-0000-4000-8000-${String(requestCounter++).padStart(12, "0")}`;
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

async function createOpenMarket(resolutionMode: "creator_final" | "disputable" = "disputable") {
  await setAuthenticatedUser(OWNER_ID);
  const result = await database.query<{ market_id: string }>(
    `select public.create_market(
      $1::uuid, $2::uuid, 'sports',
      'Will Team Violet meet the official threshold tomorrow?',
      'YES if the official final result meets the threshold.',
      'NO if the official final result does not meet the threshold.',
      'Cancel if the official result is unavailable after 24 hours.',
      'The official event result page.', 'https://example.com/results',
      $3::timestamptz, $4::timestamptz, 'UTC', $5::text, $6::boolean, 'independent', true
    ) as market_id`,
    [
      groupId,
      requestId(),
      new Date(Date.now() + 86_400_000).toISOString(),
      new Date(Date.now() + 2 * 86_400_000).toISOString(),
      resolutionMode,
      resolutionMode === "disputable"
    ]
  );
  return result.rows[0].market_id;
}

async function commitPosition(userId: string, marketId: string, side: string, points: number) {
  await setAuthenticatedUser(userId);
  await database.query(
    "select transaction_id from public.commit_position($1::uuid, $2::uuid, $3::text, $4::integer)",
    [marketId, requestId(), side, points]
  );
}

// Time travel for deadline-dependent states. The contract-protection trigger
// (correctly) freezes funded market rules, so it is briefly disabled while
// the test rewinds timestamps; ordering constraints are preserved.
async function timeTravelMarket(marketId: string, closesAgoMinutes: number, eligibleAgoMinutes: number | null) {
  await resetRole();
  await database.exec("alter table public.markets disable trigger protect_market_contract_before_update;");
  try {
    await database.query(
      `update public.markets
       set trading_closes_at = now() - make_interval(mins => $2::integer),
           resolution_eligible_at = case
             when $3::integer is null then resolution_eligible_at
             else now() - make_interval(mins => $3::integer)
           end,
           first_stake_at = case
             when first_stake_at is null then null
             else least(first_stake_at, now() - make_interval(mins => $2::integer + 1))
           end,
           rules_locked_at = case
             when rules_locked_at is null then null
             else least(rules_locked_at, now() - make_interval(mins => $2::integer + 1))
           end,
           published_at = least(published_at, now() - make_interval(mins => $2::integer + 2))
       where id = $1`,
      [marketId, closesAgoMinutes, eligibleAgoMinutes]
    );
  } finally {
    await database.exec("alter table public.markets enable trigger protect_market_contract_before_update;");
  }
}

async function closeMarket(marketId: string) {
  await setAuthenticatedUser(OWNER_ID);
  await database.query("select public.close_market_if_due($1::uuid)", [marketId]);
}

async function readyContestedMarket(options: { eligibleAgoMinutes?: number | null; resolutionMode?: "creator_final" | "disputable" } = {}) {
  const marketId = await createOpenMarket(options.resolutionMode ?? "disputable");
  await commitPosition(MEMBER_ID, marketId, "yes", 60);
  await commitPosition(RIVAL_ID, marketId, "no", 40);
  const eligibleAgoMinutes = options.eligibleAgoMinutes === undefined ? 30 : options.eligibleAgoMinutes;
  // trading_closes_at must stay at or before resolution_eligible_at, and both
  // must stay after the (backdated) memberships and before the season end.
  const closesAgoMinutes = Math.max(60, (eligibleAgoMinutes ?? 0) + 30);
  await timeTravelMarket(marketId, closesAgoMinutes, eligibleAgoMinutes);
  await closeMarket(marketId);
  return marketId;
}

async function propose(userId: string, marketId: string, proposalRequestId: string, outcome: string, explanation = "The official page shows the threshold was met.") {
  await setAuthenticatedUser(userId);
  const result = await database.query<{ proposal_id: string }>(
    "select public.propose_resolution($1::uuid, $2::uuid, $3::text, $4::text, $5::text) as proposal_id",
    [marketId, proposalRequestId, outcome, explanation, "https://example.com/results"]
  );
  return result.rows[0].proposal_id;
}

async function dispute(userId: string, marketId: string, disputeRequestId: string, reason = "The screenshot shows a different number than the rules require.") {
  await setAuthenticatedUser(userId);
  const result = await database.query<{ dispute_id: string }>(
    "select public.dispute_resolution($1::uuid, $2::uuid, $3::text, $4::text) as dispute_id",
    [marketId, disputeRequestId, reason, null]
  );
  return result.rows[0].dispute_id;
}

async function marketStatus(marketId: string) {
  await resetRole();
  const result = await database.query<{ status: string }>(
    "select status from public.markets where id = $1",
    [marketId]
  );
  return result.rows[0].status;
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
  await createAuthUser(LATECOMER_ID, "Latecomer");
  await createAuthUser(INTRUDER_ID, "Intruder");
  await setAuthenticatedUser(OWNER_ID);
  const created = await database.query<{ group_id: string }>(
    "select public.create_group('Resolution Crew', 'violet', 'members') as group_id"
  );
  groupId = created.rows[0].group_id;

  await resetRole();
  // Backdate the memberships so time-travelled trading deadlines still fall
  // after each join; the latecomer stays after every rewound deadline.
  await database.query(
    "update public.group_memberships set joined_at = now() - interval '3 days' where group_id = $1 and user_id = $2",
    [groupId, OWNER_ID]
  );
  await database.query(
    `insert into public.group_memberships (group_id, user_id, role, status, joined_at)
     values ($1, $2, 'member', 'active', now() - interval '3 days'),
            ($1, $3, 'member', 'active', now() - interval '3 days'),
            ($1, $4, 'member', 'active', now() + interval '1 hour')`,
    [groupId, MEMBER_ID, RIVAL_ID, LATECOMER_ID]
  );
  const season = await database.query<{ id: string }>(
    "select id from public.seasons where group_id = $1 and status = 'active'",
    [groupId]
  );
  for (const userId of [MEMBER_ID, RIVAL_ID, LATECOMER_ID]) {
    await database.query("select public.ensure_season_wallet($1, $2, null)", [season.rows[0].id, userId]);
  }
}, 60_000);

afterAll(async () => {
  await database?.close();
});

describe.sequential("resolution PostgreSQL integration", () => {
  it("rejects proposals before the earliest resolution time and from open markets", async () => {
    const openMarketId = await createOpenMarket();
    await commitPosition(MEMBER_ID, openMarketId, "yes", 20);
    await expect(propose(OWNER_ID, openMarketId, requestId(), "yes"))
      .rejects.toThrow("not awaiting");

    const notEligibleId = await readyContestedMarket({ eligibleAgoMinutes: null });
    expect(await marketStatus(notEligibleId)).toBe("closed");
    await expect(propose(OWNER_ID, notEligibleId, requestId(), "yes"))
      .rejects.toThrow("earliest resolution time");
  });

  it("gives the creator first right, then opens proposals after the grace period", async () => {
    const graceMarketId = await readyContestedMarket({ eligibleAgoMinutes: 30 });
    await expect(propose(MEMBER_ID, graceMarketId, requestId(), "yes"))
      .rejects.toThrow("creator proposes first");

    const proposalId = await propose(OWNER_ID, graceMarketId, requestId(), "yes");
    expect(proposalId).toMatch(/[0-9a-f-]{36}/);
    expect(await marketStatus(graceMarketId)).toBe("resolution_proposed");

    const afterGraceId = await readyContestedMarket({ eligibleAgoMinutes: 25 * 60 });
    await expect(propose(MEMBER_ID, afterGraceId, requestId(), "no")).resolves.toMatch(/[0-9a-f-]{36}/);

    const lateJoinerId = await readyContestedMarket({ eligibleAgoMinutes: 25 * 60 });
    await expect(propose(LATECOMER_ID, lateJoinerId, requestId(), "yes"))
      .rejects.toThrow("joined before the trading deadline");
    await expect(propose(INTRUDER_ID, lateJoinerId, requestId(), "yes"))
      .rejects.toThrow("not found");
  });

  it("replays duplicate proposal requests, blocks payload reuse, and allows one pending proposal", async () => {
    const marketId = await readyContestedMarket();
    const duplicateId = requestId();
    const first = await propose(OWNER_ID, marketId, duplicateId, "yes");
    const replay = await propose(OWNER_ID, marketId, duplicateId, "yes");
    expect(replay).toBe(first);

    await expect(propose(OWNER_ID, marketId, duplicateId, "no"))
      .rejects.toThrow("different proposal");
    await expect(propose(OWNER_ID, marketId, requestId(), "no"))
      .rejects.toThrow("not awaiting");

    await resetRole();
    const challenge = await database.query<{ pending: number; window_hours: number }>(
      `select
        count(*)::integer as pending,
        round(extract(epoch from (max(challenge_deadline) - max(created_at))) / 3600)::integer as window_hours
       from public.market_resolution_proposals where market_id = $1`,
      [marketId]
    );
    expect(challenge.rows[0]).toEqual({ pending: 1, window_hours: 12 });
  });

  it("records a NOT READY proposal without leaving the closed state", async () => {
    const marketId = await readyContestedMarket();
    await propose(OWNER_ID, marketId, requestId(), "not_ready", "The official page still shows the event in progress.");

    expect(await marketStatus(marketId)).toBe("closed");

    await resetRole();
    const record = await database.query<{ outcome: string; status: string }>(
      "select outcome, status from public.market_resolution_proposals where market_id = $1",
      [marketId]
    );
    expect(record.rows).toEqual([{ outcome: "not_ready", status: "accepted" }]);

    await expect(propose(OWNER_ID, marketId, requestId(), "yes")).resolves.toMatch(/[0-9a-f-]{36}/);
    expect(await marketStatus(marketId)).toBe("resolution_proposed");
  });

  it("opens exactly one dispute, snapshots pre-deadline members, and pauses the proposal", async () => {
    const marketId = await readyContestedMarket();
    await propose(OWNER_ID, marketId, requestId(), "yes");

    await expect(dispute(LATECOMER_ID, marketId, requestId()))
      .rejects.toThrow("joined before the trading deadline");
    await expect(dispute(INTRUDER_ID, marketId, requestId()))
      .rejects.toThrow("not found");

    const duplicateId = requestId();
    const disputeId = await dispute(RIVAL_ID, marketId, duplicateId);
    expect(await dispute(RIVAL_ID, marketId, duplicateId)).toBe(disputeId);
    await expect(dispute(MEMBER_ID, marketId, requestId()))
      .rejects.toThrow(/already has its dispute|no pending proposal/);

    expect(await marketStatus(marketId)).toBe("disputed");

    await resetRole();
    const snapshot = await database.query<{ user_id: string }>(
      "select user_id from public.market_vote_snapshots where dispute_id = $1 order by user_id",
      [disputeId]
    );
    expect(snapshot.rows.map((row) => row.user_id).sort()).toEqual([OWNER_ID, MEMBER_ID, RIVAL_ID].sort());

    const proposal = await database.query<{ status: string }>(
      "select status from public.market_resolution_proposals where market_id = $1",
      [marketId]
    );
    expect(proposal.rows[0].status).toBe("disputed");

    await expect(database.query(
      "insert into public.market_vote_snapshots (dispute_id, market_id, user_id) values ($1, $2, $3)",
      [disputeId, marketId, LATECOMER_ID]
    )).rejects.toThrow(/frozen/i);
    await expect(database.query("delete from public.market_vote_snapshots where dispute_id = $1", [disputeId]))
      .rejects.toThrow(/append-only/i);

    await setAuthenticatedUser(RIVAL_ID);
    await expect(database.query(
      "insert into public.market_vote_snapshots (dispute_id, market_id, user_id) values ($1, $2, $3)",
      [disputeId, marketId, LATECOMER_ID]
    )).rejects.toThrow(/permission denied/i);
  });

  it("rejects disputes after the challenge window and on creator-final markets", async () => {
    const expiredWindowId = await readyContestedMarket();
    await propose(OWNER_ID, expiredWindowId, requestId(), "yes");
    await resetRole();
    await database.exec("alter table public.market_resolution_proposals disable trigger market_resolution_proposals_are_immutable;");
    try {
      await database.query(
        "update public.market_resolution_proposals set challenge_deadline = now() - interval '1 minute' where market_id = $1",
        [expiredWindowId]
      );
    } finally {
      await database.exec("alter table public.market_resolution_proposals enable trigger market_resolution_proposals_are_immutable;");
    }
    await expect(dispute(RIVAL_ID, expiredWindowId, requestId()))
      .rejects.toThrow("challenge window has closed");

    const creatorFinalId = await readyContestedMarket({ resolutionMode: "creator_final" });
    await propose(OWNER_ID, creatorFinalId, requestId(), "yes");
    await expect(dispute(RIVAL_ID, creatorFinalId, requestId()))
      .rejects.toThrow("without a group dispute");
  });

  it("keeps proposals immutable and membership-scoped", async () => {
    const marketId = await readyContestedMarket();
    const proposalId = await propose(OWNER_ID, marketId, requestId(), "yes");

    await resetRole();
    await expect(database.query(
      "update public.market_resolution_proposals set outcome = 'no' where id = $1",
      [proposalId]
    )).rejects.toThrow("cannot be edited");
    await expect(database.query("delete from public.market_resolution_proposals where id = $1", [proposalId]))
      .rejects.toThrow("append-only");

    await setAuthenticatedUser(MEMBER_ID);
    const memberView = await database.query<{ count: number }>(
      "select count(*)::integer as count from public.market_resolution_proposals where id = $1",
      [proposalId]
    );
    expect(memberView.rows[0].count).toBe(1);

    await setAuthenticatedUser(INTRUDER_ID);
    const intruderView = await database.query<{ count: number }>(
      "select count(*)::integer as count from public.market_resolution_proposals where id = $1",
      [proposalId]
    );
    expect(intruderView.rows[0].count).toBe(0);
    await expect(database.query(
      "insert into public.market_resolution_proposals (market_id, group_id, proposer_user_id, request_id, request_hash, outcome, explanation, challenge_deadline) values ($1, $2, $3, $4, $5, 'yes', 'forged', now())",
      [marketId, groupId, INTRUDER_ID, requestId(), "a".repeat(64)]
    )).rejects.toThrow(/permission denied/i);
  });
});
