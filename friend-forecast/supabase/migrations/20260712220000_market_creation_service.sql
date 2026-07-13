begin;

alter table public.markets
  add column creation_request_id uuid,
  add column creation_request_hash text,
  add column template_key text not null default 'custom',
  add column creator_can_participate boolean not null default true,
  add column outcome_control text not null default 'independent',
  add column rule_revision integer not null default 1,
  add column published_at timestamptz,
  add column rules_locked_at timestamptz;

do $$
begin
  if exists (select 1 from public.markets where first_stake_at is not null)
    or exists (select 1 from public.positions)
    or exists (select 1 from public.position_transactions) then
    raise exception 'Cannot install market rule snapshots after positions or stakes already exist.' using errcode = '55000';
  end if;
end;
$$;

update public.markets
set
  creation_request_id = gen_random_uuid(),
  creation_request_hash = encode(digest(id::text, 'sha256'), 'hex'),
  published_at = case when status = 'draft' then null else coalesce(published_at, created_at) end
where creation_request_id is null;

alter table public.markets
  alter column creation_request_id set not null,
  alter column creation_request_hash set not null,
  add constraint markets_creation_request_hash_format
    check (creation_request_hash ~ '^[0-9a-f]{64}$'),
  add constraint markets_template_key
    check (template_key in ('custom', 'flight', 'arrival', 'trip_budget', 'sports', 'tv_outcome', 'group_challenge')),
  add constraint markets_outcome_control
    check (outcome_control in ('independent', 'creator_influenced', 'participant_influenced')),
  add constraint markets_rule_revision_positive
    check (rule_revision > 0),
  add constraint markets_source_text_length
    check (char_length(btrim(resolution_source_text)) between 3 and 500),
  add constraint markets_source_url_format
    check (
      resolution_source_url is null
      or (
        char_length(resolution_source_url) <= 2048
        and resolution_source_url ~* '^https?://[[:alnum:]]([[:alnum:].-]*[[:alnum:]])?(:[0-9]+)?([/?#][^[:space:]]*)?$'
        and resolution_source_url !~ '\.\.'
      )
    ),
  add constraint markets_timezone_length
    check (char_length(btrim(timezone)) between 1 and 100),
  add constraint markets_publish_timestamp
    check (
      (status = 'draft' and published_at is null)
      or (status <> 'draft' and published_at is not null)
    ),
  add constraint markets_rules_lock_timestamp
    check (
      (first_stake_at is null and rules_locked_at is null)
      or (
        first_stake_at is not null
        and rules_locked_at = first_stake_at
        and published_at is not null
        and published_at <= first_stake_at
        and first_stake_at < trading_closes_at
        and isfinite(first_stake_at)
        and isfinite(rules_locked_at)
      )
    ),
  add constraint markets_season_group_fkey
    foreign key (season_id, group_id)
    references public.seasons(id, group_id)
    on delete restrict;

create unique index markets_creator_request_unique
  on public.markets(creator_user_id, creation_request_id);

create unique index markets_id_group_season_unique
  on public.markets(id, group_id, season_id);

create table public.market_rule_snapshots (
  market_id uuid primary key,
  group_id uuid not null,
  season_id uuid not null,
  rule_revision integer not null check (rule_revision > 0),
  rules jsonb not null check (jsonb_typeof(rules) = 'object'),
  rules_hash text not null check (rules_hash ~ '^[0-9a-f]{64}$'),
  locked_at timestamptz not null,
  created_at timestamptz not null default now(),
  foreign key (market_id, group_id, season_id)
    references public.markets(id, group_id, season_id)
    on delete restrict
);

create table public.market_mutation_receipts (
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  request_id uuid not null,
  operation text not null check (operation in ('save', 'publish')),
  market_id uuid not null references public.markets(id) on delete cascade,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  result_revision integer not null check (result_revision > 0),
  created_at timestamptz not null default now(),
  primary key (actor_user_id, request_id)
);

alter table public.market_rule_snapshots enable row level security;
alter table public.market_mutation_receipts enable row level security;

create policy "members can read locked market rules"
  on public.market_rule_snapshots for select
  to authenticated
  using (public.is_group_member(group_id));

drop policy if exists "members can read markets" on public.markets;

create policy "members can read published markets and managed drafts"
  on public.markets for select
  to authenticated
  using (
    public.is_group_member(group_id)
    and (
      status <> 'draft'
      or creator_user_id = auth.uid()
      or public.group_role(group_id) in ('owner', 'moderator')
    )
  );

