begin;

create or replace function public.group_role(target_group_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select membership.role
    from public.group_memberships membership
    where membership.group_id = target_group_id
      and membership.user_id = auth.uid()
      and membership.status = 'active'
  ), '');
$$;

alter table public.seasons
  add constraint seasons_opening_grant_within_cap check (opening_grant <= wallet_cap),
  add constraint seasons_minimum_within_market_stake check (minimum_position <= max_market_stake);

create unique index seasons_id_group_id_unique
  on public.seasons(id, group_id);

alter table public.wallet_ledger_entries
  add constraint wallet_ledger_idempotency_key_length
    check (char_length(btrim(idempotency_key)) between 1 and 200),
  add constraint wallet_ledger_type_sign
    check (
      (type in ('opening_grant', 'weekly_grant', 'position_reversal', 'settlement_credit', 'refund_credit') and amount > 0)
      or (type = 'position_debit' and amount < 0)
      or (type = 'admin_adjustment' and amount <> 0)
    ),
  add constraint wallet_ledger_season_group_fkey
    foreign key (season_id, group_id)
    references public.seasons(id, group_id)
    on delete cascade;

create table public.season_wallets (
  season_id uuid not null,
  user_id uuid not null,
  group_id uuid not null,
  opened_at timestamptz not null default now(),
  primary key (season_id, user_id),
  unique (season_id, user_id, group_id),
  foreign key (season_id, group_id)
    references public.seasons(id, group_id)
    on delete cascade,
  foreign key (group_id, user_id)
    references public.group_memberships(group_id, user_id)
    on delete restrict
);

insert into public.season_wallets (season_id, user_id, group_id, opened_at)
select distinct entry.season_id, entry.user_id, entry.group_id, min(entry.created_at)
from public.wallet_ledger_entries entry
group by entry.season_id, entry.user_id, entry.group_id
on conflict (season_id, user_id) do nothing;

insert into public.season_wallets (season_id, user_id, group_id, opened_at)
select season.id, membership.user_id, membership.group_id, greatest(membership.joined_at, season.starts_at)
from public.seasons season
join public.group_memberships membership on membership.group_id = season.group_id
where membership.status = 'active'
  and season.status = 'active'
on conflict (season_id, user_id) do nothing;

alter table public.wallet_ledger_entries
  add constraint wallet_ledger_wallet_fkey
    foreign key (season_id, user_id, group_id)
    references public.season_wallets(season_id, user_id, group_id)
    on delete restrict;

create unique index one_opening_grant_per_wallet
  on public.wallet_ledger_entries(season_id, user_id)
  where type = 'opening_grant';

create table public.wallet_grant_receipts (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null,
  user_id uuid not null,
  group_id uuid not null,
  grant_type text not null check (grant_type in ('opening', 'weekly')),
  scheduled_for timestamptz not null,
  configured_amount integer not null check (configured_amount >= 0),
  credited_amount integer not null check (credited_amount >= 0),
  ledger_entry_id uuid unique references public.wallet_ledger_entries(id) on delete restrict,
  idempotency_key text not null unique check (char_length(btrim(idempotency_key)) between 1 and 200),
  created_at timestamptz not null default now(),
  unique (season_id, user_id, grant_type, scheduled_for),
  foreign key (season_id, user_id, group_id)
    references public.season_wallets(season_id, user_id, group_id)
    on delete restrict,
  check (
    (credited_amount = 0 and ledger_entry_id is null)
    or (credited_amount > 0 and ledger_entry_id is not null)
  ),
  check (credited_amount <= configured_amount)
);

insert into public.wallet_grant_receipts (
  season_id,
  user_id,
  group_id,
  grant_type,
  scheduled_for,
  configured_amount,
  credited_amount,
  ledger_entry_id,
  idempotency_key,
  created_at
)
select
  entry.season_id,
  entry.user_id,
  entry.group_id,
  'opening',
  season.starts_at,
  season.opening_grant,
  entry.amount,
  entry.id,
  entry.idempotency_key,
  entry.created_at
