// @vitest-environment node

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const OWNER_ID = "10000000-0000-4000-8000-000000000001";
const MANUAL_OWNER_ID = "10000000-0000-4000-8000-000000000002";
const MEMBER_ID = "10000000-0000-4000-8000-000000000003";
const INTRUDER_ID = "10000000-0000-4000-8000-000000000004";
const MANUAL_GROUP_ID = "20000000-0000-4000-8000-000000000001";
const MANUAL_SEASON_ID = "30000000-0000-4000-8000-000000000001";

let database: PGlite;

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

async function createAuthUser(userId: string, displayName: string) {
  await resetRole();
  await database.query(
    "insert into auth.users (id, raw_user_meta_data) values ($1::uuid, jsonb_build_object('display_name', $2::text))",
    [userId, displayName]
  );
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
}, 60_000);

afterAll(async () => {
  await database?.close();
});

describe.sequential("wallet ledger PostgreSQL integration", () => {
  it("creates one opening wallet, receipt, and ledger entry through the group RPC", async () => {
    await createAuthUser(OWNER_ID, "Owner");
    await setAuthenticatedUser(OWNER_ID);
    const created = await database.query<{ group_id: string }>(
      "select public.create_group('Ledger Crew', 'violet', 'members') as group_id"
    );
    const groupId = created.rows[0].group_id;

    await resetRole();
    const result = await database.query<{ entries: number; receipts: number; wallets: number }>(
      `select
        (select count(*)::integer from public.season_wallets where group_id = $1) as wallets,
        (select count(*)::integer from public.wallet_ledger_entries where group_id = $1 and type = 'opening_grant') as entries,
        (select count(*)::integer from public.wallet_grant_receipts where group_id = $1 and grant_type = 'opening') as receipts`,
      [groupId]
    );

    expect(result.rows[0]).toEqual({ entries: 1, receipts: 1, wallets: 1 });
  });

  it("catches up weekly grants once, records zero-at-cap receipts, and reconciles", async () => {
    await createAuthUser(MANUAL_OWNER_ID, "Manual Owner");
    await createAuthUser(MEMBER_ID, "Member");
    await createAuthUser(INTRUDER_ID, "Intruder");
    await resetRole();
    await database.query(
      `insert into public.groups (id, name, owner_user_id)
       values ($1, 'Catch-up Crew', $2)`,
      [MANUAL_GROUP_ID, MANUAL_OWNER_ID]
    );
    await database.query(
      `insert into public.group_memberships (group_id, user_id, role, status, joined_at)
       values
         ($1, $2, 'owner', 'active', now() - interval '15 days'),
         ($1, $3, 'member', 'active', now() - interval '15 days')`,
      [MANUAL_GROUP_ID, MANUAL_OWNER_ID, MEMBER_ID]
    );
    await database.query(
      `insert into public.seasons (
         id, group_id, name, starts_at, ends_at, status,
         opening_grant, weekly_grant, wallet_cap, max_market_stake, minimum_position
       ) values (
         $1, $2, 'Catch-up Season', now() - interval '15 days', now() + interval '60 days', 'active',
         1900, 200, 2000, 100, 10
       )`,
      [MANUAL_SEASON_ID, MANUAL_GROUP_ID]
    );
    await database.query("select public.ensure_season_wallet($1, $2, null)", [MANUAL_SEASON_ID, MANUAL_OWNER_ID]);
    await database.query("select public.ensure_season_wallet($1, $2, null)", [MANUAL_SEASON_ID, MEMBER_ID]);

    await setAuthenticatedUser(MANUAL_OWNER_ID);
    const missedPeriods = await database.query<{ is_reconciled: boolean }>(
      "select is_reconciled from public.reconcile_group_wallets($1)",
      [MANUAL_GROUP_ID]
    );
    expect(missedPeriods.rows.every((row) => !row.is_reconciled)).toBe(true);

    const applied = await database.query<{
      total_points: bigint;
      wallets_credited: number;
      wallets_processed: number;
    }>("select * from public.apply_current_weekly_grants($1)", [MANUAL_GROUP_ID]);

    expect(Number(applied.rows[0].wallets_processed)).toBe(4);
    expect(Number(applied.rows[0].wallets_credited)).toBe(2);
    expect(Number(applied.rows[0].total_points)).toBe(200);

    const repeated = await database.query<{ wallets_processed: number }>(
      "select * from public.apply_current_weekly_grants($1)",
      [MANUAL_GROUP_ID]
    );
    expect(Number(repeated.rows[0].wallets_processed)).toBe(0);

    await resetRole();
    const counts = await database.query<{ opening_entries: number; weekly_entries: number; weekly_receipts: number }>(
      `select
        count(*) filter (where type = 'opening_grant')::integer as opening_entries,
        count(*) filter (where type = 'weekly_grant')::integer as weekly_entries,
        (select count(*)::integer from public.wallet_grant_receipts
          where group_id = $1 and grant_type = 'weekly') as weekly_receipts
       from public.wallet_ledger_entries where group_id = $1`,
      [MANUAL_GROUP_ID]
    );
    expect(counts.rows[0]).toEqual({ opening_entries: 2, weekly_entries: 2, weekly_receipts: 4 });

    await setAuthenticatedUser(MANUAL_OWNER_ID);
    const reconciliation = await database.query<{ is_reconciled: boolean }>(
      "select is_reconciled from public.reconcile_group_wallets($1)",
      [MANUAL_GROUP_ID]
    );
    expect(reconciliation.rows).toHaveLength(2);
    expect(reconciliation.rows.every((row) => row.is_reconciled)).toBe(true);
  });

  it("enforces append-only records, direct-write denial, RLS, and null-safe role checks", async () => {
    await resetRole();
    await expect(
      database.exec("update public.wallet_ledger_entries set amount = amount + 1 where group_id = '20000000-0000-4000-8000-000000000001'")
    ).rejects.toThrow("append-only");
    await expect(
      database.exec("update public.wallet_grant_receipts set credited_amount = credited_amount where group_id = '20000000-0000-4000-8000-000000000001'")
    ).rejects.toThrow("append-only");

    await setAuthenticatedUser(MANUAL_OWNER_ID);
    await expect(
      database.exec(`insert into public.wallet_ledger_entries (
        user_id, group_id, season_id, type, amount, idempotency_key
      ) values (
        '${MANUAL_OWNER_ID}', '${MANUAL_GROUP_ID}', '${MANUAL_SEASON_ID}', 'admin_adjustment', 1, 'direct-write'
      )`)
    ).rejects.toThrow(/permission denied/i);

    await setServiceRole();
    await expect(database.exec("truncate table public.wallet_grant_receipts")).rejects.toThrow(/permission denied/i);

    await setAuthenticatedUser(INTRUDER_ID);
    const hiddenLedger = await database.query<{ count: number }>(
      "select count(*)::integer as count from public.wallet_ledger_entries"
    );
    expect(hiddenLedger.rows[0].count).toBe(0);
    await expect(
      database.query("select * from public.apply_current_weekly_grants($1)", [MANUAL_GROUP_ID])
    ).rejects.toThrow("Only group owners");
    await expect(
      database.query("select * from public.reconcile_group_wallets($1)", [MANUAL_GROUP_ID])
    ).rejects.toThrow("Only group owners");
    await expect(
      database.query(
        "select public.create_invitation($1, $2, null, now() + interval '1 day', 1)",
        [MANUAL_GROUP_ID, "a".repeat(64)]
      )
    ).rejects.toThrow("Only group owners");
  });
});