revoke all on public.markets from anon, authenticated, service_role;
revoke all on public.market_rule_snapshots from anon, authenticated, service_role;
revoke all on public.market_mutation_receipts from anon, authenticated, service_role;
revoke all on public.positions from anon, authenticated, service_role;
revoke all on public.position_transactions from anon, authenticated, service_role;
grant select on public.markets to authenticated, service_role;
grant select on public.market_rule_snapshots to authenticated, service_role;
grant select on public.positions to authenticated, service_role;
grant select on public.position_transactions to authenticated, service_role;

create or replace function public.market_contract_json(
  market_template_key text,
  market_question text,
  market_yes_condition text,
  market_no_condition text,
  market_cancel_condition text,
  market_resolution_source_text text,
  market_resolution_source_url text,
  market_trading_closes_at timestamptz,
  market_resolution_eligible_at timestamptz,
  market_timezone text,
  market_mode text,
  market_resolution_mode text,
  market_creator_can_participate boolean,
  market_outcome_control text
)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select jsonb_build_object(
    'template_key', market_template_key,
    'question', market_question,
    'yes_condition', market_yes_condition,
    'no_condition', market_no_condition,
    'cancel_condition', market_cancel_condition,
    'resolution_source_text', market_resolution_source_text,
    'resolution_source_url', market_resolution_source_url,
    'trading_closes_epoch', extract(epoch from market_trading_closes_at),
    'resolution_eligible_epoch', extract(epoch from market_resolution_eligible_at),
    'timezone', market_timezone,
    'mode', market_mode,
    'resolution_mode', market_resolution_mode,
    'creator_can_participate', market_creator_can_participate,
    'outcome_control', market_outcome_control
  );
$$;

create or replace function public.market_contract_hash(contract jsonb)
returns text
language sql
immutable
set search_path = public
as $$
  select encode(digest(contract::text, 'sha256'), 'hex');
$$;

create or replace function public.market_has_unresolved_tokens(
  market_question text,
  market_yes_condition text,
  market_no_condition text,
  market_cancel_condition text,
  market_resolution_source_text text
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select
    concat_ws(
      ' ',
      market_question,
      market_yes_condition,
      market_no_condition,
      market_cancel_condition,
      market_resolution_source_text
    ) ~ '(\{[^}]+\}|\[[^]]+\])'
    or lower(concat_ws(
      ' ',
      market_question,
      market_yes_condition,
      market_no_condition,
      market_cancel_condition,
      market_resolution_source_text
    )) ~ '(the defined result|the stated deadline|name the agreed source)';
$$;

create or replace function public.can_create_market(target_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select case friend_group.creation_policy
      when 'owner' then public.group_role(friend_group.id) = 'owner'
      when 'moderators' then public.group_role(friend_group.id) in ('owner', 'moderator')
      when 'members' then public.group_role(friend_group.id) in ('owner', 'moderator', 'member')
      else false
    end
    from public.groups friend_group
    where friend_group.id = target_group_id
      and friend_group.archived_at is null
  ), false);
$$;

create or replace function public.validate_market_contract(
  market_question text,
  market_yes_condition text,
  market_no_condition text,
  market_cancel_condition text,
  market_resolution_source_text text,
  market_resolution_source_url text,
  market_trading_closes_at timestamptz,
  market_resolution_eligible_at timestamptz,
  market_timezone text,
  market_mode text,
  market_resolution_mode text,
  market_creator_can_participate boolean,
  market_outcome_control text
)
returns void
language plpgsql
set search_path = public
as $$
declare
  normalized_yes text := regexp_replace(lower(btrim(market_yes_condition)), '[[:space:]]+', ' ', 'g');
  normalized_no text := regexp_replace(lower(btrim(market_no_condition)), '[[:space:]]+', ' ', 'g');
  normalized_cancel text := regexp_replace(lower(btrim(market_cancel_condition)), '[[:space:]]+', ' ', 'g');
