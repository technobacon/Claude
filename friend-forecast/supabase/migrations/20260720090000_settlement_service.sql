begin;

create or replace function public.resolution_expiry_window()
returns interval
language sql
immutable
as $$ select interval '7 days'; $$;

-- One settlement record per market, ever. The primary key is the database-
-- level guarantee that no market settles or refunds twice through this
-- engine, independent of the status state machine.
create table public.market_settlements (
  market_id uuid primary key references public.markets(id) on delete restrict,
  group_id uuid not null references public.groups(id) on delete cascade,
  season_id uuid not null references public.seasons(id) on delete restrict,
  outcome text not null check (outcome in ('yes', 'no', 'cancel')),
  trigger_kind text not null check (trigger_kind in ('uncontested_proposal', 'dispute_vote', 'expired_unresolved')),
  proposal_id uuid references public.market_resolution_proposals(id) on delete restrict,
  dispute_id uuid references public.market_disputes(id) on delete restrict,
  total_pool bigint not null check (total_pool >= 0),
  winning_pool bigint not null check (winning_pool >= 0),
  losing_pool bigint not null check (losing_pool >= 0),
  winner_count integer not null check (winner_count >= 0),
  payout_total bigint not null check (payout_total >= 0),
  settled_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  check (total_pool = winning_pool + losing_pool),
  check (
    (outcome = 'cancel' and winner_count = 0 and payout_total = total_pool)
    or (outcome in ('yes', 'no') and winner_count > 0 and payout_total = total_pool)
    or (total_pool = 0 and payout_total = 0)
  )
);

alter table public.market_settlements enable row level security;

create policy "members can read settlements"
  on public.market_settlements for select
  to authenticated
  using (public.is_group_member(group_id));

revoke all on public.market_settlements from anon, authenticated, service_role;
grant select on public.market_settlements to authenticated, service_role;

create trigger market_settlements_are_immutable
  before update or delete on public.market_settlements
  for each row execute procedure public.prevent_market_service_record_mutation();

-- Executes a decided outcome. Assumes the caller holds the market row lock
-- and has already validated the market state.
create or replace function public.settle_market_internal(
  target_market_id uuid,
  decided_outcome text,
  settlement_trigger text,
  source_proposal_id uuid,
  source_dispute_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  market_record public.markets%rowtype;
  position_record record;
  effective_outcome text := decided_outcome;
  total_pool bigint;
  winning_pool bigint;
  losing_pool bigint;
  winner_count integer := 0;
  payout_total bigint := 0;
  next_status text;
begin
  select market.* into market_record
  from public.markets market
  where market.id = target_market_id;

  if decided_outcome not in ('yes', 'no', 'cancel') then
    raise exception 'Only YES, NO, or CANCEL outcomes can settle.' using errcode = '55000';
  end if;

  select
    coalesce(sum(position.points), 0)::bigint,
    coalesce(sum(position.points) filter (where position.side = decided_outcome), 0)::bigint
  into total_pool, winning_pool
  from public.positions position
  where position.market_id = target_market_id
    and position.points > 0;

  -- Contested closes guarantee both pools are funded, so a decided side with
  -- an empty pool is unreachable; refund defensively instead of stranding
  -- the losing pool.
  if effective_outcome in ('yes', 'no') and winning_pool = 0 and total_pool > 0 then
    effective_outcome := 'cancel';
  end if;
  losing_pool := case when effective_outcome = 'cancel' then 0 else total_pool - winning_pool end;
  winning_pool := case when effective_outcome = 'cancel' then total_pool else winning_pool end;

  if effective_outcome = 'cancel' then
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
        user_id, group_id, season_id, market_id, type, amount, idempotency_key, metadata
      )
      values (
        position_record.user_id,
        market_record.group_id,
        market_record.season_id,
        target_market_id,
        'refund_credit',
        position_record.points,
        'market_refund:' || target_market_id::text || ':' || position_record.user_id::text,
        jsonb_build_object('reason', settlement_trigger, 'side', position_record.side)
      );

      payout_total := payout_total + position_record.points;
    end loop;

    next_status := 'cancelled';
  else
    -- Largest-remainder allocation in exact integer arithmetic:
    -- floor(points * total / winning) each, then one extra point to the
    -- largest fractional remainders (ties: earliest position, then id).
    for position_record in
      with winners as (
        select
          position.id,
          position.user_id,
          position.points,
          (position.points::bigint * total_pool) / winning_pool as floor_payout,
          (position.points::bigint * total_pool) % winning_pool as remainder_metric,
          position.first_committed_at
        from public.positions position
        where position.market_id = target_market_id
          and position.side = effective_outcome
          and position.points > 0
      ),
      floor_total as (
        select coalesce(sum(floor_payout), 0)::bigint as allocated from winners
      ),
      ranked as (
        select
          winners.*,
          row_number() over (order by remainder_metric desc, first_committed_at, id) as remainder_rank
        from winners
      )
      select
        ranked.user_id,
        ranked.points,
        ranked.floor_payout
          + case when ranked.remainder_rank <= total_pool - floor_total.allocated then 1 else 0 end
          as payout
      from ranked
      cross join floor_total
      order by ranked.user_id
    loop
      perform 1
      from public.season_wallets wallet
      where wallet.season_id = market_record.season_id
        and wallet.user_id = position_record.user_id
      for update;

      insert into public.wallet_ledger_entries (
        user_id, group_id, season_id, market_id, type, amount, idempotency_key, metadata
      )
      values (
        position_record.user_id,
        market_record.group_id,
        market_record.season_id,
        target_market_id,
        'settlement_credit',
        position_record.payout,
        'market_settlement:' || target_market_id::text || ':' || position_record.user_id::text,
        jsonb_build_object('outcome', effective_outcome, 'stake', position_record.points)
      );

      winner_count := winner_count + 1;
      payout_total := payout_total + position_record.payout;
    end loop;

    if payout_total <> total_pool then
      raise exception 'Settlement allocation of % points does not match the % point pool.', payout_total, total_pool
        using errcode = '55000';
    end if;

    next_status := 'settled';
  end if;

  insert into public.market_settlements (
    market_id, group_id, season_id, outcome, trigger_kind, proposal_id, dispute_id,
    total_pool, winning_pool, losing_pool, winner_count, payout_total, settled_by
  )
  values (
    target_market_id,
    market_record.group_id,
    market_record.season_id,
    effective_outcome,
    settlement_trigger,
    source_proposal_id,
    source_dispute_id,
    total_pool,
    winning_pool,
    losing_pool,
    winner_count,
    payout_total,
    auth.uid()
  );

  update public.markets
  set status = next_status,
      resolved_at = statement_timestamp(),
      updated_at = statement_timestamp()
  where id = target_market_id;

  insert into public.audit_events (group_id, market_id, actor_user_id, event_type, previous_state, new_state)
  values (
    market_record.group_id,
    target_market_id,
    auth.uid(),
    case when next_status = 'settled' then 'market_settled' else 'market_refunded' end,
    jsonb_build_object('status', market_record.status),
    jsonb_build_object(
      'status', next_status,
      'outcome', effective_outcome,
      'trigger', settlement_trigger,
      'total_pool', total_pool,
      'winning_pool', winning_pool,
      'losing_pool', losing_pool,
      'winner_count', winner_count,
      'payout_total', payout_total
    )
  );

  return next_status;
