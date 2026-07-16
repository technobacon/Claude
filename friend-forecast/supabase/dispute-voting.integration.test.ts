// @vitest-environment node

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const OWNER_ID = "19000000-0000-4000-8000-000000000001";
const MEMBER_ID = "19000000-0000-4000-8000-000000000002";
const RIVAL_ID = "19000000-0000-4000-8000-000000000003";
const FOURTH_ID = "19000000-0000-4000-8000-000000000004";
const FIFTH_ID = "19000000-0000-4000-8000-000000000005";
const LATECOMER_ID = "19000000-0000-4000-8000-000000000006";
const INTRUDER_ID = "19000000-0000-4000-8000-000000000007";
const VOTERS = [OWNER_ID, MEMBER_ID, RIVAL_ID, FOURTH_ID, FIFTH_ID];

let database: PGlite;
let groupId: string;
let requestCounter = 1;

function requestId() {
  return `20000000-0000-4000-8000-${String(requestCounter++).padStart(12, "0")}`;
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

async function expireVoteDeadline(disputeId: string) {
  await resetRole();
  await database.exec("alter table public.market_disputes disable trigger market_disputes_are_immutable;");
  try {
    await database.query(
      "update public.market_disputes set vote_deadline = now() - interval '1 minute' where id = $1",
      [disputeId]
    );
  } finally {
    await database.exec("alter table public.market_disputes enable trigger market_disputes_are_immutable;");
  }
}

async function disputedMarket() {
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

  for (const [userId, side, points] of [[MEMBER_ID, "yes", 60], [RIVAL_ID, "no", 40]] as const) {
    await setAuthenticatedUser(userId);
    await database.query(
      "select transaction_id from public.commit_position($1::uuid, $2::uuid, $3::text, $4::integer)",
      [marketId, requestId(), side, points]
    );
  }
  await timeTravelMarket(marketId, 60, 30);
  await setAuthenticatedUser(OWNER_ID);
  await database.query("select public.close_market_if_due($1::uuid)", [marketId]);
  await database.query(
    "select public.propose_resolution($1::uuid, $2::uuid, 'yes', 'The official page shows the threshold was met.', 'https://example.com/results')",
    [marketId, requestId()]
  );
  await setAuthenticatedUser(RIVAL_ID);
  const disputeResult = await database.query<{ dispute_id: string }>(
    "select public.dispute_resolution($1::uuid, $2::uuid, 'The screenshot shows a different number.', null) as dispute_id",
    [marketId, requestId()]
  );
  return { disputeId: disputeResult.rows[0].dispute_id, marketId };
}

async function vote(userId: string, disputeId: string, choice: string, voteRequestId = requestId()) {
  await setAuthenticatedUser(userId);
  await database.query(
    "select public.cast_dispute_vote($1::uuid, $2::uuid, $3::text)",
    [disputeId, voteRequestId, choice]
  );
}

async function finalizeIfDue(userId: string, marketId: string) {
  await setAuthenticatedUser(userId);
  const result = await database.query<{ outcome: string | null }>(
    "select public.finalize_dispute_if_due($1::uuid) as outcome",
    [marketId]
  );
  return result.rows[0].outcome;
}

async function disputeState(disputeId: string) {
  await resetRole();
  const result = await database.query<{ final_outcome: string | null; final_reason: string | null; released_at: string | null }>(
    "select final_outcome, final_reason, released_at from public.market_disputes where id = $1",
    [disputeId]
  );
  return result.rows[0];
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
  await createAuthUser(FOURTH_ID, "Fourth");
  await createAuthUser(FIFTH_ID, "Fifth");
  await createAuthUser(LATECOMER_ID, "Latecomer");
  await createAuthUser(INTRUDER_ID, "Intruder");
  await setAuthenticatedUser(OWNER_ID);
  const created = await database.query<{ group_id: string }>(
    "select public.create_group('Voting Crew', 'violet', 'members') as group_id"
  );
  groupId = created.rows[0].group_id;

  await resetRole();
  await database.query(
    "update public.group_memberships set joined_at = now() - interval '3 days' where group_id = $1 and user_id = $2",
    [groupId, OWNER_ID]
  );
  await database.query(
    `insert into public.group_memberships (group_id, user_id, role, status, joined_at)
     values ($1, $2, 'member', 'active', now() - interval '3 days'),
            ($1, $3, 'member', 'active', now() - interval '3 days'),
            ($1, $4, 'member', 'active', now() - interval '3 days'),
            ($1, $5, 'member', 'active', now() - interval '3 days'),
            ($1, $6, 'member', 'active', now() + interval '1 hour')`,
    [groupId, MEMBER_ID, RIVAL_ID, FOURTH_ID, FIFTH_ID, LATECOMER_ID]
  );
  const season = await database.query<{ id: string }>(
    "select id from public.seasons where group_id = $1 and status = 'active'",
    [groupId]
  );
  for (const userId of [MEMBER_ID, RIVAL_ID, FOURTH_ID, FIFTH_ID, LATECOMER_ID]) {
    await database.query("select public.ensure_season_wallet($1, $2, null)", [season.rows[0].id, userId]);
  }
}, 60_000);

