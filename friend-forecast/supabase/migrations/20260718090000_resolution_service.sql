begin;

-- Resolution windows for the pilot. Bounded configuration can come later;
-- the values follow docs/04-resolution-and-trust.md.
create or replace function public.resolution_challenge_window()
returns interval
language sql
immutable
as $$ select interval '12 hours'; $$;

create or replace function public.resolution_creator_grace()
returns interval
language sql
immutable
as $$ select interval '24 hours'; $$;

create or replace function public.resolution_vote_window()
returns interval
language sql
immutable
as $$ select interval '24 hours'; $$;

create table public.market_resolution_proposals (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references public.markets(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  proposer_user_id uuid not null references public.profiles(id),
  request_id uuid not null,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  outcome text not null check (outcome in ('yes', 'no', 'cancel', 'not_ready')),
  explanation text not null check (char_length(btrim(explanation)) between 3 and 2000),
  evidence_url text check (
    evidence_url is null
    or (
      char_length(evidence_url) <= 2048
      and evidence_url ~* '^https?://[[:alnum:]]([[:alnum:].-]*[[:alnum:]])?(:[0-9]+)?([/?#][^[:space:]]*)?$'
      and evidence_url !~ '\.\.'
    )
  ),
  challenge_deadline timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'disputed', 'superseded')),
  created_at timestamptz not null default now(),
  unique (proposer_user_id, request_id)
);

create unique index one_undecided_proposal_per_market
  on public.market_resolution_proposals(market_id)
  where status = 'pending';

create table public.market_disputes (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references public.markets(id) on delete cascade,
  proposal_id uuid not null references public.market_resolution_proposals(id) on delete restrict,
  group_id uuid not null references public.groups(id) on delete cascade,
  disputer_user_id uuid not null references public.profiles(id),
  request_id uuid not null,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  reason text not null check (char_length(btrim(reason)) between 3 and 2000),
  evidence_url text check (
    evidence_url is null
    or (
      char_length(evidence_url) <= 2048
      and evidence_url ~* '^https?://[[:alnum:]]([[:alnum:].-]*[[:alnum:]])?(:[0-9]+)?([/?#][^[:space:]]*)?$'
      and evidence_url !~ '\.\.'
    )
  ),
  vote_deadline timestamptz not null,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  unique (disputer_user_id, request_id)
);

-- One substantive dispute path at a time. A NOT-READY finalization (FF-012)
-- releases the dispute so a later proposal can be disputed again.
create unique index one_active_dispute_per_market
  on public.market_disputes(market_id)
  where released_at is null;

