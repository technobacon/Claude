// @vitest-environment node

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const OWNER_ID = "21000000-0000-4000-8000-000000000001";
const MEMBER_ID = "21000000-0000-4000-8000-000000000002";
const RIVAL_ID = "21000000-0000-4000-8000-000000000003";
const FOURTH_ID = "21000000-0000-4000-8000-000000000004";
const FIFTH_ID = "21000000-0000-4000-8000-000000000005";
const INTRUDER_ID = "21000000-0000-4000-8000-000000000006";
const VOTERS = [OWNER_ID, MEMBER_ID, RIVAL_ID, FOURTH_ID, FIFTH_ID];

let database: PGlite;
let groupId: string;
let requestCounter = 1;

function requestId() {
  return `22000000-0000-4000-8000-${String(requestCounter++).padStart(12, "0")}`;
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

async function expireChallengeWindow(marketId: string) {
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
}

async function closedMarket(stakes: Stake[], options: { closesAgoMinutes?: number; eligibleAgoMinutes?: number } = {}) {
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
  await timeTravelMarket(marketId, options.closesAgoMinutes ?? 60, options.eligibleAgoMinutes ?? 30);
  await setAuthenticatedUser(OWNER_ID);
  await database.query("select public.close_market_if_due($1::uuid)", [marketId]);
  return marketId;
}

async function propose(marketId: string, outcome: string) {
  await setAuthenticatedUser(OWNER_ID);
  await database.query(
    "select public.propose_resolution($1::uuid, $2::uuid, $3::text, 'The official page shows the final result.', 'https://example.com/results')",
    [marketId, requestId(), outcome]
  );
}

async function settleIfDue(userId: string, marketId: string) {
  await setAuthenticatedUser(userId);
  const result = await database.query<{ status: string }>(
    "select public.settle_market_if_due($1::uuid) as status",
    [marketId]
  );
  return result.rows[0].status;
}

async function marketLedger(marketId: string) {
  await resetRole();
  const result = await database.query<{ amount: number; type: string; user_id: string }>(
    "select user_id, type, amount from public.wallet_ledger_entries where market_id = $1 order by created_at, user_id",
    [marketId]
  );
  return result.rows;
}

async function marketNetsToZero(marketId: string) {
  await resetRole();
  const result = await database.query<{ net: number }>(
    "select coalesce(sum(amount), 0)::integer as net from public.wallet_ledger_entries where market_id = $1",
    [marketId]
  );
  return result.rows[0].net === 0;
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
  await createAuthUser(INTRUDER_ID, "Intruder");
  await setAuthenticatedUser(OWNER_ID);
  const created = await database.query<{ group_id: string }>(
    "select public.create_group('Settlement Crew', 'violet', 'members') as group_id"
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
            ($1, $4, 'member', 'active', now() - interval '30 days'),
            ($1, $5, 'member', 'active', now() - interval '30 days')`,
    [groupId, MEMBER_ID, RIVAL_ID, FOURTH_ID, FIFTH_ID]
  );
  // The season also has to reach back far enough for expiry-window rewinds.
  await database.query(
    "update public.seasons set starts_at = now() - interval '30 days' where group_id = $1",
    [groupId]
  );
  const season = await database.query<{ id: string }>(
    "select id from public.seasons where group_id = $1 and status = 'active'",
    [groupId]
  );
  for (const userId of [MEMBER_ID, RIVAL_ID, FOURTH_ID, FIFTH_ID]) {
    await database.query("select public.ensure_season_wallet($1, $2, null)", [season.rows[0].id, userId]);
  }
}, 60_000);

afterAll(async () => {
  await database?.close();
});

describe.sequential("settlement PostgreSQL integration", () => {
  it("settles an uncontested proposal with an exact largest-remainder allocation", async () => {
    const marketId = await closedMarket([
      { points: 30, side: "yes", userId: MEMBER_ID },
      { points: 30, side: "yes", userId: FIFTH_ID },
      { points: 40, side: "yes", userId: FOURTH_ID },
      { points: 33, side: "no", userId: RIVAL_ID }
    ]);
    await propose(marketId, "yes");

    expect(await settleIfDue(MEMBER_ID, marketId)).toBe("pending");
    await expireChallengeWindow(marketId);
    expect(await settleIfDue(MEMBER_ID, marketId)).toBe("settled");
    expect(await settleIfDue(RIVAL_ID, marketId)).toBe("settled");

    // Pool 133 over a 100-point winning side: floors 39/39/53 leave two
    // points for the two largest remainders (the earlier 30-point stakes).
    const credits = (await marketLedger(marketId)).filter((entry) => entry.type === "settlement_credit");
    expect(credits.map((entry) => [entry.user_id, Number(entry.amount)])).toEqual([
      [MEMBER_ID, 40],
      [FOURTH_ID, 53],
      [FIFTH_ID, 40]
    ]);
    expect(await marketNetsToZero(marketId)).toBe(true);

    await resetRole();
    const record = await database.query<{ outcome: string; payout_total: number; status: string; trigger_kind: string; winner_count: number }>(
      `select settlement.outcome, settlement.trigger_kind, settlement.winner_count, settlement.payout_total::integer, market.status
       from public.market_settlements settlement
       join public.markets market on market.id = settlement.market_id
       where settlement.market_id = $1`,
      [marketId]
    );
    expect(record.rows[0]).toEqual({
      outcome: "yes",
      payout_total: 133,
      status: "settled",
      trigger_kind: "uncontested_proposal",
      winner_count: 3
    });

    const proposal = await database.query<{ status: string }>(
      "select status from public.market_resolution_proposals where market_id = $1",
      [marketId]
    );
    expect(proposal.rows[0].status).toBe("accepted");
  });

  it("executes a vote-decided outcome and pays the surviving side", async () => {
    const marketId = await closedMarket([
      { points: 60, side: "yes", userId: MEMBER_ID },
      { points: 40, side: "no", userId: RIVAL_ID }
    ]);
    await propose(marketId, "yes");
    await setAuthenticatedUser(RIVAL_ID);
    const disputeResult = await database.query<{ dispute_id: string }>(
      "select public.dispute_resolution($1::uuid, $2::uuid, 'The number in the screenshot is wrong.', null) as dispute_id",
      [marketId, requestId()]
    );
    for (const voter of VOTERS) {
      await setAuthenticatedUser(voter);
      await database.query(
        "select public.cast_dispute_vote($1::uuid, $2::uuid, 'no')",
        [disputeResult.rows[0].dispute_id, requestId()]
      );
    }

    expect(await settleIfDue(MEMBER_ID, marketId)).toBe("settled");

    const credits = (await marketLedger(marketId)).filter((entry) => entry.type === "settlement_credit");
    expect(credits).toEqual([
      expect.objectContaining({ type: "settlement_credit", user_id: RIVAL_ID })
    ]);
    expect(Number(credits[0].amount)).toBe(100);
    expect(await marketNetsToZero(marketId)).toBe(true);
  });

  it("refunds exactly on group cancellation and on an uncontested cancel proposal", async () => {
    const voteCancelId = await closedMarket([
      { points: 45, side: "yes", userId: MEMBER_ID },
      { points: 25, side: "no", userId: RIVAL_ID }
    ]);
    await propose(voteCancelId, "yes");
    await setAuthenticatedUser(MEMBER_ID);
    const disputeResult = await database.query<{ dispute_id: string }>(
      "select public.dispute_resolution($1::uuid, $2::uuid, 'This cannot be verified either way.', null) as dispute_id",
      [voteCancelId, requestId()]
    );
    for (const voter of VOTERS) {
      await setAuthenticatedUser(voter);
      await database.query(
        "select public.cast_dispute_vote($1::uuid, $2::uuid, 'cancel')",
        [disputeResult.rows[0].dispute_id, requestId()]
      );
    }
    expect(await settleIfDue(MEMBER_ID, voteCancelId)).toBe("cancelled");

    const voteRefunds = (await marketLedger(voteCancelId)).filter((entry) => entry.type === "refund_credit");
    expect(voteRefunds.map((entry) => [entry.user_id, Number(entry.amount)]).sort()).toEqual([
      [MEMBER_ID, 45],
      [RIVAL_ID, 25]
    ].sort());
    expect(await marketNetsToZero(voteCancelId)).toBe(true);

    const proposalCancelId = await closedMarket([
      { points: 20, side: "yes", userId: FOURTH_ID },
      { points: 30, side: "no", userId: FIFTH_ID }
    ]);
    await propose(proposalCancelId, "cancel");
    await expireChallengeWindow(proposalCancelId);
    expect(await settleIfDue(FOURTH_ID, proposalCancelId)).toBe("cancelled");
    expect(await marketNetsToZero(proposalCancelId)).toBe(true);

    await resetRole();
    const kinds = await database.query<{ trigger_kind: string }>(
      "select trigger_kind from public.market_settlements where market_id = any($1::uuid[]) order by trigger_kind",
      [[voteCancelId, proposalCancelId]]
    );
    expect(kinds.rows.map((row) => row.trigger_kind)).toEqual(["dispute_vote", "uncontested_proposal"]);
  });

  it("refunds a market nobody resolves within the expiry window", async () => {
    const marketId = await closedMarket(
      [
        { points: 50, side: "yes", userId: MEMBER_ID },
        { points: 50, side: "no", userId: RIVAL_ID }
      ],
      { closesAgoMinutes: 9 * 24 * 60, eligibleAgoMinutes: 8 * 24 * 60 }
    );

    expect(await settleIfDue(MEMBER_ID, marketId)).toBe("cancelled");
    expect(await marketNetsToZero(marketId)).toBe(true);

    await resetRole();
    const record = await database.query<{ trigger_kind: string }>(
      "select trigger_kind from public.market_settlements where market_id = $1",
      [marketId]
    );
    expect(record.rows[0].trigger_kind).toBe("expired_unresolved");
  });

  it("cannot settle twice, before it is due, without membership, or by editing records", async () => {
    const marketId = await closedMarket([
      { points: 15, side: "yes", userId: MEMBER_ID },
      { points: 15, side: "no", userId: RIVAL_ID }
    ]);

    expect(await settleIfDue(MEMBER_ID, marketId)).toBe("pending");
    await propose(marketId, "yes");
    expect(await settleIfDue(MEMBER_ID, marketId)).toBe("pending");

    await setAuthenticatedUser(INTRUDER_ID);
    await expect(database.query("select public.settle_market_if_due($1::uuid)", [marketId]))
      .rejects.toThrow("not found");

    await expireChallengeWindow(marketId);
    expect(await settleIfDue(MEMBER_ID, marketId)).toBe("settled");
    expect(await settleIfDue(MEMBER_ID, marketId)).toBe("settled");

    await resetRole();
    const singleCredit = await database.query<{ count: number }>(
      "select count(*)::integer as count from public.wallet_ledger_entries where market_id = $1 and type = 'settlement_credit'",
      [marketId]
    );
    expect(singleCredit.rows[0].count).toBe(1);

    await expect(database.query(
      `insert into public.market_settlements (market_id, group_id, season_id, outcome, trigger_kind, total_pool, winning_pool, losing_pool, winner_count, payout_total)
       select market_id, group_id, season_id, 'no', 'dispute_vote', total_pool, winning_pool, losing_pool, winner_count, payout_total
       from public.market_settlements where market_id = $1`,
      [marketId]
    )).rejects.toThrow(/duplicate key|primary key/i);
    await expect(database.query(
      "update public.market_settlements set outcome = 'no' where market_id = $1",
      [marketId]
    )).rejects.toThrow("append-only");

    await setAuthenticatedUser(INTRUDER_ID);
    const hidden = await database.query<{ count: number }>(
      "select count(*)::integer as count from public.market_settlements where market_id = $1",
      [marketId]
    );
    expect(hidden.rows[0].count).toBe(0);
  });

  it("keeps every payout above the stake and every pool exactly allocated across varied splits", async () => {
    const scenarios: Stake[][] = [
      [
        { points: 10, side: "yes", userId: MEMBER_ID },
        { points: 90, side: "yes", userId: FOURTH_ID },
        { points: 77, side: "no", userId: RIVAL_ID }
      ],
      [
        { points: 13, side: "yes", userId: MEMBER_ID },
        { points: 17, side: "yes", userId: FOURTH_ID },
        { points: 19, side: "yes", userId: FIFTH_ID },
        { points: 97, side: "no", userId: RIVAL_ID }
      ],
      [
        { points: 99, side: "yes", userId: MEMBER_ID },
        { points: 11, side: "no", userId: RIVAL_ID },
        { points: 23, side: "no", userId: FOURTH_ID }
      ]
    ];

    for (const stakes of scenarios) {
      const marketId = await closedMarket(stakes);
      await propose(marketId, "yes");
      await expireChallengeWindow(marketId);
      expect(await settleIfDue(OWNER_ID, marketId)).toBe("settled");
      expect(await marketNetsToZero(marketId)).toBe(true);

      const ledger = await marketLedger(marketId);
      const credits = ledger.filter((entry) => entry.type === "settlement_credit");
      const totalPool = stakes.reduce((sum, stake) => sum + stake.points, 0);
      const creditTotal = credits.reduce((sum, entry) => sum + Number(entry.amount), 0);
      expect(creditTotal).toBe(totalPool);

      for (const stake of stakes.filter((candidate) => candidate.side === "yes")) {
        const credit = credits.find((entry) => entry.user_id === stake.userId);
        expect(Number(credit?.amount ?? 0)).toBeGreaterThanOrEqual(stake.points);
      }
      for (const stake of stakes.filter((candidate) => candidate.side === "no")) {
        expect(credits.some((entry) => entry.user_id === stake.userId)).toBe(false);
      }
    }
  });
});