end;
$$;

create or replace function public.settle_market_if_due(target_market_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  market_record public.markets%rowtype;
  proposal_record public.market_resolution_proposals%rowtype;
  dispute_record public.market_disputes%rowtype;
begin
  select market.group_id into strict market_record.group_id
  from public.markets market
  where market.id = target_market_id;

  if auth.role() is distinct from 'service_role'
    and not public.is_group_member(market_record.group_id) then
    raise exception 'Market was not found.' using errcode = '42501';
  end if;

  select market.* into market_record
  from public.markets market
  where market.id = target_market_id
  for update;

  if market_record.status = 'resolution_proposed' then
    select proposal.* into proposal_record
    from public.market_resolution_proposals proposal
    where proposal.market_id = target_market_id
      and proposal.status = 'pending'
    for update;

    if not found then
      return 'pending';
    end if;

    if proposal_record.challenge_deadline > statement_timestamp() then
      return 'pending';
    end if;

    update public.market_resolution_proposals
    set status = 'accepted'
    where id = proposal_record.id;

    return public.settle_market_internal(
      target_market_id,
      proposal_record.outcome,
      'uncontested_proposal',
      proposal_record.id,
      null
    );
  end if;

  if market_record.status = 'disputed' then
    select dispute.* into dispute_record
    from public.market_disputes dispute
    where dispute.market_id = target_market_id
      and dispute.released_at is null
    order by dispute.created_at desc
    limit 1
    for update;

    if not found
      or dispute_record.finalized_at is null
      or dispute_record.final_outcome not in ('yes', 'no', 'cancel') then
      return 'pending';
    end if;

    return public.settle_market_internal(
      target_market_id,
      dispute_record.final_outcome,
      'dispute_vote',
      dispute_record.proposal_id,
      dispute_record.id
    );
  end if;

  if market_record.status = 'closed' then
    if statement_timestamp() < market_record.resolution_eligible_at + public.resolution_expiry_window() then
      return 'pending';
    end if;

    return public.settle_market_internal(
      target_market_id,
      'cancel',
      'expired_unresolved',
      null,
      null
    );
  end if;

  return market_record.status;
exception
  when no_data_found then
    raise exception 'Market was not found.' using errcode = '42501';
end;
$$;

revoke all on function public.resolution_expiry_window() from public;
grant execute on function public.resolution_expiry_window() to authenticated, service_role;
revoke all on function public.settle_market_internal(uuid, text, text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.settle_market_if_due(uuid) from public;
grant execute on function public.settle_market_if_due(uuid) to authenticated, service_role;

commit;