create table public.market_vote_snapshots (
  dispute_id uuid not null references public.market_disputes(id) on delete restrict,
  market_id uuid not null references public.markets(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key (dispute_id, user_id)
);

alter table public.market_resolution_proposals enable row level security;
alter table public.market_disputes enable row level security;
alter table public.market_vote_snapshots enable row level security;

create policy "members can read resolution proposals"
  on public.market_resolution_proposals for select
  to authenticated
  using (public.is_group_member(group_id));

create policy "members can read disputes"
  on public.market_disputes for select
  to authenticated
  using (public.is_group_member(group_id));

create policy "members can read voter snapshots"
  on public.market_vote_snapshots for select
  to authenticated
  using (
    exists (
      select 1 from public.market_disputes dispute
      where dispute.id = market_vote_snapshots.dispute_id
        and public.is_group_member(dispute.group_id)
    )
  );

revoke all on public.market_resolution_proposals from anon, authenticated, service_role;
revoke all on public.market_disputes from anon, authenticated, service_role;
revoke all on public.market_vote_snapshots from anon, authenticated, service_role;
grant select on public.market_resolution_proposals to authenticated, service_role;
grant select on public.market_disputes to authenticated, service_role;
grant select on public.market_vote_snapshots to authenticated, service_role;

-- Proposals stay immutable after submission except for the service-managed
-- status transitions out of 'pending'.
create or replace function public.protect_resolution_proposal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Resolution proposals are append-only.' using errcode = '55000';
  end if;

  if new.id is distinct from old.id
    or new.market_id is distinct from old.market_id
    or new.group_id is distinct from old.group_id
    or new.proposer_user_id is distinct from old.proposer_user_id
    or new.request_id is distinct from old.request_id
    or new.request_hash is distinct from old.request_hash
    or new.outcome is distinct from old.outcome
    or new.explanation is distinct from old.explanation
    or new.evidence_url is distinct from old.evidence_url
    or new.challenge_deadline is distinct from old.challenge_deadline
    or new.created_at is distinct from old.created_at then
    raise exception 'Submitted resolution proposals cannot be edited.' using errcode = '55000';
  end if;

  if old.status <> 'pending' and new.status is distinct from old.status then
    raise exception 'A decided proposal cannot change status again.' using errcode = '55000';
  end if;

  return new;
end;
$$;

create trigger market_resolution_proposals_are_immutable
  before update or delete on public.market_resolution_proposals
  for each row execute procedure public.protect_resolution_proposal();

-- Disputes and voter snapshots are append-only; FF-012 finalization may only
-- stamp released_at on a dispute exactly once.
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
    or (old.released_at is not null and new.released_at is distinct from old.released_at) then
    raise exception 'Submitted disputes cannot be edited.' using errcode = '55000';
  end if;

  return new;
end;
$$;

create trigger market_disputes_are_immutable
  before update or delete on public.market_disputes
  for each row execute procedure public.protect_market_dispute();

create trigger market_vote_snapshots_are_immutable
  before update or delete on public.market_vote_snapshots
  for each row execute procedure public.prevent_market_service_record_mutation();

-- The voter set is frozen the moment the dispute begins: snapshot rows can
-- only be written inside the same transaction that creates their dispute.
create or replace function public.require_snapshot_with_dispute()
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
      and dispute.created_at = now()
  ) then
    raise exception 'The voter snapshot is frozen when its dispute is created.' using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger market_vote_snapshots_written_with_dispute
  before insert on public.market_vote_snapshots
  for each row execute procedure public.require_snapshot_with_dispute();