begin
  if char_length(btrim(market_question)) not between 8 and 240 then
    raise exception 'Question must be between 8 and 240 characters.' using errcode = '22023';
  end if;

  if char_length(btrim(market_yes_condition)) not between 3 and 1000
    or char_length(btrim(market_no_condition)) not between 3 and 1000
    or char_length(btrim(market_cancel_condition)) not between 3 and 1000 then
    raise exception 'YES, NO, and cancellation rules must each be between 3 and 1000 characters.' using errcode = '22023';
  end if;

  if normalized_yes = normalized_no
    or normalized_yes = normalized_cancel
    or normalized_no = normalized_cancel then
    raise exception 'YES, NO, and cancellation rules must be distinct.' using errcode = '22023';
  end if;

  if char_length(btrim(market_resolution_source_text)) not between 3 and 500 then
    raise exception 'Resolution source must be between 3 and 500 characters.' using errcode = '22023';
  end if;

  if market_resolution_source_url is not null
    and (
      char_length(market_resolution_source_url) > 2048
      or market_resolution_source_url !~* '^https?://[[:alnum:]]([[:alnum:].-]*[[:alnum:]])?(:[0-9]+)?([/?#][^[:space:]]*)?$'
      or market_resolution_source_url ~ '\.\.'
    ) then
    raise exception 'Resolution source URL must use HTTP or HTTPS.' using errcode = '22023';
  end if;

  if not isfinite(market_trading_closes_at)
    or not isfinite(market_resolution_eligible_at)
    or market_trading_closes_at <= statement_timestamp() then
    raise exception 'Trading deadline must be in the future.' using errcode = '22023';
  end if;

  if market_resolution_eligible_at < market_trading_closes_at then
    raise exception 'Earliest resolution time cannot be before the trading deadline.' using errcode = '22023';
  end if;

  if char_length(btrim(market_timezone)) not between 1 and 100
    or not exists (
      select 1 from pg_catalog.pg_timezone_names where name = btrim(market_timezone)
    ) then
    raise exception 'A valid IANA timezone is required.' using errcode = '22023';
  end if;

  if market_mode <> 'live' then
    raise exception 'Only live markets are supported during the pilot.' using errcode = '22023';
  end if;

  if market_resolution_mode not in ('creator_final', 'disputable') then
    raise exception 'Unsupported dispute setting.' using errcode = '22023';
  end if;

  if market_outcome_control not in ('independent', 'creator_influenced', 'participant_influenced') then
    raise exception 'Unsupported outcome-control setting.' using errcode = '22023';
  end if;

  if market_outcome_control <> 'independent' and market_resolution_mode <> 'disputable' then
    raise exception 'Participant-controlled markets must allow a group dispute.' using errcode = '22023';
  end if;

  if market_resolution_mode = 'creator_final'
    and (
      market_creator_can_participate
      or market_outcome_control <> 'independent'
      or market_resolution_source_url is null
    ) then
    raise exception 'Creator-final markets require an independent outcome, no creator stake, and an objective source URL.' using errcode = '22023';
  end if;
end;
$$;

do $$
declare
  market_record public.markets%rowtype;
begin
  for market_record in
    select market.* from public.markets market where market.status = 'open'
  loop
    perform public.validate_market_contract(
      market_record.question,
      market_record.yes_condition,
      market_record.no_condition,
      market_record.cancel_condition,
      market_record.resolution_source_text,
      market_record.resolution_source_url,
      market_record.trading_closes_at,
      market_record.resolution_eligible_at,
      market_record.timezone,
      market_record.mode,
      market_record.resolution_mode,
      market_record.creator_can_participate,
      market_record.outcome_control
    );

    if public.market_has_unresolved_tokens(
      market_record.question,
      market_record.yes_condition,
      market_record.no_condition,
      market_record.cancel_condition,
      market_record.resolution_source_text
    ) then
      raise exception 'An existing open market contains unresolved template placeholders.' using errcode = '55000';
    end if;
  end loop;
end;
$$;

