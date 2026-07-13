// @vitest-environment node

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const OWNER_ID = "11000000-0000-4000-8000-000000000001";
const MODERATOR_ID = "11000000-0000-4000-8000-000000000002";
const MEMBER_ID = "11000000-0000-4000-8000-000000000003";
const INTRUDER_ID = "11000000-0000-4000-8000-000000000004";

let database: PGlite;
let groupId: string;
let requestCounter = 1;

function requestId() {
  return `12000000-0000-4000-8000-${String(requestCounter++).padStart(12, "0")}`;
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

async function setServiceRole() {
  await resetRole();
  await database.query("select set_config('request.jwt.claim.sub', '', false)");
  await database.query("select set_config('request.jwt.claim.role', 'service_role', false)");
  await database.exec("set role service_role;");
}

async function setAnonRole() {
  await resetRole();
  await database.query("select set_config('request.jwt.claim.sub', '', false)");
  await database.query("select set_config('request.jwt.claim.role', 'anon', false)");
  await database.exec("set role anon;");
}

async function createAuthUser(userId: string, displayName: string) {
  await resetRole();
  await database.query(
    "insert into auth.users (id, raw_user_meta_data) values ($1::uuid, jsonb_build_object('display_name', $2::text))",
    [userId, displayName]
  );
}

type Contract = {
  cancel: string;
  closesAt: string;
  creatorCanParticipate: boolean;
  no: string;
  outcomeControl: "creator_influenced" | "independent" | "participant_influenced";
  publish: boolean;
  question: string;
  resolutionAt: string;
  resolutionMode: "creator_final" | "disputable";
  source: string;
  sourceUrl: string | null;
  template: string;
  timezone: string;
  yes: string;
};

function validContract(overrides: Partial<Contract> = {}): Contract {
  return {
    cancel: "Cancel if the official result is unavailable after 24 hours.",
    closesAt: new Date(Date.now() + 86_400_000).toISOString(),
    creatorCanParticipate: true,
    no: "NO if the official final result does not meet the threshold.",
    outcomeControl: "independent",
    publish: false,
    question: "Will Team Violet meet the official threshold tomorrow?",
    resolutionAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
    resolutionMode: "disputable",
    source: "The official event result page.",
    sourceUrl: "https://example.com/results",
    template: "sports",
    timezone: "UTC",
    yes: "YES if the official final result meets the threshold.",
    ...overrides
  };
}

async function createMarket(userId: string, creationRequestId: string, contract: Contract) {
  await setAuthenticatedUser(userId);
  const result = await database.query<{ market_id: string }>(
    `select public.create_market(
      $1::uuid, $2::uuid, $3::text, $4::text, $5::text, $6::text, $7::text, $8::text,
      $9::text, $10::timestamptz, $11::timestamptz, $12::text, $13::text, $14::boolean,
      $15::text, $16::boolean
    ) as market_id`,
    [
      groupId,
      creationRequestId,
      contract.template,
      contract.question,
      contract.yes,
      contract.no,
      contract.cancel,
      contract.source,
      contract.sourceUrl,
      contract.closesAt,
      contract.resolutionAt,
      contract.timezone,
      contract.resolutionMode,
      contract.creatorCanParticipate,
      contract.outcomeControl,
      contract.publish
    ]
  );
  return result.rows[0].market_id;
}

async function saveMarket(
  userId: string,
  marketId: string,
  expectedRevision: number,
  mutationRequestId: string,
  contract: Contract
) {
  await setAuthenticatedUser(userId);
  const result = await database.query<{ revision: number }>(
    `select public.save_market_draft(
      $1::uuid, $2::integer, $3::uuid, $4::text, $5::text, $6::text, $7::text, $8::text,
      $9::text, $10::text, $11::timestamptz, $12::timestamptz, $13::text, $14::text,
      $15::boolean, $16::text
    ) as revision`,
    [
      marketId,
      expectedRevision,
      mutationRequestId,
      contract.template,
      contract.question,
      contract.yes,
      contract.no,
      contract.cancel,
      contract.source,
      contract.sourceUrl,
      contract.closesAt,
      contract.resolutionAt,
      contract.timezone,
      contract.resolutionMode,
      contract.creatorCanParticipate,
      contract.outcomeControl
    ]
  );
  return Number(result.rows[0].revision);
}

async function lockWithFirstPosition(marketId: string, userId: string) {
  await resetRole();
  await database.exec("begin");
  try {
    await database.query("update public.markets set first_stake_at = now() where id = $1", [marketId]);
    await database.query(
      "insert into public.positions (market_id, user_id, side, points) values ($1, $2, 'yes', 10)",
      [marketId, userId]
    );
    await database.exec("commit");
  } catch (error) {
    await database.exec("rollback");
    throw error;
  }
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
  await createAuthUser(MODERATOR_ID, "Moderator");
  await createAuthUser(MEMBER_ID, "Member");
  await createAuthUser(INTRUDER_ID, "Intruder");
  await setAuthenticatedUser(OWNER_ID);
  const created = await database.query<{ group_id: string }>(
    "select public.create_group('Market Crew', 'violet', 'members') as group_id"
  );
  groupId = created.rows[0].group_id;

  await resetRole();
  await database.query(
    `insert into public.group_memberships (group_id, user_id, role, status)
     values ($1, $2, 'moderator', 'active'), ($1, $3, 'member', 'active')`,
    [groupId, MODERATOR_ID, MEMBER_ID]
  );
}, 60_000);

