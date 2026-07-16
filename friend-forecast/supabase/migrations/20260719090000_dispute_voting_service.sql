begin;

alter table public.market_disputes
  add column final_outcome text check (final_outcome in ('yes', 'no', 'cancel', 'not_ready')),
  add column final_reason text check (final_reason in ('decided', 'no_quorum', 'no_consensus')),
  add column finalized_at timestamptz,
  add constraint market_disputes_finalization_complete
    check ((final_outcome is null) = (finalized_at is null) and (final_reason is null) = (finalized_at is null)),
  add constraint market_disputes_release_only_not_ready
    check (released_at is null or (finalized_at is not null and final_outcome = 'not_ready'));

-- Replace the dispute-immutability trigger: the vote service may stamp the
-- finalization columns exactly once, and released_at exactly once.
create or replace function public.protect_market_dispute()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Disputes are append-only.' using errcode = '55000';
  end if;

  if new.id is distinct from old.id
    or new.market_id is distinct from old.market_id
    or new.proposal_id is distinct from old.proposal_id
    or new.group_id is distinct from old.group_id
    or new.disputer_user_id is distinct from old.disputer_user_id
    or new.request_id is distinct from old.request_id
    or new.request_hash is distinct from old.request_hash
    or new.reason is distinct from old.reason
    or new.evidence_url is distinct from old.evidence_url
    or new.vote_deadline is distinct from old.vote_deadline
    or new.created_at is distinct from old.created_at
    or (old.released_at is not null and new.released_at is distinct from old.released_at)
    or (old.finalized_at is not null and (
      new.finalized_at is distinct from old.finalized_at
      or new.final_outcome is distinct from old.final_outcome
      or new.final_reason is distinct from old.final_reason
    )) then
    raise exception 'Submitted disputes cannot be edited.' using errcode = '55000';
  end if;

  return new;
end;
$$;

create table public.market_dispute_votes (
  dispute_id uuid not null references public.market_disputes(id) on delete restrict,
  market_id uuid not null references public.markets(id) on delete cascade,
  voter_user_id uuid not null references public.profiles(id),
  choice text not null check (choice in ('yes', 'no', 'cancel', 'not_ready')),
  request_id uuid not null,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  primary key (dispute_id, voter_user_id),
  unique (voter_user_id, request_id)
);

alter table public.market_dispute_votes enable row level security;

-- Hidden ballot: a voter always sees their own vote; everyone else in the
-- group sees votes only after finalization.
create policy "votes are hidden until finalization"
  on public.market_dispute_votes for select
  to authenticated
  using (
    voter_user_id = auth.uid()
    or exists (
      select 1 from public.market_disputes dispute
      where dispute.id = market_dispute_votes.dispute_id
        and dispute.finalized_at is not null
        and public.is_group_member(dispute.group_id)
    )
  );

revoke all on public.market_dispute_votes from anon, authenticated, service_role;
grant select on public.market_dispute_votes to authenticated, service_role;

create trigger market_dispute_votes_are_immutable
  before update or delete on public.market_dispute_votes
  for each row execute procedure public.prevent_market_service_record_mutation();

-- Votes may only be written while their dispute is still undecided and open.
create or replace function public.require_open_dispute_for_vote()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.market_disputes dispute
    where dispute.id = new.dispute_id
      and dispute.market_id = new.market_id
      and dispute.finalized_at is null
      and dispute.released_at is null
      and dispute.vote_deadline > statement_timestamp()
  ) then
    raise exception 'Votes can only be cast while the dispute vote is open.' using errcode = '55000';
  end if;

  if not exists (
    select 1 from public.market_vote_snapshots snapshot
    where snapshot.dispute_id = new.dispute_id
      and snapshot.user_id = new.voter_user_id
  ) then
    raise exception 'Only voters in the dispute snapshot can vote.' using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger market_dispute_votes_require_open_dispute
  before insert on public.market_dispute_votes
  for each row execute procedure public.require_open_dispute_for_vote();

create or replace function public.dispute_quorum(eligible_count integer)
returns integer
language sql
immutable
as $$
  select greatest(ceil(eligible_count / 2.0)::integer, 3);
$$;