create or replace function public.create_market(
  target_group_id uuid,
  market_creation_request_id uuid,
  market_template_key text,
  market_question text,
  market_yes_condition text,
  market_no_condition text,
  market_cancel_condition text,
  market_resolution_source_text text,
  market_resolution_source_url text,
  market_trading_closes_at timestamptz,
  market_resolution_eligible_at timestamptz,
  market_timezone text,
  market_resolution_mode text,
  market_creator_can_participate boolean,
  market_outcome_control text,
  market_publish boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_user_id uuid := auth.uid();
  active_season public.seasons%rowtype;
  contract jsonb;
  request_hash text;
  existing_market public.markets%rowtype;
  new_market_id uuid;
  normalized_url text := nullif(btrim(market_resolution_source_url), '');
begin
  if caller_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if market_creation_request_id is null then
    raise exception 'A creation request ID is required.' using errcode = '22023';
  end if;

  if market_publish is null then
    raise exception 'A draft or publish intent is required.' using errcode = '22023';
  end if;

  contract := public.market_contract_json(
    market_template_key,
    btrim(market_question),
    btrim(market_yes_condition),
    btrim(market_no_condition),
    btrim(market_cancel_condition),
    btrim(market_resolution_source_text),
    normalized_url,
    market_trading_closes_at,
    market_resolution_eligible_at,
    btrim(market_timezone),
    'live',
    market_resolution_mode,
    market_creator_can_participate,
    market_outcome_control
  ) || jsonb_build_object(
    'group_id', target_group_id,
    'publish', market_publish
  );
  request_hash := public.market_contract_hash(contract);

  select market.* into existing_market
  from public.markets market
  where market.creator_user_id = caller_user_id
    and market.creation_request_id = market_creation_request_id;

  if found then
    if existing_market.group_id <> target_group_id
      or existing_market.creation_request_hash <> request_hash then
      raise exception 'Creation request ID was already used for different market details.' using errcode = '22023';
    end if;
    return existing_market.id;
  end if;

  perform 1
  from public.groups friend_group
  where friend_group.id = target_group_id
  for update;

  perform 1
  from public.group_memberships membership
  where membership.group_id = target_group_id
    and membership.user_id = caller_user_id
  for update;

  if not public.can_create_market(target_group_id) then
    raise exception 'You do not have permission to create markets in this group.' using errcode = '42501';
  end if;

  select season.* into active_season
  from public.seasons season
  where season.group_id = target_group_id
    and season.status = 'active'
    and season.starts_at <= statement_timestamp()
    and season.ends_at > statement_timestamp()
  for update;

  if not found then
    raise exception 'This group does not have an active season.' using errcode = '22023';
  end if;

  perform public.validate_market_contract(
    btrim(market_question),
    btrim(market_yes_condition),
    btrim(market_no_condition),
    btrim(market_cancel_condition),
    btrim(market_resolution_source_text),
    normalized_url,
    market_trading_closes_at,
    market_resolution_eligible_at,
    btrim(market_timezone),
    'live',
    market_resolution_mode,
    market_creator_can_participate,
    market_outcome_control
  );

  if market_publish and public.market_has_unresolved_tokens(
    market_question,
    market_yes_condition,
    market_no_condition,
    market_cancel_condition,
    market_resolution_source_text
  ) then
    raise exception 'Replace every template placeholder before publishing.' using errcode = '22023';
  end if;

  if market_trading_closes_at > active_season.ends_at then
    raise exception 'Trading must close before the active season ends.' using errcode = '22023';
  end if;

  if market_template_key not in ('custom', 'flight', 'arrival', 'trip_budget', 'sports', 'tv_outcome', 'group_challenge') then
    raise exception 'Unsupported market template.' using errcode = '22023';
  end if;

  insert into public.markets (
    group_id,
    season_id,
    creator_user_id,
    creation_request_id,
    creation_request_hash,
    template_key,
    question,
    yes_condition,
    no_condition,
    cancel_condition,
    resolution_source_text,
    resolution_source_url,
    trading_closes_at,
    resolution_eligible_at,
    timezone,
    mode,
    resolution_mode,
    creator_can_participate,
    outcome_control,
    status,
    published_at
  )
  values (
    target_group_id,
    active_season.id,
    caller_user_id,
    market_creation_request_id,
    request_hash,
    market_template_key,
    btrim(market_question),
    btrim(market_yes_condition),
    btrim(market_no_condition),
    btrim(market_cancel_condition),
    btrim(market_resolution_source_text),
    normalized_url,
    market_trading_closes_at,
    market_resolution_eligible_at,
    btrim(market_timezone),
    'live',
    market_resolution_mode,
    market_creator_can_participate,
    market_outcome_control,
    case when market_publish then 'open' else 'draft' end,
    case when market_publish then statement_timestamp() else null end
  )
  on conflict (creator_user_id, creation_request_id) do nothing
  returning id into new_market_id;

  if new_market_id is null then
    select market.* into existing_market
    from public.markets market
    where market.creator_user_id = caller_user_id
      and market.creation_request_id = market_creation_request_id;

    if not found
      or existing_market.group_id <> target_group_id
      or existing_market.creation_request_hash <> request_hash then
      raise exception 'Creation request ID was already used for different market details.' using errcode = '22023';
    end if;

    return existing_market.id;
  end if;

  if market_publish then
    insert into public.audit_events (group_id, market_id, actor_user_id, event_type, new_state)
    values (
      target_group_id,
      new_market_id,
      caller_user_id,
      'market_published',
      jsonb_build_object('status', 'open', 'rule_revision', 1)
    );
  end if;

  return new_market_id;
end;
$$;

create or replace function public.save_market_draft(
  target_market_id uuid,
  expected_rule_revision integer,
  mutation_request_id uuid,
  market_template_key text,
  market_question text,
  market_yes_condition text,
  market_no_condition text,
  market_cancel_condition text,
  market_resolution_source_text text,
  market_resolution_source_url text,
  market_trading_closes_at timestamptz,
  market_resolution_eligible_at timestamptz,
  market_timezone text,
  market_resolution_mode text,
  market_creator_can_participate boolean,
  market_outcome_control text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_user_id uuid := auth.uid();
  market_record public.markets%rowtype;
  active_season public.seasons%rowtype;
  receipt_record public.market_mutation_receipts%rowtype;
  contract jsonb;
  request_hash text;
  normalized_url text := nullif(btrim(market_resolution_source_url), '');
  next_revision integer;
begin
  if caller_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if mutation_request_id is null then
    raise exception 'A mutation request ID is required.' using errcode = '22023';
  end if;

  if expected_rule_revision is null or expected_rule_revision < 1 then
    raise exception 'A positive expected rule revision is required.' using errcode = '22023';
  end if;

  select market.* into market_record
  from public.markets market
  where market.id = target_market_id
  for update;

  if not found or market_record.creator_user_id <> caller_user_id then
    raise exception 'Market was not found.' using errcode = '42501';
  end if;

  contract := public.market_contract_json(
    market_template_key,
    btrim(market_question),
    btrim(market_yes_condition),
    btrim(market_no_condition),
    btrim(market_cancel_condition),
    btrim(market_resolution_source_text),
    normalized_url,
    market_trading_closes_at,
    market_resolution_eligible_at,
    btrim(market_timezone),
    'live',
    market_resolution_mode,
    market_creator_can_participate,
    market_outcome_control
  );
  request_hash := public.market_contract_hash(contract || jsonb_build_object(
    'operation', 'save',
    'market_id', target_market_id,
    'expected_rule_revision', expected_rule_revision
  ));

  select receipt.* into receipt_record
  from public.market_mutation_receipts receipt
  where receipt.actor_user_id = caller_user_id
    and receipt.request_id = mutation_request_id;

  if found then
    if receipt_record.operation <> 'save'
      or receipt_record.market_id <> target_market_id
      or receipt_record.request_hash <> request_hash then
      raise exception 'Mutation request ID was already used for different market details.' using errcode = '22023';
    end if;
    return receipt_record.result_revision;
  end if;

  perform 1
  from public.groups friend_group
  where friend_group.id = market_record.group_id
  for update;

  perform 1
  from public.group_memberships membership
  where membership.group_id = market_record.group_id
    and membership.user_id = caller_user_id
  for update;

  if not public.can_create_market(market_record.group_id) then
    raise exception 'You no longer have permission to edit this market.' using errcode = '42501';
  end if;

  perform public.validate_market_contract(
    btrim(market_question),
    btrim(market_yes_condition),
    btrim(market_no_condition),
    btrim(market_cancel_condition),
    btrim(market_resolution_source_text),
    normalized_url,
    market_trading_closes_at,
    market_resolution_eligible_at,
    btrim(market_timezone),
    'live',
    market_resolution_mode,
    market_creator_can_participate,
    market_outcome_control
  );

  if market_template_key not in ('custom', 'flight', 'arrival', 'trip_budget', 'sports', 'tv_outcome', 'group_challenge') then
    raise exception 'Unsupported market template.' using errcode = '22023';
  end if;

  if market_record.status not in ('draft', 'open') or market_record.first_stake_at is not null then
    raise exception 'Funded or closed market rules cannot be edited; cancel and recreate the market.' using errcode = '55000';
  end if;

  if market_record.rule_revision is distinct from expected_rule_revision then
    raise exception 'This draft changed in another session. Reload it before saving.' using errcode = '40001';
  end if;

  select season.* into active_season
  from public.seasons season
  where season.id = market_record.season_id
    and season.group_id = market_record.group_id
    and season.status = 'active'
    and season.starts_at <= statement_timestamp()
    and season.ends_at > statement_timestamp()
  for update;

  if not found or market_trading_closes_at > active_season.ends_at then
    raise exception 'Trading must close during the active season.' using errcode = '22023';
  end if;

  next_revision := market_record.rule_revision + 1;

  update public.markets
  set
    template_key = market_template_key,
    question = btrim(market_question),
    yes_condition = btrim(market_yes_condition),
    no_condition = btrim(market_no_condition),
    cancel_condition = btrim(market_cancel_condition),
    resolution_source_text = btrim(market_resolution_source_text),
    resolution_source_url = normalized_url,
    trading_closes_at = market_trading_closes_at,
    resolution_eligible_at = market_resolution_eligible_at,
    timezone = btrim(market_timezone),
    mode = 'live',
    resolution_mode = market_resolution_mode,
    creator_can_participate = market_creator_can_participate,
    outcome_control = market_outcome_control,
    status = 'draft',
    published_at = null,
    rule_revision = next_revision,
    updated_at = statement_timestamp()
  where id = target_market_id;

  update public.invitations
  set revoked_at = coalesce(revoked_at, statement_timestamp())
  where market_id = target_market_id
    and revoked_at is null;

  insert into public.market_mutation_receipts (
    actor_user_id,
    request_id,
    operation,
    market_id,
    request_hash,
    result_revision
  )
  values (
    caller_user_id,
    mutation_request_id,
    'save',
    target_market_id,
    request_hash,
    next_revision
  );

  return next_revision;
end;
$$;

create or replace function public.publish_market(
  target_market_id uuid,
  expected_rule_revision integer,
  mutation_request_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_user_id uuid := auth.uid();
  market_record public.markets%rowtype;
  active_season public.seasons%rowtype;
  receipt_record public.market_mutation_receipts%rowtype;
  request_hash text := public.market_contract_hash(jsonb_build_object(
    'operation', 'publish',
    'market_id', target_market_id,
    'expected_rule_revision', expected_rule_revision
  ));
begin
  if caller_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if mutation_request_id is null then
    raise exception 'A mutation request ID is required.' using errcode = '22023';
  end if;

  if expected_rule_revision is null or expected_rule_revision < 1 then
    raise exception 'A positive expected rule revision is required.' using errcode = '22023';
  end if;

  select market.* into market_record
  from public.markets market
  where market.id = target_market_id
  for update;

  if not found or market_record.creator_user_id <> caller_user_id then
    raise exception 'Market was not found.' using errcode = '42501';
  end if;

  select receipt.* into receipt_record
  from public.market_mutation_receipts receipt
  where receipt.actor_user_id = caller_user_id
    and receipt.request_id = mutation_request_id;

  if found then
    if receipt_record.operation <> 'publish'
      or receipt_record.market_id <> target_market_id
      or receipt_record.request_hash <> request_hash then
      raise exception 'Mutation request ID was already used for a different operation.' using errcode = '22023';
    end if;
    return receipt_record.result_revision;
  end if;

  perform 1
  from public.groups friend_group
  where friend_group.id = market_record.group_id
  for update;

  perform 1
  from public.group_memberships membership
  where membership.group_id = market_record.group_id
    and membership.user_id = caller_user_id
  for update;

  if not public.can_create_market(market_record.group_id) then
    raise exception 'You no longer have permission to publish this market.' using errcode = '42501';
  end if;

  if market_record.rule_revision is distinct from expected_rule_revision then
    raise exception 'This draft changed in another session. Reload it before publishing.' using errcode = '40001';
  end if;

  if market_record.status = 'open' then
    insert into public.market_mutation_receipts (
      actor_user_id, request_id, operation, market_id, request_hash, result_revision
    ) values (
      caller_user_id, mutation_request_id, 'publish', target_market_id, request_hash, market_record.rule_revision
    );
    return market_record.rule_revision;
  end if;

  if market_record.status <> 'draft' or market_record.first_stake_at is not null then
    raise exception 'Only an unfunded draft can be published.' using errcode = '55000';
  end if;

  if public.market_has_unresolved_tokens(
    market_record.question,
    market_record.yes_condition,
    market_record.no_condition,
    market_record.cancel_condition,
    market_record.resolution_source_text
  ) then
    raise exception 'Replace every template placeholder before publishing.' using errcode = '22023';
  end if;

  perform public.validate_market_contract(
    market_record.question,
    market_record.yes_condition,
    market_record.no_condition,
    market_record.cancel_condition,
    market_record.resolution_source_text,
    market_record.resolution_source_url,
    market_record.trading_closes_at,
    market_record.resolution_eligible_at,
    market_record.timezone,
    market_record.mode,
    market_record.resolution_mode,
    market_record.creator_can_participate,
    market_record.outcome_control
  );

  select season.* into active_season
  from public.seasons season
  where season.id = market_record.season_id
    and season.group_id = market_record.group_id
    and season.status = 'active'
    and season.starts_at <= statement_timestamp()
    and season.ends_at > statement_timestamp()
  for update;

  if not found or market_record.trading_closes_at > active_season.ends_at then
    raise exception 'Trading must close during the active season.' using errcode = '22023';
  end if;

  update public.markets
  set
    status = 'open',
    published_at = statement_timestamp(),
    updated_at = statement_timestamp()
  where id = target_market_id;

  insert into public.market_mutation_receipts (
    actor_user_id, request_id, operation, market_id, request_hash, result_revision
  ) values (
    caller_user_id, mutation_request_id, 'publish', target_market_id, request_hash, market_record.rule_revision
  );

  insert into public.audit_events (group_id, market_id, actor_user_id, event_type, new_state)
  values (
    market_record.group_id,
    target_market_id,
    caller_user_id,
    'market_published',
    jsonb_build_object('status', 'open', 'rule_revision', market_record.rule_revision)
  );

  return market_record.rule_revision;
end;
$$;

create or replace function public.protect_market_contract()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  locked_rules jsonb;
begin
  if new.group_id is distinct from old.group_id
    or new.season_id is distinct from old.season_id
    or new.creator_user_id is distinct from old.creator_user_id
    or new.creation_request_id is distinct from old.creation_request_id
    or new.creation_request_hash is distinct from old.creation_request_hash then
    raise exception 'Market ownership and season dimensions are immutable.' using errcode = '55000';
  end if;

  if old.first_stake_at is null and new.first_stake_at is not null then
    if old.status <> 'open' or new.status <> 'open' then
      raise exception 'The first stake can only lock a published open market.' using errcode = '55000';
    end if;

    if new.template_key is distinct from old.template_key
      or new.question is distinct from old.question
      or new.yes_condition is distinct from old.yes_condition
      or new.no_condition is distinct from old.no_condition
      or new.cancel_condition is distinct from old.cancel_condition
      or new.resolution_source_text is distinct from old.resolution_source_text
      or new.resolution_source_url is distinct from old.resolution_source_url
      or new.trading_closes_at is distinct from old.trading_closes_at
      or new.resolution_eligible_at is distinct from old.resolution_eligible_at
      or new.timezone is distinct from old.timezone
      or new.mode is distinct from old.mode
      or new.resolution_mode is distinct from old.resolution_mode
      or new.creator_can_participate is distinct from old.creator_can_participate
      or new.outcome_control is distinct from old.outcome_control
      or new.rule_revision is distinct from old.rule_revision
      or new.published_at is distinct from old.published_at then
      raise exception 'The first stake must lock the already-published rules without changing them.' using errcode = '55000';
    end if;

    perform public.validate_market_contract(
      old.question,
      old.yes_condition,
      old.no_condition,
      old.cancel_condition,
      old.resolution_source_text,
      old.resolution_source_url,
      old.trading_closes_at,
      old.resolution_eligible_at,
      old.timezone,
      old.mode,
      old.resolution_mode,
      old.creator_can_participate,
      old.outcome_control
    );

    if public.market_has_unresolved_tokens(
      old.question,
      old.yes_condition,
      old.no_condition,
      old.cancel_condition,
      old.resolution_source_text
    ) then
      raise exception 'A market with unresolved template placeholders cannot receive a first stake.' using errcode = '55000';
    end if;

    new.rules_locked_at := new.first_stake_at;
    locked_rules := public.market_contract_json(
      old.template_key,
      old.question,
      old.yes_condition,
      old.no_condition,
      old.cancel_condition,
      old.resolution_source_text,
      old.resolution_source_url,
      old.trading_closes_at,
      old.resolution_eligible_at,
      old.timezone,
      old.mode,
      old.resolution_mode,
      old.creator_can_participate,
      old.outcome_control
    );

    insert into public.market_rule_snapshots (
      market_id,
      group_id,
      season_id,
      rule_revision,
      rules,
      rules_hash,
      locked_at
    ) values (
      old.id,
      old.group_id,
      old.season_id,
      old.rule_revision,
      locked_rules,
      public.market_contract_hash(locked_rules),
      new.first_stake_at
    );
  elsif old.first_stake_at is not null then
    if new.first_stake_at is distinct from old.first_stake_at
      or new.rules_locked_at is distinct from old.rules_locked_at then
      raise exception 'The first stake and rules lock timestamps are immutable.' using errcode = '55000';
    end if;

    if new.template_key is distinct from old.template_key
      or new.question is distinct from old.question
      or new.yes_condition is distinct from old.yes_condition
      or new.no_condition is distinct from old.no_condition
      or new.cancel_condition is distinct from old.cancel_condition
      or new.resolution_source_text is distinct from old.resolution_source_text
      or new.resolution_source_url is distinct from old.resolution_source_url
      or new.trading_closes_at is distinct from old.trading_closes_at
      or new.resolution_eligible_at is distinct from old.resolution_eligible_at
      or new.timezone is distinct from old.timezone
      or new.mode is distinct from old.mode
      or new.resolution_mode is distinct from old.resolution_mode
      or new.creator_can_participate is distinct from old.creator_can_participate
      or new.outcome_control is distinct from old.outcome_control
      or new.rule_revision is distinct from old.rule_revision
      or new.published_at is distinct from old.published_at then
      raise exception 'Funded market rules are immutable; cancel and recreate the market.' using errcode = '55000';
    end if;
  elsif new.rules_locked_at is not null then
    raise exception 'Rules cannot be locked before the first stake.' using errcode = '55000';
  end if;

  return new;
end;
$$;

create trigger protect_market_contract_before_update
  before update on public.markets
  for each row execute procedure public.protect_market_contract();

create or replace function public.require_position_rule_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.markets market
    join public.market_rule_snapshots snapshot on snapshot.market_id = market.id
    where market.id = new.market_id
      and market.first_stake_at is not null
      and market.rules_locked_at is not null
  ) then
    raise exception 'The first position must lock an immutable market rules snapshot in the same transaction.' using errcode = '55000';
  end if;
  return new;
end;
$$;

create constraint trigger positions_require_rule_snapshot
  after insert or update on public.positions
  deferrable initially deferred
  for each row execute procedure public.require_position_rule_snapshot();

create or replace function public.require_first_stake_position()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.first_stake_at is null
    and new.first_stake_at is not null
    and not exists (
      select 1 from public.positions position where position.market_id = new.id
    ) then
    raise exception 'A market rules lock and its first position must commit in the same transaction.' using errcode = '55000';
  end if;
  return new;
end;
$$;

create constraint trigger first_stake_requires_position
  after update on public.markets
  deferrable initially deferred
  for each row execute procedure public.require_first_stake_position();

create or replace function public.prevent_market_service_record_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Market service records are append-only.' using errcode = '55000';
end;
$$;

create trigger market_rule_snapshots_are_immutable
  before update or delete on public.market_rule_snapshots
  for each row execute procedure public.prevent_market_service_record_mutation();

create trigger market_mutation_receipts_are_immutable
  before update or delete on public.market_mutation_receipts
  for each row execute procedure public.prevent_market_service_record_mutation();

create or replace function public.prevent_draft_market_invitation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.market_id is not null and exists (
    select 1 from public.markets market
    where market.id = new.market_id
      and market.status = 'draft'
  ) then
    raise exception 'Draft markets cannot be shared through invitations.' using errcode = '22023';
  end if;
  return new;
end;
$$;

create or replace function public.prevent_draft_market_invitation_acceptance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.uses > old.uses
    and new.market_id is not null
    and exists (
      select 1 from public.markets market
      where market.id = new.market_id
        and market.status = 'draft'
    ) then
    raise exception 'Draft market invitations cannot be accepted.' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger invitations_reject_draft_markets
  before insert or update of market_id on public.invitations
  for each row execute procedure public.prevent_draft_market_invitation();

create trigger invitations_reject_draft_market_acceptance
  before update of uses on public.invitations
  for each row execute procedure public.prevent_draft_market_invitation_acceptance();

update public.invitations invitation
set revoked_at = coalesce(invitation.revoked_at, statement_timestamp())
from public.markets market
where invitation.market_id = market.id
  and market.status = 'draft'
  and invitation.revoked_at is null;

create or replace function public.preview_invitation(invitation_token_hash text)
returns table (
  invitation_id uuid,
  group_id uuid,
  group_name text,
  group_avatar_url text,
  accent_theme text,
  market_id uuid,
  market_question text,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    invitation.id,
    friend_group.id,
    friend_group.name,
    friend_group.avatar_url,
    friend_group.accent_theme,
    market.id,
    market.question,
    invitation.expires_at
  from public.invitations invitation
  join public.groups friend_group on friend_group.id = invitation.group_id
  left join public.markets market
    on market.id = invitation.market_id
    and market.status <> 'draft'
  where invitation.token_hash = $1
    and invitation.revoked_at is null
    and invitation.expires_at > now()
    and (invitation.maximum_uses is null or invitation.uses < invitation.maximum_uses)
    and friend_group.archived_at is null
    and (invitation.market_id is null or market.id is not null)
  limit 1;
$$;

revoke all on function public.market_contract_json(text, text, text, text, text, text, text, timestamptz, timestamptz, text, text, text, boolean, text) from public;
revoke all on function public.market_contract_hash(jsonb) from public;
revoke all on function public.market_has_unresolved_tokens(text, text, text, text, text) from public;
revoke all on function public.validate_market_contract(text, text, text, text, text, text, timestamptz, timestamptz, text, text, text, boolean, text) from public;
revoke all on function public.can_create_market(uuid) from public;
grant execute on function public.can_create_market(uuid) to authenticated;

revoke all on function public.create_market(uuid, uuid, text, text, text, text, text, text, text, timestamptz, timestamptz, text, text, boolean, text, boolean) from public;
grant execute on function public.create_market(uuid, uuid, text, text, text, text, text, text, text, timestamptz, timestamptz, text, text, boolean, text, boolean) to authenticated;

revoke all on function public.save_market_draft(uuid, integer, uuid, text, text, text, text, text, text, text, timestamptz, timestamptz, text, text, boolean, text) from public;
grant execute on function public.save_market_draft(uuid, integer, uuid, text, text, text, text, text, text, text, timestamptz, timestamptz, text, text, boolean, text) to authenticated;

revoke all on function public.publish_market(uuid, integer, uuid) from public;
grant execute on function public.publish_market(uuid, integer, uuid) to authenticated;

revoke all on function public.preview_invitation(text) from public;
grant execute on function public.preview_invitation(text) to anon, authenticated;

commit;
