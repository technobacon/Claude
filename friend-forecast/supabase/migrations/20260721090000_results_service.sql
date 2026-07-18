begin;

-- Per-position results for a settled or refunded market, including the
-- friendly superlatives the result reveal shows. Payouts come from the
-- ledger, so the reveal can never disagree with the accounting.
create or replace function public.get_market_results(target_market_id uuid)
returns table (
  user_id uuid,
  display_name text,
  side text,
  stake integer,
  payout bigint,
  net bigint,
  is_winner boolean,
  is_first_believer boolean,
  is_biggest_conviction boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  settlement_record public.market_settlements%rowtype;
  first_believer_id uuid;
  biggest_conviction_id uuid;
begin
  select settlement.* into settlement_record
  from public.market_settlements settlement
  where settlement.market_id = target_market_id;

  if not found or not public.is_group_member(settlement_record.group_id) then
    raise exception 'Results are available once the market settles.' using errcode = '42501';
  end if;

  if settlement_record.outcome in ('yes', 'no') then
    select position.user_id into first_believer_id
    from public.positions position
    where position.market_id = target_market_id
      and position.side = settlement_record.outcome
      and position.points > 0
    order by position.first_committed_at, position.id
    limit 1;

    select position.user_id into biggest_conviction_id
    from public.positions position
    where position.market_id = target_market_id
      and position.side = settlement_record.outcome
      and position.points > 0
    order by position.points desc, position.first_committed_at, position.id
    limit 1;
  end if;

  return query
  select
    position.user_id,
    profile.display_name,
    position.side,
    position.points,
    coalesce(credit.amount, 0)::bigint,
    coalesce(credit.amount, 0)::bigint - position.points::bigint,
    settlement_record.outcome in ('yes', 'no') and position.side = settlement_record.outcome,
    position.user_id = first_believer_id,
    position.user_id = biggest_conviction_id
  from public.positions position
  join public.profiles profile on profile.id = position.user_id
  left join public.wallet_ledger_entries credit
    on credit.market_id = target_market_id
    and credit.user_id = position.user_id
    and credit.type in ('settlement_credit', 'refund_credit')
  where position.market_id = target_market_id
    and position.points > 0
  order by
    (settlement_record.outcome in ('yes', 'no') and position.side = settlement_record.outcome) desc,
    coalesce(credit.amount, 0) desc,
    position.points desc,
    profile.display_name;
end;
$$;

-- Season standings for the league screen: net market profit ranks first,
-- then balance, so pure inactivity never wins.
create or replace function public.get_group_standings(target_group_id uuid)
returns table (
  user_id uuid,
  display_name text,
  member_role text,
  balance bigint,
  market_net bigint,
  staked_total bigint,
  markets_played integer,
  markets_won integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  season_record public.seasons%rowtype;
begin
  if not public.is_group_member(target_group_id) then
    raise exception 'Active group membership is required.' using errcode = '42501';
  end if;

  select season.* into season_record
  from public.seasons season
  where season.group_id = target_group_id
    and season.status = 'active'
    and season.starts_at <= now()
    and season.ends_at > now()
  limit 1;

  if not found then
    return;
  end if;

  return query
  select
    membership.user_id,
    profile.display_name,
    membership.role,
    coalesce(ledger.balance, 0)::bigint,
    coalesce(ledger.market_net, 0)::bigint,
    coalesce(ledger.staked_total, 0)::bigint,
    coalesce(played.markets_played, 0)::integer,
    coalesce(ledger.markets_won, 0)::integer
  from public.group_memberships membership
  join public.profiles profile on profile.id = membership.user_id
  left join lateral (
    select
      sum(entry.amount) as balance,
      sum(entry.amount) filter (
        where entry.type in ('position_debit', 'position_reversal', 'settlement_credit', 'refund_credit')
      ) as market_net,
      -sum(entry.amount) filter (
        where entry.type in ('position_debit', 'position_reversal')
      ) as staked_total,
      count(*) filter (where entry.type = 'settlement_credit') as markets_won
    from public.wallet_ledger_entries entry
    where entry.season_id = season_record.id
      and entry.user_id = membership.user_id
  ) ledger on true
  left join lateral (
    select count(*) as markets_played
    from public.positions position
    join public.markets market on market.id = position.market_id
    where market.season_id = season_record.id
      and position.user_id = membership.user_id
      and position.points > 0
      and market.status in ('settled', 'cancelled')
  ) played on true
  where membership.group_id = target_group_id
    and membership.status = 'active'
  order by
    coalesce(ledger.market_net, 0) desc,
    coalesce(ledger.balance, 0) desc,
    profile.display_name,
    membership.user_id;
end;
$$;

revoke all on function public.get_market_results(uuid) from public;
grant execute on function public.get_market_results(uuid) to authenticated;
revoke all on function public.get_group_standings(uuid) from public;
grant execute on function public.get_group_standings(uuid) to authenticated;

commit;