afterAll(async () => {
  await database?.close();
});

describe.sequential("dispute voting PostgreSQL integration", () => {
  it("limits voting to the frozen snapshot, one hidden vote each", async () => {
    const { disputeId, marketId } = await disputedMarket();

    await expect(vote(LATECOMER_ID, disputeId, "yes"))
      .rejects.toThrow("snapshot");
    await expect(vote(INTRUDER_ID, disputeId, "yes"))
      .rejects.toThrow("not found");

    const duplicateId = requestId();
    await vote(MEMBER_ID, disputeId, "yes", duplicateId);
    await expect(vote(MEMBER_ID, disputeId, "yes", duplicateId)).resolves.toBeUndefined();
    await expect(vote(MEMBER_ID, disputeId, "no", duplicateId))
      .rejects.toThrow("different vote");
    await expect(vote(MEMBER_ID, disputeId, "no"))
      .rejects.toThrow("already voted");

    // Hidden ballot: another member sees no votes before finalization,
    // while the voter sees only their own.
    await setAuthenticatedUser(RIVAL_ID);
    const hidden = await database.query<{ count: number }>(
      "select count(*)::integer as count from public.market_dispute_votes where dispute_id = $1",
      [disputeId]
    );
    expect(hidden.rows[0].count).toBe(0);

    await setAuthenticatedUser(MEMBER_ID);
    const own = await database.query<{ choice: string }>(
      "select choice from public.market_dispute_votes where dispute_id = $1",
      [disputeId]
    );
    expect(own.rows).toEqual([{ choice: "yes" }]);

    await resetRole();
    const audit = await database.query<{ leaked: number }>(
      "select count(*)::integer as leaked from public.audit_events where market_id = $1 and event_type = 'dispute_vote_cast' and new_state::text like '%choice%'",
      [marketId]
    );
    expect(audit.rows[0].leaked).toBe(0);

    await expect(database.query(
      "update public.market_dispute_votes set choice = 'no' where dispute_id = $1",
      [disputeId]
    )).rejects.toThrow("append-only");
  });

  it("finalizes early when every eligible voter has voted and reveals the tally", async () => {
    const { disputeId, marketId } = await disputedMarket();

    await vote(OWNER_ID, disputeId, "yes");
    await vote(MEMBER_ID, disputeId, "yes");
    await vote(RIVAL_ID, disputeId, "no");
    await vote(FOURTH_ID, disputeId, "yes");
    expect((await disputeState(disputeId)).final_outcome).toBeNull();

    await vote(FIFTH_ID, disputeId, "yes");

    const state = await disputeState(disputeId);
    expect(state.final_outcome).toBe("yes");
    expect(state.final_reason).toBe("decided");
    expect(await marketStatus(marketId)).toBe("disputed");

    await expect(vote(FIFTH_ID, disputeId, "no")).rejects.toThrow(/finalized|already voted/);

    await setAuthenticatedUser(RIVAL_ID);
    const revealed = await database.query<{ count: number }>(
      "select count(*)::integer as count from public.market_dispute_votes where dispute_id = $1",
      [disputeId]
    );
    expect(revealed.rows[0].count).toBe(5);
  });

  it("decides at exactly two-thirds once the deadline passes quorum-met votes", async () => {
    const { disputeId, marketId } = await disputedMarket();
    await vote(OWNER_ID, disputeId, "no");
    await vote(MEMBER_ID, disputeId, "no");
    await vote(RIVAL_ID, disputeId, "yes");

    expect(await finalizeIfDue(FOURTH_ID, marketId)).toBe("pending");

    await expireVoteDeadline(disputeId);
    expect(await finalizeIfDue(FOURTH_ID, marketId)).toBe("no");
    const state = await disputeState(disputeId);
    expect(state.final_outcome).toBe("no");
    expect(state.final_reason).toBe("decided");

    expect(await finalizeIfDue(OWNER_ID, marketId)).toBe("no");
  });

  it("cancels without quorum and without a two-thirds consensus", async () => {
    const quorumless = await disputedMarket();
    await vote(OWNER_ID, quorumless.disputeId, "yes");
    await vote(MEMBER_ID, quorumless.disputeId, "yes");
    await expireVoteDeadline(quorumless.disputeId);
    expect(await finalizeIfDue(OWNER_ID, quorumless.marketId)).toBe("cancel");
    expect((await disputeState(quorumless.disputeId)).final_reason).toBe("no_quorum");

    const splitVote = await disputedMarket();
    await vote(OWNER_ID, splitVote.disputeId, "yes");
    await vote(MEMBER_ID, splitVote.disputeId, "yes");
    await vote(RIVAL_ID, splitVote.disputeId, "no");
    await vote(FOURTH_ID, splitVote.disputeId, "cancel");
    await vote(FIFTH_ID, splitVote.disputeId, "no");

    const state = await disputeState(splitVote.disputeId);
    expect(state.final_outcome).toBe("cancel");
    expect(state.final_reason).toBe("no_consensus");
  });

  it("returns the market to closed on NOT READY and allows a fresh dispute later", async () => {
    const { disputeId, marketId } = await disputedMarket();
    for (const userId of VOTERS) {
      await vote(userId, disputeId, "not_ready");
    }

    const state = await disputeState(disputeId);
    expect(state.final_outcome).toBe("not_ready");
    expect(state.released_at).not.toBeNull();
    expect(await marketStatus(marketId)).toBe("closed");

    await setAuthenticatedUser(OWNER_ID);
    await database.query(
      "select public.propose_resolution($1::uuid, $2::uuid, 'yes', 'The official page now shows the final result.', 'https://example.com/results')",
      [marketId, requestId()]
    );
    expect(await marketStatus(marketId)).toBe("resolution_proposed");

    await setAuthenticatedUser(MEMBER_ID);
    const seconds = await database.query<{ dispute_id: string }>(
      "select public.dispute_resolution($1::uuid, $2::uuid, 'Still looks wrong to me.', null) as dispute_id",
      [marketId, requestId()]
    );
    expect(seconds.rows[0].dispute_id).not.toBe(disputeId);
    expect(await marketStatus(marketId)).toBe("disputed");
  });

  it("rejects late votes and keeps finalization deterministic and immutable", async () => {
    const { disputeId, marketId } = await disputedMarket();
    await vote(OWNER_ID, disputeId, "yes");
    await expireVoteDeadline(disputeId);

    await expect(vote(MEMBER_ID, disputeId, "yes")).rejects.toThrow("voting window has closed");

    expect(await finalizeIfDue(MEMBER_ID, marketId)).toBe("cancel");

    await resetRole();
    await expect(database.query(
      "update public.market_disputes set final_outcome = 'yes' where id = $1",
      [disputeId]
    )).rejects.toThrow("cannot be edited");

    await setAuthenticatedUser(INTRUDER_ID);
    await expect(database.query("select public.finalize_dispute_if_due($1::uuid)", [marketId]))
      .rejects.toThrow("not found");
    await expect(database.query("select * from public.dispute_vote_progress($1::uuid)", [disputeId]))
      .rejects.toThrow("not found");
  });
});