create or replace function public.propose_resolution(
  target_market_id uuid,
  proposal_request_id uuid,
  proposed_outcome text,
  proposal_explanation text,
  proposal_evidence_url text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_user_id uuid := auth.uid();
  market_record public.markets%rowtype;
  membership_record public.group_memberships%rowtype;
  existing_proposal public.market_resolution_proposals%rowtype;
  request_hash text;
  normalized_url text := nullif(btrim(proposal_evidence_url), '');
  new_proposal_id uuid;
  proposal_status text;
  next_market_status text;
begin
  if caller_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if proposal_request_id is null then
    raise exception 'A proposal request ID is required.' using errcode = '22023';
  end if;

  if proposed_outcome not in ('yes', 'no', 'cancel', 'not_ready') then
    raise exception 'Propose YES, NO, CANCEL, or NOT READY.' using errcode = '22023';
  end if;

  if char_length(btrim(coalesce(proposal_explanation, ''))) not between 3 and 2000 then
    raise exception 'Explain the outcome in 3 to 2000 characters.' using errcode = '22023';
  end if;

  request_hash := encode(digest(jsonb_build_object(
    'operation', 'propose',
    'market_id', target_market_id,
    'outcome', proposed_outcome,
    'explanation', btrim(proposal_explanation),
    'evidence_url', normalized_url
  )::text, 'sha256'), 'hex');

  select proposal.* into existing_proposal
  from public.market_resolution_proposals proposal
  where proposal.proposer_user_id = caller_user_id
    and proposal.request_id = proposal_request_id;

  if found then
    if existing_proposal.market_id <> target_market_id
      or existing_proposal.request_hash <> request_hash then
      raise exception 'Proposal request ID was already used for a different proposal.' using errcode = '22023';
    end if;
    return existing_proposal.id;
  end if;

  select market.* into market_record
  from public.markets market
  where market.id = target_market_id
  for update;

  if not found or not public.is_group_member(market_record.group_id) then
    raise exception 'Market was not found.' using errcode = '42501';
  end if;

  select membership.* into membership_record
  from public.group_memberships membership
  where membership.group_id = market_record.group_id
    and membership.user_id = caller_user_id
    and membership.status = 'active';

  if not found or membership_record.joined_at >= market_record.trading_closes_at then
    raise exception 'Only members who joined before the trading deadline can resolve this market.' using errcode = '42501';
  end if;

  if market_record.status <> 'closed' then
    raise exception 'This market is not awaiting a resolution proposal.' using errcode = '55000';
  end if;

  if market_record.resolution_eligible_at > statement_timestamp() then
    raise exception 'The earliest resolution time has not arrived yet.' using errcode = '55000';
  end if;

  if caller_user_id <> market_record.creator_user_id
    and statement_timestamp() < market_record.resolution_eligible_at + public.resolution_creator_grace() then
    raise exception 'The market creator proposes first. Other members can propose once the creator grace period ends.'
      using errcode = '55000';
  end if;

  if proposed_outcome = 'not_ready' then
    proposal_status := 'accepted';
    next_market_status := 'closed';
  else
    proposal_status := 'pending';
    next_market_status := 'resolution_proposed';
  end if;

  insert into public.market_resolution_proposals (
    market_id,
    group_id,
    proposer_user_id,
    request_id,
    request_hash,
    outcome,
    explanation,
    evidence_url,
    challenge_deadline,
    status
  )
  values (
    target_market_id,
    market_record.group_id,
    caller_user_id,
    proposal_request_id,
    request_hash,
    proposed_outcome,
    btrim(proposal_explanation),
    normalized_url,
    case
      when market_record.resolution_mode = 'creator_final' or proposed_outcome = 'not_ready'
        then statement_timestamp()
      else statement_timestamp() + public.resolution_challenge_window()
    end,
    proposal_status
  )
  returning id into new_proposal_id;

  if next_market_status <> market_record.status then
    update public.markets
    set status = next_market_status,
        updated_at = statement_timestamp()
    where id = target_market_id;
  end if;

  insert into public.audit_events (group_id, market_id, actor_user_id, event_type, previous_state, new_state)
  values (
    market_record.group_id,
    target_market_id,
    caller_user_id,
    'resolution_proposed',
    jsonb_build_object('status', market_record.status),
    jsonb_build_object(
      'status', next_market_status,
      'outcome', proposed_outcome,
      'proposal_id', new_proposal_id,
      'has_evidence_url', normalized_url is not null
    )
  );

  return new_proposal_id;
end;
$$;

create or replace function public.dispute_resolution(
  target_market_id uuid,
  dispute_request_id uuid,
  dispute_reason text,
  dispute_evidence_url text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_user_id uuid := auth.uid();
  market_record public.markets%rowtype;
  membership_record public.group_memberships%rowtype;
  proposal_record public.market_resolution_proposals%rowtype;
  existing_dispute public.market_disputes%rowtype;
  request_hash text;
  normalized_url text := nullif(btrim(dispute_evidence_url), '');
  new_dispute_id uuid;
  snapshot_size integer;
begin
  if caller_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if dispute_request_id is null then
    raise exception 'A dispute request ID is required.' using errcode = '22023';
  end if;

  if char_length(btrim(coalesce(dispute_reason, ''))) not between 3 and 2000 then
    raise exception 'Explain the dispute in 3 to 2000 characters.' using errcode = '22023';
  end if;

  request_hash := encode(digest(jsonb_build_object(
    'operation', 'dispute',
    'market_id', target_market_id,
    'reason', btrim(dispute_reason),
    'evidence_url', normalized_url
  )::text, 'sha256'), 'hex');

  select dispute.* into existing_dispute
  from public.market_disputes dispute
  where dispute.disputer_user_id = caller_user_id
    and dispute.request_id = dispute_request_id;

  if found then
    if existing_dispute.market_id <> target_market_id
      or existing_dispute.request_hash <> request_hash then
      raise exception 'Dispute request ID was already used for a different dispute.' using errcode = '22023';
    end if;
    return existing_dispute.id;
  end if;

  select market.* into market_record
  from public.markets market
  where market.id = target_market_id
  for update;

  if not found or not public.is_group_member(market_record.group_id) then
    raise exception 'Market was not found.' using errcode = '42501';
  end if;

  select membership.* into membership_record
  from public.group_memberships membership
  where membership.group_id = market_record.group_id
    and membership.user_id = caller_user_id
    and membership.status = 'active';

  if not found or membership_record.joined_at >= market_record.trading_closes_at then
    raise exception 'Only members who joined before the trading deadline can dispute.' using errcode = '42501';
  end if;

  if market_record.resolution_mode <> 'disputable' then
    raise exception 'This market settles on the named source without a group dispute.' using errcode = '55000';
  end if;

  if market_record.status <> 'resolution_proposed' then
    raise exception 'There is no pending proposal to dispute.' using errcode = '55000';
  end if;

  select proposal.* into proposal_record
  from public.market_resolution_proposals proposal
  where proposal.market_id = target_market_id
    and proposal.status = 'pending'
  for update;

  if not found then
    raise exception 'There is no pending proposal to dispute.' using errcode = '55000';
  end if;

  if proposal_record.challenge_deadline <= statement_timestamp() then
    raise exception 'The challenge window has closed.' using errcode = '55000';
  end if;

  if exists (
    select 1 from public.market_disputes dispute
    where dispute.market_id = target_market_id
      and dispute.released_at is null
  ) then
    raise exception 'This market already has its dispute.' using errcode = '55000';
  end if;

  insert into public.market_disputes (
    market_id,
    proposal_id,
    group_id,
    disputer_user_id,
    request_id,
    request_hash,
    reason,
    evidence_url,
    vote_deadline
  )
  values (
    target_market_id,
    proposal_record.id,
    market_record.group_id,
    caller_user_id,
    dispute_request_id,
    request_hash,
    btrim(dispute_reason),
    normalized_url,
    statement_timestamp() + public.resolution_vote_window()
  )
  returning id into new_dispute_id;

  insert into public.market_vote_snapshots (dispute_id, market_id, user_id)
  select new_dispute_id, target_market_id, membership.user_id
  from public.group_memberships membership
  where membership.group_id = market_record.group_id
    and membership.status = 'active'
    and membership.joined_at < market_record.trading_closes_at
  order by membership.user_id;

  get diagnostics snapshot_size = row_count;

  if snapshot_size < 1 then
    raise exception 'No eligible voters exist for this dispute.' using errcode = '55000';
  end if;

  update public.market_resolution_proposals
  set status = 'disputed'
  where id = proposal_record.id;

  update public.markets
  set status = 'disputed',
      updated_at = statement_timestamp()
  where id = target_market_id;

  insert into public.audit_events (group_id, market_id, actor_user_id, event_type, previous_state, new_state)
  values (
    market_record.group_id,
    target_market_id,
    caller_user_id,
    'resolution_disputed',
    jsonb_build_object('status', 'resolution_proposed'),
    jsonb_build_object(
      'status', 'disputed',
      'dispute_id', new_dispute_id,
      'proposal_id', proposal_record.id,
      'eligible_voters', snapshot_size,
      'has_evidence_url', normalized_url is not null
    )
  );

  return new_dispute_id;
end;
$$;

revoke all on function public.resolution_challenge_window() from public;
revoke all on function public.resolution_creator_grace() from public;
revoke all on function public.resolution_vote_window() from public;
grant execute on function public.resolution_challenge_window() to authenticated, service_role;
grant execute on function public.resolution_creator_grace() to authenticated, service_role;
grant execute on function public.resolution_vote_window() to authenticated, service_role;
revoke all on function public.propose_resolution(uuid, uuid, text, text, text) from public;
grant execute on function public.propose_resolution(uuid, uuid, text, text, text) to authenticated;
revoke all on function public.dispute_resolution(uuid, uuid, text, text) from public;
grant execute on function public.dispute_resolution(uuid, uuid, text, text) to authenticated;

commit;
