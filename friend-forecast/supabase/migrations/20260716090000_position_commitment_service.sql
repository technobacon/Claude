begin;

create table public.position_commit_receipts (
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  request_id uuid not null,
  operation text not null check (operation in ('commit', 'undo')),
  market_id uuid not null references public.markets(id) on delete cascade,
  transaction_id uuid not null references public.position_transactions(id) on delete cascade,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  primary key (actor_user_id, request_id)
);

alter table public.position_commit_receipts enable row level security;

create trigger position_commit_receipts_are_immutable
  before update or delete on public.position_commit_receipts
  for each row execute procedure public.prevent_market_service_record_mutation();

revoke all on public.position_commit_receipts from anon, authenticated, service_role;

alter table public.position_transactions
  add constraint position_transactions_undo_window
    check (undo_expires_at is null or undo_expires_at >= created_at);

-- A fully undone position keeps its aggregate row at zero points: deleting it
-- would cascade into the transaction history, which is append-only.
alter table public.positions
  drop constraint positions_points_check,
  add constraint positions_points_check check (points >= 0);

create view public.market_pools
with (security_invoker = true)
as
select
  market.id as market_id,
  market.group_id,
  coalesce(sum(position.points) filter (where position.side = 'yes'), 0)::bigint as yes_pool,
  coalesce(sum(position.points) filter (where position.side = 'no'), 0)::bigint as no_pool,
  count(position.id) filter (where position.side = 'yes' and position.points > 0)::bigint as yes_backers,
  count(position.id) filter (where position.side = 'no' and position.points > 0)::bigint as no_backers
from public.markets market
left join public.positions position on position.market_id = market.id
group by market.id, market.group_id;

grant select on public.market_pools to authenticated;

create or replace function public.position_pool_odds(target_market_id uuid)
returns integer
language sql
stable
set search_path = public
as $$
  select case
    when coalesce(sum(position.points), 0) = 0 then 50
    else round(
      coalesce(sum(position.points) filter (where position.side = 'yes'), 0)::numeric
      / sum(position.points)::numeric * 100
    )::integer
  end
  from public.positions position
  where position.market_id = target_market_id;
$$;