from public.wallet_ledger_entries entry
join public.seasons season on season.id = entry.season_id and season.group_id = entry.group_id
where entry.type = 'opening_grant'
on conflict (season_id, user_id, grant_type, scheduled_for) do nothing;

alter table public.season_wallets enable row level security;
alter table public.wallet_grant_receipts enable row level security;

create policy "users can read their own season wallets"
  on public.season_wallets for select
  to authenticated
  using (user_id = auth.uid() and public.is_group_member(group_id));

create policy "users can read their own grant receipts"
  on public.wallet_grant_receipts for select
  to authenticated
  using (user_id = auth.uid() and public.is_group_member(group_id));

revoke all on public.wallet_ledger_entries from anon, authenticated, service_role;
revoke all on public.season_wallets from anon, authenticated, service_role;
revoke all on public.wallet_grant_receipts from anon, authenticated, service_role;
grant select on public.wallet_ledger_entries to authenticated, service_role;
grant select on public.season_wallets to authenticated, service_role;
grant select on public.wallet_grant_receipts to authenticated, service_role;

create or replace function public.prevent_wallet_ledger_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Wallet ledger entries are append-only; post a compensating entry instead.' using errcode = '55000';
end;
$$;

create trigger wallet_ledger_is_append_only
  before update or delete on public.wallet_ledger_entries
  for each row execute procedure public.prevent_wallet_ledger_mutation();

create or replace function public.validate_wallet_grant_receipt()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ledger_record public.wallet_ledger_entries%rowtype;
  expected_entry_type text;
begin
  expected_entry_type := case new.grant_type
    when 'opening' then 'opening_grant'
    when 'weekly' then 'weekly_grant'
  end;

  if new.credited_amount = 0 then
    if exists (
      select 1
      from public.wallet_ledger_entries entry
      where entry.idempotency_key = new.idempotency_key
    ) then
      raise exception 'A zero-credit grant receipt cannot have a matching ledger entry.' using errcode = '23514';
    end if;
    return new;
  end if;

  select * into ledger_record
  from public.wallet_ledger_entries entry
  where entry.id = new.ledger_entry_id;

  if not found
    or ledger_record.season_id <> new.season_id
    or ledger_record.user_id <> new.user_id
    or ledger_record.group_id <> new.group_id
    or ledger_record.type <> expected_entry_type
    or ledger_record.amount <> new.credited_amount
    or ledger_record.idempotency_key <> new.idempotency_key then
    raise exception 'Grant receipt does not match its ledger entry.' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger wallet_grant_receipt_matches_ledger
  before insert on public.wallet_grant_receipts
  for each row execute procedure public.validate_wallet_grant_receipt();

create or replace function public.prevent_wallet_grant_receipt_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Wallet grant receipts are append-only.' using errcode = '55000';
end;
$$;

create trigger wallet_grant_receipts_are_append_only
  before update or delete on public.wallet_grant_receipts
  for each row execute procedure public.prevent_wallet_grant_receipt_mutation();

