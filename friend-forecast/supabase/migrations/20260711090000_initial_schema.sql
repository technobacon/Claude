begin;

create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  handle text unique,
  display_name text not null default 'New forecaster',
  avatar_url text,
  status text not null default 'active' check (status in ('active', 'suspended', 'deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  owner_user_id uuid not null references public.profiles(id),
  avatar_url text,
  accent_theme text not null default 'violet',
  visibility text not null default 'private' check (visibility = 'private'),
  creation_policy text not null default 'members' check (creation_policy in ('owner', 'moderators', 'members')),
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create table public.group_memberships (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'moderator', 'member')),
  status text not null default 'active' check (status in ('active', 'invited', 'removed')),
  joined_at timestamptz not null default now(),
  invited_by uuid references public.profiles(id),
  notification_preferences jsonb not null default '{}'::jsonb,
  primary key (group_id, user_id)
);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  group_id uuid not null references public.groups(id) on delete cascade,
  market_id uuid,
  created_by uuid not null references public.profiles(id),
  expires_at timestamptz not null,
  maximum_uses integer check (maximum_uses is null or maximum_uses > 0),
  uses integer not null default 0 check (uses >= 0),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  name text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'active', 'ended')),
  opening_grant integer not null default 1000 check (opening_grant >= 0),
  weekly_grant integer not null default 200 check (weekly_grant >= 0),
  wallet_cap integer not null default 2000 check (wallet_cap > 0),
  max_market_stake integer not null default 100 check (max_market_stake > 0),
  minimum_position integer not null default 10 check (minimum_position > 0),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (max_market_stake <= wallet_cap)
);

create unique index one_active_season_per_group
  on public.seasons(group_id)
  where status = 'active';

create table public.markets (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  season_id uuid not null references public.seasons(id) on delete restrict,
  creator_user_id uuid not null references public.profiles(id),
  question text not null check (char_length(question) between 8 and 240),
  yes_condition text not null check (char_length(yes_condition) between 3 and 1000),
  no_condition text not null check (char_length(no_condition) between 3 and 1000),
  cancel_condition text not null check (char_length(cancel_condition) between 3 and 1000),
  resolution_source_text text not null,
  resolution_source_url text,
  trading_closes_at timestamptz not null,
  resolution_eligible_at timestamptz not null,
  timezone text not null,
  mode text not null default 'live' check (mode in ('live', 'sealed')),
  resolution_mode text not null default 'disputable' check (resolution_mode in ('creator_final', 'disputable')),
  status text not null default 'draft' check (status in ('draft', 'open', 'closed', 'awaiting_event', 'resolution_proposed', 'disputed', 'settled', 'cancelled')),
  first_stake_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (resolution_eligible_at >= trading_closes_at)
);

alter table public.invitations
  add constraint invitations_market_id_fkey
  foreign key (market_id) references public.markets(id) on delete cascade;

create table public.wallet_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  group_id uuid not null references public.groups(id) on delete cascade,
  season_id uuid not null references public.seasons(id) on delete cascade,
  market_id uuid references public.markets(id) on delete set null,
  type text not null check (type in ('opening_grant', 'weekly_grant', 'position_debit', 'position_reversal', 'settlement_credit', 'refund_credit', 'admin_adjustment')),
  amount integer not null check (amount <> 0),
  idempotency_key text not null unique,
  settlement_batch_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

create index wallet_ledger_lookup
  on public.wallet_ledger_entries(user_id, group_id, season_id, created_at desc);

create table public.positions (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references public.markets(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  side text not null check (side in ('yes', 'no')),
  points integer not null check (points > 0),
  first_committed_at timestamptz not null default now(),
  last_committed_at timestamptz not null default now(),
  unique (market_id, user_id)
);

create table public.position_transactions (
  id uuid primary key default gen_random_uuid(),
  position_id uuid not null references public.positions(id) on delete cascade,
  market_id uuid not null references public.markets(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  side text not null check (side in ('yes', 'no')),
  points_delta integer not null check (points_delta <> 0),
  odds_before integer check (odds_before between 0 and 100),
  odds_after integer check (odds_after between 0 and 100),
  undo_expires_at timestamptz,
  ledger_entry_id uuid not null references public.wallet_ledger_entries(id),
  created_at timestamptz not null default now(),
  reversed_at timestamptz
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  market_id uuid references public.markets(id) on delete cascade,
  actor_user_id uuid references public.profiles(id),
  event_type text not null,
  previous_state jsonb,
  new_state jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.is_group_member(target_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.group_memberships membership
    where membership.group_id = target_group_id
      and membership.user_id = auth.uid()
      and membership.status = 'active'
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', 'New forecaster'));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_memberships enable row level security;
alter table public.invitations enable row level security;
alter table public.seasons enable row level security;
alter table public.markets enable row level security;
alter table public.wallet_ledger_entries enable row level security;
alter table public.positions enable row level security;
alter table public.position_transactions enable row level security;
alter table public.audit_events enable row level security;

create policy "profiles are readable by authenticated users"
  on public.profiles for select
  to authenticated
  using (true);

create policy "users can update their own profile"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "members can read their groups"
  on public.groups for select
  to authenticated
  using (public.is_group_member(id));

create policy "members can read group memberships"
  on public.group_memberships for select
  to authenticated
  using (public.is_group_member(group_id));

create policy "members can read seasons"
  on public.seasons for select
  to authenticated
  using (public.is_group_member(group_id));

create policy "members can read markets"
  on public.markets for select
  to authenticated
  using (public.is_group_member(group_id));

create policy "members can read positions"
  on public.positions for select
  to authenticated
  using (
    exists (
      select 1 from public.markets market
      where market.id = positions.market_id
        and public.is_group_member(market.group_id)
    )
  );

create policy "users can read their own ledger"
  on public.wallet_ledger_entries for select
  to authenticated
  using (user_id = auth.uid() and public.is_group_member(group_id));

create policy "members can read position history"
  on public.position_transactions for select
  to authenticated
  using (
    exists (
      select 1 from public.markets market
      where market.id = position_transactions.market_id
        and public.is_group_member(market.group_id)
    )
  );

create policy "members can read audit events"
  on public.audit_events for select
  to authenticated
  using (public.is_group_member(group_id));

commit;