create or replace function public.dispute_vote_progress(target_dispute_id uuid)
returns table (
  eligible_voters integer,
  votes_cast integer,
  quorum integer,
  vote_deadline timestamptz,
  finalized_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  dispute_record public.market_disputes%rowtype;
begin
  select dispute.* into dispute_record
  from public.market_disputes dispute
  where dispute.id = target_dispute_id;

  if not found or not public.is_group_member(dispute_record.group_id) then
    raise exception 'Dispute was not found.' using errcode = '42501';
  end if;

  return query
  select
    (select count(*)::integer from public.market_vote_snapshots snapshot where snapshot.dispute_id = target_dispute_id),
    (select count(*)::integer from public.market_dispute_votes vote where vote.dispute_id = target_dispute_id),
    public.dispute_quorum((select count(*)::integer from public.market_vote_snapshots snapshot where snapshot.dispute_id = target_dispute_id)),
    dispute_record.vote_deadline,
    dispute_record.finalized_at;
end;
$$;

-- Deterministic tally. Assumes the caller holds the market row lock.
create or replace function public.finalize_dispute_internal(target_dispute_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  dispute_record public.market_disputes%rowtype;
  eligible_count integer;
  cast_count integer;
  winner text;
  winner_votes integer;
  decided_reason text;
  outcome text;
  tally jsonb;
begin
  select dispute.* into dispute_record
  from public.market_disputes dispute
  where dispute.id = target_dispute_id
  for update;

  if not found or dispute_record.finalized_at is not null then
    return dispute_record.final_outcome;
  end if;

  select count(*)::integer into eligible_count
  from public.market_vote_snapshots snapshot
  where snapshot.dispute_id = target_dispute_id;

  select count(*)::integer into cast_count
  from public.market_dispute_votes vote
  where vote.dispute_id = target_dispute_id;

  select vote.choice, count(*)::integer
  into winner, winner_votes
  from public.market_dispute_votes vote
  where vote.dispute_id = target_dispute_id
  group by vote.choice
  order by count(*) desc, vote.choice
  limit 1;

  if cast_count < public.dispute_quorum(eligible_count) then
    outcome := 'cancel';
    decided_reason := 'no_quorum';
  elsif winner_votes * 3 >= cast_count * 2 then
    outcome := winner;
    decided_reason := 'decided';
  else
    outcome := 'cancel';
    decided_reason := 'no_consensus';
  end if;

  select coalesce(jsonb_object_agg(vote.choice, vote.votes), '{}'::jsonb) into tally
  from (
    select choice, count(*)::integer as votes
    from public.market_dispute_votes vote
    where vote.dispute_id = target_dispute_id
    group by choice
  ) vote(choice, votes);

  update public.market_disputes
  set final_outcome = outcome,
      final_reason = decided_reason,
      finalized_at = statement_timestamp(),
      released_at = case when outcome = 'not_ready' then statement_timestamp() else released_at end
  where id = target_dispute_id;

  if outcome = 'not_ready' then
    update public.markets
    set status = 'closed',
        updated_at = statement_timestamp()
    where id = dispute_record.market_id;
  end if;

  insert into public.audit_events (group_id, market_id, actor_user_id, event_type, previous_state, new_state)
  values (
    dispute_record.group_id,
    dispute_record.market_id,
    auth.uid(),
    'dispute_vote_finalized',
    jsonb_build_object('status', 'disputed'),
    jsonb_build_object(
      'dispute_id', target_dispute_id,
      'outcome', outcome,
      'reason', decided_reason,
      'eligible_voters', eligible_count,
      'votes_cast', cast_count,
      'tally', tally,
      'status', case when outcome = 'not_ready' then 'closed' else 'disputed' end
    )
  );

  return outcome;
end;
$$;

create or replace function public.cast_dispute_vote(
  target_dispute_id uuid,
  vote_request_id uuid,
  vote_choice text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_user_id uuid := auth.uid();
  dispute_record public.market_disputes%rowtype;
  existing_vote public.market_dispute_votes%rowtype;
  request_hash text;
  eligible_count integer;
  cast_count integer;
begin
  if caller_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if vote_request_id is null then
    raise exception 'A vote request ID is required.' using errcode = '22023';
  end if;

  if vote_choice not in ('yes', 'no', 'cancel', 'not_ready') then
    raise exception 'Vote YES, NO, CANCEL, or NOT READY.' using errcode = '22023';
  end if;

  request_hash := encode(digest(jsonb_build_object(
    'operation', 'vote',
    'dispute_id', target_dispute_id,
    'choice', vote_choice
  )::text, 'sha256'), 'hex');

  select vote.* into existing_vote
  from public.market_dispute_votes vote
  where vote.voter_user_id = caller_user_id
    and vote.request_id = vote_request_id;

  if found then
    if existing_vote.dispute_id <> target_dispute_id
      or existing_vote.request_hash <> request_hash then
      raise exception 'Vote request ID was already used for a different vote.' using errcode = '22023';
    end if;
    return existing_vote.dispute_id;
  end if;

  select dispute.* into dispute_record
  from public.market_disputes dispute
  where dispute.id = target_dispute_id;

  if not found or not public.is_group_member(dispute_record.group_id) then
    raise exception 'Dispute was not found.' using errcode = '42501';
  end if;

  perform 1
  from public.markets market
  where market.id = dispute_record.market_id
  for update;

  select dispute.* into dispute_record
  from public.market_disputes dispute
  where dispute.id = target_dispute_id
  for update;

  if dispute_record.finalized_at is not null or dispute_record.released_at is not null then
    raise exception 'This dispute vote has already been finalized.' using errcode = '55000';
  end if;

  if dispute_record.vote_deadline <= statement_timestamp() then
    raise exception 'The voting window has closed.' using errcode = '55000';
  end if;

  if not exists (
    select 1 from public.market_vote_snapshots snapshot
    where snapshot.dispute_id = target_dispute_id
      and snapshot.user_id = caller_user_id
  ) then
    raise exception 'Only voters in the dispute snapshot can vote.' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.market_dispute_votes vote
    where vote.dispute_id = target_dispute_id
      and vote.voter_user_id = caller_user_id
  ) then
    raise exception 'You already voted on this dispute.' using errcode = '55000';
  end if;

  insert into public.market_dispute_votes (
    dispute_id,
    market_id,
    voter_user_id,
    choice,
    request_id,
    request_hash
  )
  values (
    target_dispute_id,
    dispute_record.market_id,
    caller_user_id,
    vote_choice,
    vote_request_id,
    request_hash
  );

  -- The ballot stays hidden: the audit trail never records the choice.
  insert into public.audit_events (group_id, market_id, actor_user_id, event_type, new_state)
  values (
    dispute_record.group_id,
    dispute_record.market_id,
    caller_user_id,
    'dispute_vote_cast',
    jsonb_build_object('dispute_id', target_dispute_id)
  );

  select count(*)::integer into eligible_count
  from public.market_vote_snapshots snapshot
  where snapshot.dispute_id = target_dispute_id;

  select count(*)::integer into cast_count
  from public.market_dispute_votes vote
  where vote.dispute_id = target_dispute_id;

  if cast_count >= eligible_count then
    perform public.finalize_dispute_internal(target_dispute_id);
  end if;

  return target_dispute_id;
end;
$$;

create or replace function public.finalize_dispute_if_due(target_market_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  dispute_record public.market_disputes%rowtype;
  market_group_id uuid;
  eligible_count integer;
  cast_count integer;
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

  perform 1
  from public.markets market
  where market.id = target_market_id
  for update;

  select dispute.* into dispute_record
  from public.market_disputes dispute
  where dispute.market_id = target_market_id
    and dispute.released_at is null
  order by dispute.created_at desc
  limit 1
  for update;

  if not found then
    return 'none';
  end if;

  if dispute_record.finalized_at is not null then
    return dispute_record.final_outcome;
  end if;

  select count(*)::integer into eligible_count
  from public.market_vote_snapshots snapshot
  where snapshot.dispute_id = dispute_record.id;

  select count(*)::integer into cast_count
  from public.market_dispute_votes vote
  where vote.dispute_id = dispute_record.id;

  if dispute_record.vote_deadline > statement_timestamp() and cast_count < eligible_count then
    return 'pending';
  end if;

  return public.finalize_dispute_internal(dispute_record.id);
end;
$$;

revoke all on function public.dispute_quorum(integer) from public;
grant execute on function public.dispute_quorum(integer) to authenticated, service_role;
revoke all on function public.dispute_vote_progress(uuid) from public;
grant execute on function public.dispute_vote_progress(uuid) to authenticated;
revoke all on function public.finalize_dispute_internal(uuid) from public, anon, authenticated;
revoke all on function public.cast_dispute_vote(uuid, uuid, text) from public;
grant execute on function public.cast_dispute_vote(uuid, uuid, text) to authenticated;
revoke all on function public.finalize_dispute_if_due(uuid) from public;
grant execute on function public.finalize_dispute_if_due(uuid) to authenticated, service_role;

commit;