afterAll(async () => {
  await database?.close();
});

describe.sequential("market creation PostgreSQL integration", () => {
  it("enforces every group creation policy with active membership", async () => {
    await expect(createMarket(MEMBER_ID, requestId(), validContract())).resolves.toMatch(/[0-9a-f-]{36}/);
    await expect(createMarket(INTRUDER_ID, requestId(), validContract())).rejects.toThrow("permission");

    await resetRole();
    await database.query("update public.groups set creation_policy = 'moderators' where id = $1", [groupId]);
    await expect(createMarket(MEMBER_ID, requestId(), validContract())).rejects.toThrow("permission");
    await expect(createMarket(MODERATOR_ID, requestId(), validContract())).resolves.toMatch(/[0-9a-f-]{36}/);

    await resetRole();
    await database.query("update public.groups set creation_policy = 'owner' where id = $1", [groupId]);
    await expect(createMarket(MODERATOR_ID, requestId(), validContract())).rejects.toThrow("permission");
    await expect(createMarket(OWNER_ID, requestId(), validContract())).resolves.toMatch(/[0-9a-f-]{36}/);

    await resetRole();
    await database.query("update public.groups set creation_policy = 'members' where id = $1", [groupId]);
  });

  it("deduplicates creation requests and rejects request reuse with changed rules", async () => {
    const idempotencyId = requestId();
    const contract = validContract();
    const firstMarketId = await createMarket(OWNER_ID, idempotencyId, contract);
    const repeatedMarketId = await createMarket(OWNER_ID, idempotencyId, contract);

    expect(repeatedMarketId).toBe(firstMarketId);
    await expect(createMarket(OWNER_ID, idempotencyId, { ...contract, question: "Will a changed question be rejected tomorrow?" }))
      .rejects.toThrow("different market details");

    await resetRole();
    const count = await database.query<{ count: number }>(
      "select count(*)::integer as count from public.markets where creator_user_id = $1 and creation_request_id = $2",
      [OWNER_ID, idempotencyId]
    );
    expect(count.rows[0].count).toBe(1);

    const memberRequestId = requestId();
    const memberContract = validContract();
    const memberMarketId = await createMarket(MEMBER_ID, memberRequestId, memberContract);
    await resetRole();
    await database.query("update public.groups set creation_policy = 'owner' where id = $1", [groupId]);
    await expect(createMarket(MEMBER_ID, memberRequestId, memberContract)).resolves.toBe(memberMarketId);
    await resetRole();
    await database.query("update public.groups set creation_policy = 'members' where id = $1", [groupId]);
  });

  it("never returns an idempotent market from a different group", async () => {
    const originalGroupId = groupId;
    const sharedRequestId = requestId();
    const contract = validContract();
    await createMarket(OWNER_ID, sharedRequestId, contract);

    await setAuthenticatedUser(OWNER_ID);
    const secondGroup = await database.query<{ group_id: string }>(
      "select public.create_group('Second Market Crew', 'emerald', 'members') as group_id"
    );
    groupId = secondGroup.rows[0].group_id;
    try {
      await expect(createMarket(OWNER_ID, sharedRequestId, contract)).rejects.toThrow("different market details");
    } finally {
      groupId = originalGroupId;
    }
  });

  it("keeps drafts private, publishes once, and denies direct table writes", async () => {
    const draftId = await createMarket(OWNER_ID, requestId(), validContract());

    await setAuthenticatedUser(MEMBER_ID);
    const memberDraft = await database.query<{ count: number }>(
      "select count(*)::integer as count from public.markets where id = $1",
      [draftId]
    );
    expect(memberDraft.rows[0].count).toBe(0);

    await setAuthenticatedUser(MODERATOR_ID);
    const moderatorDraft = await database.query<{ count: number }>(
      "select count(*)::integer as count from public.markets where id = $1",
      [draftId]
    );
    expect(moderatorDraft.rows[0].count).toBe(1);

    await setAuthenticatedUser(OWNER_ID);
    await database.query("select public.publish_market($1, 1, $2)", [draftId, requestId()]);

    await setAuthenticatedUser(MEMBER_ID);
    const memberPublished = await database.query<{ count: number }>(
      "select count(*)::integer as count from public.markets where id = $1",
      [draftId]
    );
    expect(memberPublished.rows[0].count).toBe(1);

    await setAuthenticatedUser(INTRUDER_ID);
    const intruderPublished = await database.query<{ count: number }>(
      "select count(*)::integer as count from public.markets where id = $1",
      [draftId]
    );
    expect(intruderPublished.rows[0].count).toBe(0);

    await setAuthenticatedUser(MEMBER_ID);
    await expect(database.query("insert into public.markets (group_id) values ($1)", [groupId]))
      .rejects.toThrow(/permission denied/i);
    await expect(database.query("select * from public.market_mutation_receipts"))
      .rejects.toThrow(/permission denied/i);

    await setServiceRole();
    await expect(database.exec("truncate table public.markets")).rejects.toThrow(/permission denied/i);
  });

  it("never leaks another invitation preview when an anonymous token does not match", async () => {
    const firstHash = "a".repeat(64);
    const secondHash = "b".repeat(64);
    await setAuthenticatedUser(OWNER_ID);
    const first = await database.query<{ invitation_id: string }>(
      "select public.create_invitation($1, $2, null, now() + interval '1 day', 1) as invitation_id",
      [groupId, firstHash]
    );
    const second = await database.query<{ invitation_id: string }>(
      "select public.create_invitation($1, $2, null, now() + interval '1 day', 1) as invitation_id",
      [groupId, secondHash]
    );

    await setAnonRole();
    const firstPreview = await database.query<{ invitation_id: string }>(
      "select invitation_id from public.preview_invitation($1)",
      [firstHash]
    );
    const secondPreview = await database.query<{ invitation_id: string }>(
      "select invitation_id from public.preview_invitation($1)",
      [secondHash]
    );
    const missingPreview = await database.query<{ invitation_id: string }>(
      "select invitation_id from public.preview_invitation($1)",
      ["c".repeat(64)]
    );

    expect(firstPreview.rows).toEqual([{ invitation_id: first.rows[0].invitation_id }]);
    expect(secondPreview.rows).toEqual([{ invitation_id: second.rows[0].invitation_id }]);
    expect(missingPreview.rows).toEqual([]);
  });

  it("rejects market-scoped invitations until the market is published", async () => {
    const draftId = await createMarket(OWNER_ID, requestId(), validContract());
    await setAuthenticatedUser(OWNER_ID);
    await expect(database.query(
      "select public.create_invitation($1, $2, $3, now() + interval '1 day', 1)",
      [groupId, "d".repeat(64), draftId]
    )).rejects.toThrow("Draft markets");

    const publishedId = await createMarket(OWNER_ID, requestId(), validContract({ publish: true }));
    const publishedHash = "e".repeat(64);
    await setAuthenticatedUser(OWNER_ID);
    const invitation = await database.query<{ invitation_id: string }>(
      "select public.create_invitation($1, $2, $3, now() + interval '1 day', 1) as invitation_id",
      [groupId, publishedHash, publishedId]
    );
    await saveMarket(OWNER_ID, publishedId, 1, requestId(), validContract());

    await resetRole();
    const revoked = await database.query<{ revoked_at: string | null }>(
      "select revoked_at from public.invitations where id = $1",
      [invitation.rows[0].invitation_id]
    );
    expect(revoked.rows[0].revoked_at).not.toBeNull();

    await setAuthenticatedUser(INTRUDER_ID);
    await expect(database.query("select public.accept_invitation($1)", [publishedHash]))
      .rejects.toThrow("invalid or expired");
  });

  it("saves revisions idempotently, returns an open market to draft, and publishes one audit event", async () => {
    const marketId = await createMarket(OWNER_ID, requestId(), validContract({ publish: true }));
    const saveRequestId = requestId();
    const changed = validContract({ question: "Will Team Violet meet the revised official threshold tomorrow?" });

    expect(await saveMarket(OWNER_ID, marketId, 1, saveRequestId, changed)).toBe(2);
    expect(await saveMarket(OWNER_ID, marketId, 1, saveRequestId, changed)).toBe(2);
    await expect(saveMarket(OWNER_ID, marketId, 2, saveRequestId, changed))
      .rejects.toThrow("different market details");
    await expect(saveMarket(
      OWNER_ID,
      marketId,
      2,
      saveRequestId,
      { ...changed, question: "Will request reuse with different rules fail tomorrow?" }
    )).rejects.toThrow("different market details");

    await resetRole();
    const draft = await database.query<{ published_at: string | null; status: string }>(
      "select status, published_at from public.markets where id = $1",
      [marketId]
    );
    expect(draft.rows[0]).toEqual({ published_at: null, status: "draft" });

    await setAuthenticatedUser(OWNER_ID);
    expect(Number((await database.query<{ revision: number }>(
      "select public.publish_market($1, 2, $2) as revision",
      [marketId, requestId()]
    )).rows[0].revision)).toBe(2);

    await resetRole();
    const audit = await database.query<{ count: number }>(
      "select count(*)::integer as count from public.audit_events where market_id = $1 and event_type = 'market_published'",
      [marketId]
    );
    expect(audit.rows[0].count).toBe(2);
  });

  it("rejects null and stale optimistic revisions", async () => {
    const marketId = await createMarket(OWNER_ID, requestId(), validContract());
    const changed = validContract({ question: "Will Team Violet pass the newer official threshold tomorrow?" });

    await expect(saveMarket(OWNER_ID, marketId, null as unknown as number, requestId(), changed))
      .rejects.toThrow("positive expected rule revision");
    expect(await saveMarket(OWNER_ID, marketId, 1, requestId(), changed)).toBe(2);
    await expect(saveMarket(OWNER_ID, marketId, 1, requestId(), changed))
      .rejects.toThrow("changed in another session");

    await setAuthenticatedUser(OWNER_ID);
    await expect(database.query("select public.publish_market($1, null, $2)", [marketId, requestId()]))
      .rejects.toThrow("positive expected rule revision");
    await expect(database.query("select public.publish_market($1, 1, $2)", [marketId, requestId()]))
      .rejects.toThrow("changed in another session");

    const openMarketId = await createMarket(OWNER_ID, requestId(), validContract({ publish: true }));
    await setAuthenticatedUser(OWNER_ID);
    await expect(database.query("select public.publish_market($1, 2, $2)", [openMarketId, requestId()]))
      .rejects.toThrow("changed in another session");
  });

  it("atomically snapshots and locks every funded contract field at the first stake", async () => {
    const marketId = await createMarket(OWNER_ID, requestId(), validContract({ publish: true }));

    await resetRole();
    await expect(database.query(
      "update public.markets set first_stake_at = now(), rule_revision = rule_revision + 1 where id = $1",
      [marketId]
    )).rejects.toThrow("without changing");
    await expect(database.query(
      "update public.markets set first_stake_at = now(), status = 'closed' where id = $1",
      [marketId]
    )).rejects.toThrow("published open market");
    await expect(database.query("update public.markets set first_stake_at = now() where id = $1", [marketId]))
      .rejects.toThrow("same transaction");
    await lockWithFirstPosition(marketId, OWNER_ID);
    const snapshot = await database.query<{ count: number; rules_hash: string }>(
      "select count(*) over ()::integer as count, rules_hash from public.market_rule_snapshots where market_id = $1",
      [marketId]
    );
    expect(snapshot.rows).toHaveLength(1);
    expect(snapshot.rows[0].count).toBe(1);
    expect(snapshot.rows[0].rules_hash).toMatch(/^[0-9a-f]{64}$/);

    await expect(database.query("update public.markets set question = 'Will locked rules change incorrectly?' where id = $1", [marketId]))
      .rejects.toThrow("immutable");
    await expect(database.query("update public.markets set first_stake_at = now() where id = $1", [marketId]))
      .rejects.toThrow("immutable");
    await expect(database.query("update public.market_rule_snapshots set rule_revision = 2 where market_id = $1", [marketId]))
      .rejects.toThrow("append-only");

    await setAuthenticatedUser(MEMBER_ID);
    const visibleSnapshot = await database.query<{ count: number }>(
      "select count(*)::integer as count from public.market_rule_snapshots where market_id = $1",
      [marketId]
    );
    expect(visibleSnapshot.rows[0].count).toBe(1);

    await setAuthenticatedUser(INTRUDER_ID);
    const hiddenSnapshot = await database.query<{ count: number }>(
      "select count(*)::integer as count from public.market_rule_snapshots where market_id = $1",
      [marketId]
    );
    expect(hiddenSnapshot.rows[0].count).toBe(0);
  });

  it("requires the first position and immutable rules snapshot in the same transaction", async () => {
    const marketId = await createMarket(OWNER_ID, requestId(), validContract({ publish: true }));

    await resetRole();
    await expect(database.query(
      "insert into public.positions (market_id, user_id, side, points) values ($1, $2, 'yes', 10)",
      [marketId, OWNER_ID]
    )).rejects.toThrow("same transaction");

    await lockWithFirstPosition(marketId, OWNER_ID);

    await setAuthenticatedUser(MEMBER_ID);
    await expect(database.query(
      "insert into public.positions (market_id, user_id, side, points) values ($1, $2, 'no', 10)",
      [marketId, MEMBER_ID]
    )).rejects.toThrow(/permission denied/i);
  });

  it("revalidates deadlines, timezones, season bounds, and controlled settlement in PostgreSQL", async () => {
    await expect(createMarket(OWNER_ID, requestId(), validContract({
      closesAt: new Date(Date.now() - 60_000).toISOString()
    }))).rejects.toThrow("future");
    await expect(createMarket(OWNER_ID, requestId(), validContract({ timezone: "Mars/Olympus" })))
      .rejects.toThrow("IANA timezone");
    await expect(createMarket(OWNER_ID, requestId(), validContract({
      creatorCanParticipate: false,
      outcomeControl: "participant_influenced",
      resolutionMode: "creator_final"
    }))).rejects.toThrow("group dispute");
    await expect(createMarket(OWNER_ID, requestId(), validContract({
      closesAt: new Date(Date.now() + 100 * 86_400_000).toISOString(),
      resolutionAt: new Date(Date.now() + 101 * 86_400_000).toISOString()
    }))).rejects.toThrow("season ends");

    await expect(createMarket(OWNER_ID, requestId(), validContract({
      publish: true,
      question: "Will {team} meet the official threshold tomorrow?"
    }))).rejects.toThrow("template placeholder");

    const placeholderDraft = await createMarket(OWNER_ID, requestId(), validContract({
      question: "Will {team} meet the official threshold tomorrow?"
    }));
    await setAuthenticatedUser(OWNER_ID);
    await expect(database.query("select public.publish_market($1, 1, $2)", [placeholderDraft, requestId()]))
      .rejects.toThrow("template placeholder");

    await resetRole();
    const season = await database.query<{ id: string; starts_at: string }>(
      "select id, starts_at from public.seasons where group_id = $1 and status = 'active'",
      [groupId]
    );
    await database.query("update public.seasons set starts_at = now() + interval '1 day' where id = $1", [season.rows[0].id]);
    await expect(createMarket(OWNER_ID, requestId(), validContract())).rejects.toThrow("active season");
    await resetRole();
    await database.query("update public.seasons set starts_at = $2 where id = $1", [season.rows[0].id, season.rows[0].starts_at]);
  });
});