create or replace function public.ensure_season_wallet(
  target_season_id uuid,
  target_user_id uuid,
  actor_user_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  season_record public.seasons%rowtype;
  opening_key text;
  opening_entry_id uuid;
  opening_credited integer := 0;
begin
  select * into season_record
  from public.seasons season
  where season.id = target_season_id;

  if not found or not exists (
    select 1
    from public.group_memberships membership
    where membership.group_id = season_record.group_id
      and membership.user_id = target_user_id
      and membership.status = 'active'
  ) then
    raise exception 'A valid active membership is required to open a wallet.' using errcode = '42501';
  end if;

  insert into public.season_wallets (season_id, user_id, group_id, opened_at)
  select
    season_record.id,
    target_user_id,
    season_record.group_id,
    greatest(membership.joined_at, season_record.starts_at)
  from public.group_memberships membership
  where membership.group_id = season_record.group_id
    and membership.user_id = target_user_id
    and membership.status = 'active'
  on conflict (season_id, user_id) do nothing;

  perform 1
  from public.season_wallets wallet
  where wallet.season_id = season_record.id
    and wallet.user_id = target_user_id
  for update;

  if exists (
    select 1
    from public.wallet_grant_receipts receipt
    where receipt.season_id = season_record.id
      and receipt.user_id = target_user_id
      and receipt.grant_type = 'opening'
      and receipt.scheduled_for = season_record.starts_at
  ) then
    return;
  end if;

  opening_key := 'opening_grant:' || season_record.id::text || ':' || target_user_id::text;

  select entry.id, entry.amount
  into opening_entry_id, opening_credited
  from public.wallet_ledger_entries entry
  where entry.season_id = season_record.id
    and entry.user_id = target_user_id
    and entry.type = 'opening_grant'
  limit 1;

  if opening_entry_id is null and season_record.opening_grant > 0 then
    insert into public.wallet_ledger_entries (
      user_id,
      group_id,
      season_id,
      type,
      amount,
      idempotency_key,
      metadata,
      created_by
    )
    values (
      target_user_id,
      season_record.group_id,
      season_record.id,
      'opening_grant',
      season_record.opening_grant,
      opening_key,
      jsonb_build_object('source', 'season_wallet_service'),
      actor_user_id
    )
    returning id, amount into opening_entry_id, opening_credited;
  end if;

  insert into public.wallet_grant_receipts (
    season_id,
    user_id,
    group_id,
    grant_type,
    scheduled_for,
    configured_amount,
    credited_amount,
    ledger_entry_id,
    idempotency_key
  )
  values (
    season_record.id,
    target_user_id,
    season_record.group_id,
    'opening',
    season_record.starts_at,
    season_record.opening_grant,
    coalesce(opening_credited, 0),
    opening_entry_id,
    opening_key
  )
  on conflict (season_id, user_id, grant_type, scheduled_for) do nothing;
end;
$$;

create or replace function public.create_group(
  group_name text,
  group_accent_theme text default 'violet',
  group_creation_policy text default 'members'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_user_id uuid := auth.uid();
  normalized_name text := btrim(group_name);
  new_group_id uuid;
  new_season_id uuid;
begin
  if caller_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if char_length(normalized_name) < 1 or char_length(normalized_name) > 80 then
    raise exception 'Group name must be between 1 and 80 characters.' using errcode = '22023';
  end if;

  if group_accent_theme not in ('violet', 'emerald', 'coral', 'sky') then
    raise exception 'Unsupported group theme.' using errcode = '22023';
  end if;

  if group_creation_policy not in ('owner', 'moderators', 'members') then
    raise exception 'Unsupported creation policy.' using errcode = '22023';
  end if;

  insert into public.groups (name, owner_user_id, accent_theme, creation_policy)
  values (normalized_name, caller_user_id, group_accent_theme, group_creation_policy)
  returning id into new_group_id;

  insert into public.group_memberships (group_id, user_id, role, status)
  values (new_group_id, caller_user_id, 'owner', 'active');

  insert into public.seasons (
    group_id,
    name,
    starts_at,
    ends_at,
    status,
    opening_grant,
    weekly_grant,
    wallet_cap,
    max_market_stake,
    minimum_position
  )
  values (
    new_group_id,
    'Season 1',
    now(),
    now() + interval '12 weeks',
    'active',
    1000,
    200,
    2000,
    100,
    10
  )
  returning id into new_season_id;

  perform public.ensure_season_wallet(new_season_id, caller_user_id, caller_user_id);

  insert into public.audit_events (group_id, actor_user_id, event_type, new_state)
  values (
    new_group_id,
    caller_user_id,
    'group_created',
    jsonb_build_object(
      'name', normalized_name,
      'accent_theme', group_accent_theme,
      'creation_policy', group_creation_policy
    )
  );

  return new_group_id;
end;
$$;

create or replace function public.accept_invitation(invitation_token_hash text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_user_id uuid := auth.uid();
  invitation_record public.invitations%rowtype;
  active_season public.seasons%rowtype;
  already_active boolean;
begin
  if caller_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select * into invitation_record
  from public.invitations invitation
  where invitation.token_hash = $1
  for update;

  if not found or invitation_record.revoked_at is not null or invitation_record.expires_at <= now() then
    raise exception 'Invitation is invalid or expired.' using errcode = '22023';
  end if;

  select exists (
    select 1 from public.group_memberships membership
    where membership.group_id = invitation_record.group_id
      and membership.user_id = caller_user_id
      and membership.status = 'active'
  ) into already_active;

  select * into active_season
  from public.seasons season
  where season.group_id = invitation_record.group_id
    and season.status = 'active'
    and season.starts_at <= now()
    and season.ends_at > now()
  limit 1;

  if already_active then
    if active_season.id is not null then
      perform public.ensure_season_wallet(active_season.id, caller_user_id, null);
    end if;
    return invitation_record.group_id;
  end if;

  if invitation_record.maximum_uses is not null and invitation_record.uses >= invitation_record.maximum_uses then
    raise exception 'Invitation has reached its maximum uses.' using errcode = '22023';
  end if;

  insert into public.group_memberships (group_id, user_id, role, status, invited_by)
  values (
    invitation_record.group_id,
    caller_user_id,
    'member',
    'active',
    invitation_record.created_by
  )
  on conflict (group_id, user_id) do update
  set role = 'member',
      status = 'active',
      joined_at = now(),
      invited_by = excluded.invited_by;

  update public.invitations
  set uses = uses + 1
  where id = invitation_record.id;

  if active_season.id is not null then
    perform public.ensure_season_wallet(active_season.id, caller_user_id, null);
  end if;

  insert into public.audit_events (group_id, market_id, actor_user_id, event_type, new_state)
  values (
    invitation_record.group_id,
    invitation_record.market_id,
    caller_user_id,
    'invitation_accepted',
    jsonb_build_object('invitation_id', invitation_record.id)
  );

  return invitation_record.group_id;
end;
$$;

create or replace function public.apply_current_weekly_grants(target_group_id uuid)
returns table (
  grant_period_start timestamptz,
  wallets_processed integer,
  wallets_credited integer,
  total_points bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  season_record public.seasons%rowtype;
  member_record record;
  period_number integer;
  latest_period_number integer;
  period_start timestamptz;
  last_period_start timestamptz;
  grant_key text;
  current_balance bigint;
  credit_amount integer;
  ledger_id uuid;
  processed_count integer := 0;
  credited_count integer := 0;
  credited_total bigint := 0;
begin
  if auth.role() is distinct from 'service_role'
    and coalesce(public.group_role(target_group_id), '') not in ('owner', 'moderator') then
    raise exception 'Only group owners, moderators, or the grant scheduler can apply weekly grants.' using errcode = '42501';
  end if;

  select * into season_record
  from public.seasons season
  where season.group_id = target_group_id
    and season.status = 'active'
    and season.starts_at <= now()
  for update;

  if not found then
    raise exception 'No active season is available.' using errcode = '22023';
  end if;

  latest_period_number := floor(
    extract(epoch from (least(now(), season_record.ends_at - interval '1 microsecond') - season_record.starts_at)) / 604800
  )::integer;

  if latest_period_number < 1 then
    raise exception 'The first weekly grant is not due yet.' using errcode = '22023';
  end if;

  for period_number in 1..latest_period_number loop
    period_start := season_record.starts_at + make_interval(weeks => period_number);
    exit when period_start >= season_record.ends_at;
    last_period_start := period_start;

    for member_record in
      select membership.user_id
      from public.group_memberships membership
      where membership.group_id = target_group_id
        and membership.status = 'active'
        and membership.joined_at <= period_start
      order by membership.user_id
    loop
      perform public.ensure_season_wallet(season_record.id, member_record.user_id, null);

      perform 1
      from public.season_wallets wallet
      where wallet.season_id = season_record.id
        and wallet.user_id = member_record.user_id
      for update;

      if exists (
        select 1
        from public.wallet_grant_receipts receipt
        where receipt.season_id = season_record.id
          and receipt.user_id = member_record.user_id
          and receipt.grant_type = 'weekly'
          and receipt.scheduled_for = period_start
      ) then
        continue;
      end if;

      select coalesce(sum(entry.amount), 0)::bigint into current_balance
      from public.wallet_ledger_entries entry
      where entry.season_id = season_record.id
        and entry.user_id = member_record.user_id;

      credit_amount := least(
        season_record.weekly_grant::bigint,
        greatest(season_record.wallet_cap::bigint - current_balance, 0::bigint)
      )::integer;
      grant_key := 'weekly_grant:' || season_record.id::text || ':' || period_number::text || ':' || member_record.user_id::text;
      ledger_id := null;

      if credit_amount > 0 then
        insert into public.wallet_ledger_entries (
          user_id,
          group_id,
          season_id,
          type,
          amount,
          idempotency_key,
          metadata
        )
        values (
          member_record.user_id,
          target_group_id,
          season_record.id,
          'weekly_grant',
          credit_amount,
          grant_key,
          jsonb_build_object('period_number', period_number, 'scheduled_for', period_start)
        )
        returning id into ledger_id;
      end if;

      insert into public.wallet_grant_receipts (
        season_id,
        user_id,
        group_id,
        grant_type,
        scheduled_for,
        configured_amount,
        credited_amount,
        ledger_entry_id,
        idempotency_key
      )
      values (
        season_record.id,
        member_record.user_id,
        target_group_id,
        'weekly',
        period_start,
        season_record.weekly_grant,
        credit_amount,
        ledger_id,
        grant_key
      );

      processed_count := processed_count + 1;
      if credit_amount > 0 then
        credited_count := credited_count + 1;
        credited_total := credited_total + credit_amount;
      end if;
    end loop;
  end loop;

  if processed_count > 0 then
    insert into public.audit_events (group_id, actor_user_id, event_type, new_state)
    values (
      target_group_id,
      auth.uid(),
      'weekly_grants_applied',
      jsonb_build_object(
        'through_period_start', last_period_start,
        'wallets_processed', processed_count,
        'wallets_credited', credited_count,
        'total_points', credited_total
      )
    );
  end if;

  return query select last_period_start, processed_count, credited_count, credited_total;
end;
$$;

create view public.wallet_balances
with (security_invoker = true)
as
select
  wallet.season_id,
  wallet.user_id,
  wallet.group_id,
  coalesce(sum(entry.amount), 0)::bigint as balance,
  count(entry.id)::bigint as activity_count,
  max(entry.created_at) as last_activity_at
from public.season_wallets wallet
left join public.wallet_ledger_entries entry
  on entry.season_id = wallet.season_id
  and entry.user_id = wallet.user_id
  and entry.group_id = wallet.group_id
group by wallet.season_id, wallet.user_id, wallet.group_id;

grant select on public.wallet_balances to authenticated;

create or replace function public.get_wallet_snapshot(target_group_id uuid)
returns table (
  season_id uuid,
  season_name text,
  starts_at timestamptz,
  ends_at timestamptz,
  opening_grant integer,
  weekly_grant integer,
  wallet_cap integer,
  max_market_stake integer,
  minimum_position integer,
  balance bigint,
  activity_count bigint,
  weekly_grant_due boolean,
  weekly_grant_processed boolean,
  weekly_grant_credited integer,
  next_weekly_grant_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  season_record public.seasons%rowtype;
  current_period integer;
  current_period_start timestamptz;
  next_period_start timestamptz;
begin
  if not public.is_group_member(target_group_id) then
    raise exception 'Active group membership is required.' using errcode = '42501';
  end if;

  select * into season_record
  from public.seasons season
  where season.group_id = target_group_id
    and season.status = 'active'
    and season.starts_at <= now()
    and season.ends_at > now()
  limit 1;

  if not found then
    return;
  end if;

  current_period := greatest(floor(extract(epoch from (now() - season_record.starts_at)) / 604800)::integer, 0);
  current_period_start := case
    when current_period >= 1 then season_record.starts_at + make_interval(weeks => current_period)
    else null
  end;
  next_period_start := season_record.starts_at + make_interval(weeks => greatest(current_period + 1, 1));

  return query
  select
    season_record.id,
    season_record.name,
    season_record.starts_at,
    season_record.ends_at,
    season_record.opening_grant,
    season_record.weekly_grant,
    season_record.wallet_cap,
    season_record.max_market_stake,
    season_record.minimum_position,
    coalesce(wallet.balance, 0)::bigint,
    coalesce(wallet.activity_count, 0)::bigint,
    current_period >= 1 and receipt.id is null,
    receipt.id is not null,
    coalesce(receipt.credited_amount, 0),
    case
      when current_period >= 1 and receipt.id is null then current_period_start
      else least(next_period_start, season_record.ends_at)
    end
  from public.season_wallets season_wallet
  left join public.wallet_balances wallet
    on wallet.season_id = season_wallet.season_id
    and wallet.user_id = season_wallet.user_id
  left join public.wallet_grant_receipts receipt
    on receipt.season_id = season_wallet.season_id
    and receipt.user_id = season_wallet.user_id
    and receipt.grant_type = 'weekly'
    and receipt.scheduled_for = current_period_start
  where season_wallet.season_id = season_record.id
    and season_wallet.user_id = auth.uid();
end;
$$;

create or replace function public.reconcile_group_wallets(target_group_id uuid)
returns table (
  user_id uuid,
  display_name text,
  season_id uuid,
  balance bigint,
  activity_count bigint,
  opening_grant_ok boolean,
  grant_receipts_ok boolean,
  nonnegative_balance boolean,
  is_reconciled boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if coalesce(public.group_role(target_group_id), '') not in ('owner', 'moderator') then
    raise exception 'Only group owners and moderators can reconcile wallets.' using errcode = '42501';
  end if;

  return query
  with wallet_report as (
    select
      wallet.user_id,
      profile.display_name,
      wallet.season_id,
      ledger.ledger_balance,
      ledger.ledger_activity_count,
      season.opening_grant,
      season.weekly_grant,
      ledger.opening_entry_count,
      grants.opening_receipt_count,
      grants.receipts_valid
    from public.season_wallets wallet
    join public.seasons season on season.id = wallet.season_id and season.group_id = wallet.group_id
    join public.profiles profile on profile.id = wallet.user_id
    cross join lateral (
      select
        coalesce(sum(entry.amount), 0)::bigint as ledger_balance,
        count(entry.id)::bigint as ledger_activity_count,
        count(entry.id) filter (where entry.type = 'opening_grant') as opening_entry_count
      from public.wallet_ledger_entries entry
      where entry.season_id = wallet.season_id
        and entry.user_id = wallet.user_id
        and entry.group_id = wallet.group_id
    ) ledger
    cross join lateral (
      select
        count(receipt.id) filter (where receipt.grant_type = 'opening') as opening_receipt_count,
        (
          not exists (
            select 1
            from public.wallet_grant_receipts invalid_receipt
            left join public.wallet_ledger_entries receipt_entry on receipt_entry.id = invalid_receipt.ledger_entry_id
            where invalid_receipt.season_id = wallet.season_id
              and invalid_receipt.user_id = wallet.user_id
              and (
                (invalid_receipt.credited_amount = 0 and invalid_receipt.ledger_entry_id is not null)
                or (invalid_receipt.credited_amount > 0 and (
                  invalid_receipt.ledger_entry_id is null
                  or receipt_entry.amount <> invalid_receipt.credited_amount
                  or receipt_entry.season_id <> invalid_receipt.season_id
                  or receipt_entry.user_id <> invalid_receipt.user_id
                  or receipt_entry.group_id <> invalid_receipt.group_id
                  or receipt_entry.idempotency_key <> invalid_receipt.idempotency_key
                  or receipt_entry.type <> case invalid_receipt.grant_type
                    when 'opening' then 'opening_grant'
                    when 'weekly' then 'weekly_grant'
                  end
                ))
                or (invalid_receipt.grant_type = 'opening' and (
                  invalid_receipt.configured_amount <> season.opening_grant
                  or invalid_receipt.credited_amount <> season.opening_grant
                  or invalid_receipt.scheduled_for <> season.starts_at
                ))
                or (invalid_receipt.grant_type = 'weekly' and (
                  invalid_receipt.configured_amount <> season.weekly_grant
                  or invalid_receipt.credited_amount > invalid_receipt.configured_amount
                  or invalid_receipt.scheduled_for <= season.starts_at
                  or invalid_receipt.scheduled_for >= season.ends_at
                  or invalid_receipt.scheduled_for < wallet.opened_at
                  or invalid_receipt.scheduled_for > least(now(), season.ends_at - interval '1 microsecond')
                  or mod(extract(epoch from (invalid_receipt.scheduled_for - season.starts_at))::numeric, 604800) <> 0
                ))
              )
          )
          and not exists (
            select 1
            from public.wallet_ledger_entries orphan_entry
            where orphan_entry.season_id = wallet.season_id
              and orphan_entry.user_id = wallet.user_id
              and orphan_entry.group_id = wallet.group_id
              and orphan_entry.type in ('opening_grant', 'weekly_grant')
              and not exists (
                select 1
                from public.wallet_grant_receipts matching_receipt
                where matching_receipt.ledger_entry_id = orphan_entry.id
              )
          )
          and (
            select count(*)
            from public.wallet_grant_receipts weekly_receipt
            where weekly_receipt.season_id = wallet.season_id
              and weekly_receipt.user_id = wallet.user_id
              and weekly_receipt.grant_type = 'weekly'
          ) = (
            select count(*)
            from generate_series(
              season.starts_at + interval '7 days',
              least(now(), season.ends_at - interval '1 microsecond'),
              interval '7 days'
            ) expected_period(scheduled_for)
            where expected_period.scheduled_for >= wallet.opened_at
          )
        ) as receipts_valid
      from public.wallet_grant_receipts receipt
      where receipt.season_id = wallet.season_id
        and receipt.user_id = wallet.user_id
        and receipt.group_id = wallet.group_id
    ) grants
    where wallet.group_id = target_group_id
  ), evaluated as (
    select
      report.*,
      (
        report.opening_receipt_count = 1
        and (
          (report.opening_grant = 0 and report.opening_entry_count = 0)
          or (report.opening_grant > 0 and report.opening_entry_count = 1)
        )
      ) as opening_valid
    from wallet_report report
  )
  select
    evaluated.user_id,
    evaluated.display_name,
    evaluated.season_id,
    evaluated.ledger_balance,
    evaluated.ledger_activity_count,
    evaluated.opening_valid,
    evaluated.receipts_valid,
    evaluated.ledger_balance >= 0,
    evaluated.opening_valid and evaluated.receipts_valid and evaluated.ledger_balance >= 0
  from evaluated
  order by evaluated.display_name, evaluated.user_id;
end;
$$;

revoke all on function public.ensure_season_wallet(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.prevent_wallet_ledger_mutation() from public, anon, authenticated;
revoke all on function public.validate_wallet_grant_receipt() from public, anon, authenticated;
revoke all on function public.prevent_wallet_grant_receipt_mutation() from public, anon, authenticated;
revoke all on function public.apply_current_weekly_grants(uuid) from public;
grant execute on function public.apply_current_weekly_grants(uuid) to authenticated, service_role;
revoke all on function public.get_wallet_snapshot(uuid) from public;
grant execute on function public.get_wallet_snapshot(uuid) to authenticated;
revoke all on function public.reconcile_group_wallets(uuid) from public;
grant execute on function public.reconcile_group_wallets(uuid) to authenticated;

commit;
