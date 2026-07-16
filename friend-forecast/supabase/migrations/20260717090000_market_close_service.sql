begin;

-- Realtime pool movement: publish position and market changes when the
-- Supabase realtime publication exists (it does not in local test databases).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.positions;
    alter publication supabase_realtime add table public.markets;
  end if;
end;
$$;

create or replace function public.close_market_internal(target_market_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  market_record public.markets%rowtype;
  position_record record;
  active_yes_pool bigint;
  active_no_pool bigint;
  refunded_positions integer := 0;
  refunded_points bigint := 0;
  refund_reason text;
begin
  select market.* into market_record
  from public.markets market
  where market.id = target_market_id
  for update;

  if not found or market_record.status <> 'open' then
    return coalesce(market_record.status, 'missing');
  end if;

  if market_record.trading_closes_at > statement_timestamp() then
    return 'open';
  end if;

  select
    coalesce(sum(position.points) filter (where position.side = 'yes'), 0)::bigint,
    coalesce(sum(position.points) filter (where position.side = 'no'), 0)::bigint
  into active_yes_pool, active_no_pool
  from public.positions position
  where position.market_id = target_market_id
    and position.points > 0;

  if active_yes_pool > 0 and active_no_pool > 0 then
    update public.markets
    set status = 'closed',
        updated_at = statement_timestamp()
    where id = target_market_id;

    insert into public.audit_events (group_id, market_id, actor_user_id, event_type, previous_state, new_state)
    values (
      market_record.group_id,
      target_market_id,
      auth.uid(),
      'market_closed',
      jsonb_build_object('status', 'open'),
      jsonb_build_object(
        'status', 'closed',
        'yes_pool', active_yes_pool,
        'no_pool', active_no_pool
      )
    );

    return 'closed';
  end if;

  refund_reason := case
    when active_yes_pool = 0 and active_no_pool = 0 then 'unfunded'
    else 'one_sided'
  end;

  for position_record in
    select position.user_id, position.side, position.points
    from public.positions position
    where position.market_id = target_market_id
      and position.points > 0
    order by position.user_id
  loop
    perform 1
    from public.season_wallets wallet
    where wallet.season_id = market_record.season_id
      and wallet.user_id = position_record.user_id
    for update;

    insert into public.wallet_ledger_entries (
      user_id,
      group_id,
      season_id,
      market_id,
      type,
      amount,
      idempotency_key,
      metadata
    )
    values (
      position_record.user_id,
      market_record.group_id,
      market_record.season_id,
      target_market_id,
      'refund_credit',
      position_record.points,
      'market_refund:' || target_market_id::text || ':' || position_record.user_id::text,
      jsonb_build_object('reason', refund_reason, 'side', position_record.side)
    );

    refunded_positions := refunded_positions + 1;
    refunded_points := refunded_points + position_record.points;
  end loop;

  update public.markets
  set status = 'cancelled',
      resolved_at = statement_timestamp(),
      updated_at = statement_timestamp()
  where id = target_market_id;

  insert into public.audit_events (group_id, market_id, actor_user_id, event_type, previous_state, new_state)
  values (
    market_record.group_id,
    target_market_id,
    auth.uid(),
    'market_refunded',
    jsonb_build_object('status', 'open'),
    jsonb_build_object(
      'status', 'cancelled',
      'reason', refund_reason,
      'refunded_positions', refunded_positions,
      'refunded_points', refunded_points
    )
  );

  return 'cancelled';
end;
$$;

create or replace function public.close_market_if_due(target_market_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  market_group_id uuid;
begin
  select market.group_id into market_group_id
  from public.markets market
  where market.id = target_market_id;

  if not found then
    raise exception 'Market was not found.' using errcode = '42501';
  end if;

  if auth.role() is distinct from 'service_role'
    and not public.is_group_member(market_group_id) then
    raise exception 'Market was not found.' using errcode = '42501';
  end if;

  return public.close_market_internal(target_market_id);
end;
$$;

create or replace function public.close_due_group_markets(target_group_id uuid)
returns table (
  markets_closed integer,
  markets_refunded integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  due_market record;
  closed_count integer := 0;
  refunded_count integer := 0;
  close_result text;
begin
  if auth.role() is distinct from 'service_role'
    and not public.is_group_member(target_group_id) then
    raise exception 'Active group membership is required.' using errcode = '42501';
  end if;

  for due_market in
    select market.id
    from public.markets market
    where market.group_id = target_group_id
      and market.status = 'open'
      and market.trading_closes_at <= statement_timestamp()
    order by market.trading_closes_at, market.id
  loop
    close_result := public.close_market_internal(due_market.id);
    if close_result = 'closed' then
      closed_count := closed_count + 1;
    elsif close_result = 'cancelled' then
      refunded_count := refunded_count + 1;
    end if;
  end loop;

  return query select closed_count, refunded_count;
end;
$$;

revoke all on function public.close_market_internal(uuid) from public, anon, authenticated;
revoke all on function public.close_market_if_due(uuid) from public;
grant execute on function public.close_market_if_due(uuid) to authenticated, service_role;
revoke all on function public.close_due_group_markets(uuid) from public;
grant execute on function public.close_due_group_markets(uuid) to authenticated, service_role;

commit;