create or replace function public.authoritative_position_state(
  target_market_id uuid,
  target_user_id uuid,
  target_transaction_id uuid
)
returns table (
  transaction_id uuid,
  position_side text,
  position_points integer,
  wallet_balance bigint,
  yes_pool bigint,
  no_pool bigint,
  yes_backers bigint,
  no_backers bigint,
  undo_expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  market_record public.markets%rowtype;
  transaction_record public.position_transactions%rowtype;
begin
  select market.* into market_record
  from public.markets market
  where market.id = target_market_id;

  select tx.* into transaction_record
  from public.position_transactions tx
  where tx.id = target_transaction_id;

  return query
  select
    transaction_record.id,
    transaction_record.side,
    coalesce((
      select position.points
      from public.positions position
      where position.market_id = target_market_id
        and position.user_id = target_user_id
    ), 0),
    (
      select coalesce(sum(entry.amount), 0)::bigint
      from public.wallet_ledger_entries entry
      where entry.user_id = target_user_id
        and entry.season_id = market_record.season_id
    ),
    pools.yes_pool,
    pools.no_pool,
    pools.yes_backers,
    pools.no_backers,
    case
      when transaction_record.reversed_at is null
        and transaction_record.undo_expires_at > statement_timestamp()
        then transaction_record.undo_expires_at
      else null
    end
  from (
    select
      coalesce(sum(position.points) filter (where position.side = 'yes'), 0)::bigint as yes_pool,
      coalesce(sum(position.points) filter (where position.side = 'no'), 0)::bigint as no_pool,
      count(position.id) filter (where position.side = 'yes' and position.points > 0)::bigint as yes_backers,
      count(position.id) filter (where position.side = 'no' and position.points > 0)::bigint as no_backers
    from public.positions position
    where position.market_id = target_market_id
  ) pools;
end;
$$;

create or replace function public.commit_position(
  target_market_id uuid,
  commit_request_id uuid,
  stake_side text,
  stake_points integer
)
returns table (
  transaction_id uuid,
  position_side text,
  position_points integer,
  wallet_balance bigint,
  yes_pool bigint,
  no_pool bigint,
  yes_backers bigint,
  no_backers bigint,
  undo_expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_user_id uuid := auth.uid();
  market_record public.markets%rowtype;
  season_record public.seasons%rowtype;
  receipt_record public.position_commit_receipts%rowtype;
  existing_position public.positions%rowtype;
  request_hash text;
  current_balance bigint;
  resulting_points integer;
  odds_before integer;
  odds_after integer;
  ledger_id uuid;
  target_position_id uuid;
  new_transaction_id uuid;
  transaction_undo_expires_at timestamptz;
  is_first_stake boolean := false;
begin
  if caller_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if commit_request_id is null then
    raise exception 'A commit request ID is required.' using errcode = '22023';
  end if;

  if stake_side not in ('yes', 'no') then
    raise exception 'Choose YES or NO.' using errcode = '22023';
  end if;

  if stake_points is null or stake_points < 1 then
    raise exception 'Stake a positive whole number of points.' using errcode = '22023';
  end if;

  request_hash := encode(digest(jsonb_build_object(
    'operation', 'commit',
    'market_id', target_market_id,
    'side', stake_side,
    'points', stake_points
  )::text, 'sha256'), 'hex');

  select receipt.* into receipt_record
  from public.position_commit_receipts receipt
  where receipt.actor_user_id = caller_user_id
    and receipt.request_id = commit_request_id;

  if found then
    if receipt_record.operation <> 'commit'
      or receipt_record.market_id <> target_market_id
      or receipt_record.request_hash <> request_hash then
      raise exception 'Commit request ID was already used for a different stake.' using errcode = '22023';
    end if;
    return query
    select * from public.authoritative_position_state(target_market_id, caller_user_id, receipt_record.transaction_id);
    return;
  end if;

  select market.* into market_record
  from public.markets market
  where market.id = target_market_id
  for update;

  if not found or not public.is_group_member(market_record.group_id) then
    raise exception 'Market was not found.' using errcode = '42501';
  end if;

  perform 1
  from public.groups friend_group
  where friend_group.id = market_record.group_id
    and friend_group.archived_at is null
  for update;

  if not found then
    raise exception 'This group is archived.' using errcode = '22023';
  end if;

  perform 1
  from public.group_memberships membership
  where membership.group_id = market_record.group_id
    and membership.user_id = caller_user_id
    and membership.status = 'active'
  for update;

  if not found then
    raise exception 'Active group membership is required.' using errcode = '42501';
  end if;

  if market_record.status <> 'open' or market_record.published_at is null then
    raise exception 'This market is not open for positions.' using errcode = '55000';
  end if;

  if market_record.trading_closes_at <= statement_timestamp() then
    raise exception 'The betting deadline has passed.' using errcode = '55000';
  end if;

  if market_record.creator_user_id = caller_user_id and not market_record.creator_can_participate then
    raise exception 'The creator sat out of this market to keep resolution clean.' using errcode = '42501';
  end if;

  select season.* into season_record
  from public.seasons season
  where season.id = market_record.season_id
    and season.group_id = market_record.group_id
    and season.status = 'active'
    and season.starts_at <= statement_timestamp()
    and season.ends_at > statement_timestamp()
  for share;

  if not found then
    raise exception 'This market belongs to a season that is no longer active.' using errcode = '55000';
  end if;

  perform public.ensure_season_wallet(season_record.id, caller_user_id, caller_user_id);

  perform 1
  from public.season_wallets wallet
  where wallet.season_id = season_record.id
    and wallet.user_id = caller_user_id
  for update;

  select position.* into existing_position
  from public.positions position
  where position.market_id = target_market_id
    and position.user_id = caller_user_id;

  if found and existing_position.points > 0 and existing_position.side <> stake_side then
    raise exception 'Positions cannot switch sides. Add to your % side or wait for resolution.', upper(existing_position.side)
      using errcode = '55000';
  end if;

  resulting_points := coalesce(existing_position.points, 0) + stake_points;

  if resulting_points < season_record.minimum_position then
    raise exception 'Positions start at % points.', season_record.minimum_position using errcode = '22023';
  end if;

  if resulting_points > season_record.max_market_stake then
    raise exception 'Positions are capped at % points per market.', season_record.max_market_stake using errcode = '22023';
  end if;

  select coalesce(sum(entry.amount), 0)::bigint into current_balance
  from public.wallet_ledger_entries entry
  where entry.season_id = season_record.id
    and entry.user_id = caller_user_id;

  if current_balance < stake_points then
    raise exception 'Your wallet has % points available.', current_balance using errcode = '22023';
  end if;

  odds_before := public.position_pool_odds(target_market_id);

  insert into public.wallet_ledger_entries (
    user_id,
    group_id,
    season_id,
    market_id,
    type,
    amount,
    idempotency_key,
    metadata,
    created_by
  )
  values (
    caller_user_id,
    market_record.group_id,
    season_record.id,
    target_market_id,
    'position_debit',
    -stake_points,
    'position_commit:' || caller_user_id::text || ':' || commit_request_id::text,
    jsonb_build_object('side', stake_side),
    caller_user_id
  )
  returning id into ledger_id;

  insert into public.positions as position_row (market_id, user_id, side, points, first_committed_at, last_committed_at)
  values (target_market_id, caller_user_id, stake_side, stake_points, statement_timestamp(), statement_timestamp())
  on conflict (market_id, user_id) do update
  set side = excluded.side,
      points = position_row.points + excluded.points,
      last_committed_at = statement_timestamp()
  returning id into target_position_id;

  odds_after := public.position_pool_odds(target_market_id);
  transaction_undo_expires_at := least(
    statement_timestamp() + interval '2 minutes',
    market_record.trading_closes_at
  );

  insert into public.position_transactions (
    position_id,
    market_id,
    user_id,
    side,
    points_delta,
    odds_before,
    odds_after,
    undo_expires_at,
    ledger_entry_id
  )
  values (
    target_position_id,
    target_market_id,
    caller_user_id,
    stake_side,
    stake_points,
    odds_before,
    odds_after,
    transaction_undo_expires_at,
    ledger_id
  )
  returning id into new_transaction_id;

  if market_record.first_stake_at is null then
    is_first_stake := true;
    update public.markets
    set first_stake_at = statement_timestamp(),
        updated_at = statement_timestamp()
    where id = target_market_id;
  end if;

  insert into public.position_commit_receipts (
    actor_user_id,
    request_id,
    operation,
    market_id,
    transaction_id,
    request_hash
  )
  values (
    caller_user_id,
    commit_request_id,
    'commit',
    target_market_id,
    new_transaction_id,
    request_hash
  );

  insert into public.audit_events (group_id, market_id, actor_user_id, event_type, new_state)
  values (
    market_record.group_id,
    target_market_id,
    caller_user_id,
    'position_committed',
    jsonb_build_object(
      'side', stake_side,
      'points', stake_points,
      'odds_after', odds_after,
      'first_stake', is_first_stake
    )
  );

  return query
  select * from public.authoritative_position_state(target_market_id, caller_user_id, new_transaction_id);
end;
$$;

create or replace function public.undo_position_commit(
  target_transaction_id uuid,
  undo_request_id uuid
)
returns table (
  transaction_id uuid,
  position_side text,
  position_points integer,
  wallet_balance bigint,
  yes_pool bigint,
  no_pool bigint,
  yes_backers bigint,
  no_backers bigint,
  undo_expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_user_id uuid := auth.uid();
  transaction_record public.position_transactions%rowtype;
  market_record public.markets%rowtype;
  receipt_record public.position_commit_receipts%rowtype;
  request_hash text;
  remaining_points integer;
  odds_after integer;
begin
  if caller_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if undo_request_id is null then
    raise exception 'An undo request ID is required.' using errcode = '22023';
  end if;

  request_hash := encode(digest(jsonb_build_object(
    'operation', 'undo',
    'transaction_id', target_transaction_id
  )::text, 'sha256'), 'hex');

  select receipt.* into receipt_record
  from public.position_commit_receipts receipt
  where receipt.actor_user_id = caller_user_id
    and receipt.request_id = undo_request_id;

  if found then
    if receipt_record.operation <> 'undo'
      or receipt_record.transaction_id <> target_transaction_id
      or receipt_record.request_hash <> request_hash then
      raise exception 'Undo request ID was already used for a different transaction.' using errcode = '22023';
    end if;
    return query
    select * from public.authoritative_position_state(receipt_record.market_id, caller_user_id, target_transaction_id);
    return;
  end if;

  select tx.* into transaction_record
  from public.position_transactions tx
  where tx.id = target_transaction_id
    and tx.user_id = caller_user_id;

  if not found then
    raise exception 'Position transaction was not found.' using errcode = '42501';
  end if;

  select market.* into market_record
  from public.markets market
  where market.id = transaction_record.market_id
  for update;

  perform 1
  from public.group_memberships membership
  where membership.group_id = market_record.group_id
    and membership.user_id = caller_user_id
    and membership.status = 'active'
  for update;

  if not found then
    raise exception 'Active group membership is required.' using errcode = '42501';
  end if;

  select tx.* into transaction_record
  from public.position_transactions tx
  where tx.id = target_transaction_id
    and tx.user_id = caller_user_id;

  if transaction_record.reversed_at is not null then
    raise exception 'This commitment was already undone.' using errcode = '55000';
  end if;

  if transaction_record.undo_expires_at is null
    or transaction_record.undo_expires_at <= statement_timestamp() then
    raise exception 'The undo window has closed.' using errcode = '55000';
  end if;

  if market_record.status <> 'open' or market_record.trading_closes_at <= statement_timestamp() then
    raise exception 'This market is no longer accepting changes.' using errcode = '55000';
  end if;

  if exists (
    select 1
    from public.position_transactions later_tx
    where later_tx.market_id = transaction_record.market_id
      and later_tx.user_id = caller_user_id
      and later_tx.reversed_at is null
      and later_tx.created_at > transaction_record.created_at
  ) then
    raise exception 'Only your latest commitment can be undone.' using errcode = '55000';
  end if;

  perform 1
  from public.season_wallets wallet
  where wallet.season_id = market_record.season_id
    and wallet.user_id = caller_user_id
  for update;

  insert into public.wallet_ledger_entries (
    user_id,
    group_id,
    season_id,
    market_id,
    type,
    amount,
    idempotency_key,
    metadata,
    created_by
  )
  values (
    caller_user_id,
    market_record.group_id,
    market_record.season_id,
    transaction_record.market_id,
    'position_reversal',
    transaction_record.points_delta,
    'position_reversal:' || target_transaction_id::text,
    jsonb_build_object('side', transaction_record.side),
    caller_user_id
  );

  update public.position_transactions
  set reversed_at = statement_timestamp()
  where id = target_transaction_id;

  select position.points - transaction_record.points_delta into remaining_points
  from public.positions position
  where position.id = transaction_record.position_id;

  if remaining_points is null or remaining_points < 0 then
    raise exception 'The aggregated position no longer matches its transactions.' using errcode = '55000';
  end if;

  update public.positions
  set points = remaining_points,
      last_committed_at = statement_timestamp()
  where id = transaction_record.position_id;

  odds_after := public.position_pool_odds(transaction_record.market_id);

  insert into public.position_commit_receipts (
    actor_user_id,
    request_id,
    operation,
    market_id,
    transaction_id,
    request_hash
  )
  values (
    caller_user_id,
    undo_request_id,
    'undo',
    transaction_record.market_id,
    target_transaction_id,
    request_hash
  );

  insert into public.audit_events (group_id, market_id, actor_user_id, event_type, new_state)
  values (
    market_record.group_id,
    transaction_record.market_id,
    caller_user_id,
    'position_reversed',
    jsonb_build_object(
      'side', transaction_record.side,
      'points', transaction_record.points_delta,
      'odds_after', odds_after
    )
  );

  return query
  select * from public.authoritative_position_state(transaction_record.market_id, caller_user_id, target_transaction_id);
end;
$$;

revoke all on function public.position_pool_odds(uuid) from public;
revoke all on function public.authoritative_position_state(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.commit_position(uuid, uuid, text, integer) from public;
grant execute on function public.commit_position(uuid, uuid, text, integer) to authenticated;
revoke all on function public.undo_position_commit(uuid, uuid) from public;
grant execute on function public.undo_position_commit(uuid, uuid) to authenticated;

commit;
