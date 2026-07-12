begin;

create or replace function public.create_invitation(
  target_group_id uuid,
  invitation_token_hash text,
  target_market_id uuid default null,
  invitation_expires_at timestamptz default now() + interval '7 days',
  invitation_maximum_uses integer default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_user_id uuid := auth.uid();
  caller_role text;
  new_invitation_id uuid;
begin
  caller_role := public.group_role(target_group_id);

  if caller_user_id is null or caller_role not in ('owner', 'moderator') then
    raise exception 'Only group owners and moderators can create invitations.' using errcode = '42501';
  end if;

  if invitation_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invitation token hash is invalid.' using errcode = '22023';
  end if;

  if invitation_expires_at <= now() then
    raise exception 'Invitation expiry must be in the future.' using errcode = '22023';
  end if;

  if invitation_maximum_uses is not null and invitation_maximum_uses not between 1 and 100 then
    raise exception 'Invitation maximum uses must be between 1 and 100.' using errcode = '22023';
  end if;

  if target_market_id is not null and not exists (
    select 1 from public.markets market
    where market.id = target_market_id and market.group_id = target_group_id
  ) then
    raise exception 'The invited market does not belong to this group.' using errcode = '22023';
  end if;

  insert into public.invitations (
    token_hash,
    group_id,
    market_id,
    created_by,
    expires_at,
    maximum_uses
  )
  values (
    invitation_token_hash,
    target_group_id,
    target_market_id,
    caller_user_id,
    invitation_expires_at,
    invitation_maximum_uses
  )
  returning id into new_invitation_id;

  insert into public.audit_events (group_id, market_id, actor_user_id, event_type, new_state)
  values (
    target_group_id,
    target_market_id,
    caller_user_id,
    'invitation_created',
    jsonb_build_object(
      'invitation_id', new_invitation_id,
      'expires_at', invitation_expires_at,
      'maximum_uses', invitation_maximum_uses
    )
  );

  return new_invitation_id;
end;
$$;

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
  left join public.markets market on market.id = invitation.market_id
  where invitation.token_hash = invitation_token_hash
    and invitation.revoked_at is null
    and invitation.expires_at > now()
    and (invitation.maximum_uses is null or invitation.uses < invitation.maximum_uses)
    and friend_group.archived_at is null
  limit 1;
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
  where invitation.token_hash = invitation_token_hash
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

  if already_active then
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

  select * into active_season
  from public.seasons season
  where season.group_id = invitation_record.group_id
    and season.status = 'active'
  limit 1;

  if found then
    insert into public.wallet_ledger_entries (
      user_id,
      group_id,
      season_id,
      type,
      amount,
      idempotency_key,
      created_by
    )
    values (
      caller_user_id,
      invitation_record.group_id,
      active_season.id,
      'opening_grant',
      active_season.opening_grant,
      'opening_grant:' || active_season.id::text || ':' || caller_user_id::text,
      invitation_record.created_by
    )
    on conflict (idempotency_key) do nothing;
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

create or replace function public.revoke_invitation(target_invitation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  invitation_record public.invitations%rowtype;
begin
  select * into invitation_record
  from public.invitations invitation
  where invitation.id = target_invitation_id
  for update;

  if not found or public.group_role(invitation_record.group_id) not in ('owner', 'moderator') then
    raise exception 'Invitation was not found.' using errcode = '42501';
  end if;

  if invitation_record.revoked_at is null then
    update public.invitations set revoked_at = now() where id = target_invitation_id;

    insert into public.audit_events (group_id, market_id, actor_user_id, event_type, new_state)
    values (
      invitation_record.group_id,
      invitation_record.market_id,
      auth.uid(),
      'invitation_revoked',
      jsonb_build_object('invitation_id', target_invitation_id)
    );
  end if;

  return true;
end;
$$;

create or replace function public.rotate_invitation(
  target_invitation_id uuid,
  replacement_token_hash text,
  replacement_expires_at timestamptz,
  replacement_maximum_uses integer default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  invitation_record public.invitations%rowtype;
  new_invitation_id uuid;
begin
  select * into invitation_record
  from public.invitations invitation
  where invitation.id = target_invitation_id
  for update;

  if not found or public.group_role(invitation_record.group_id) not in ('owner', 'moderator') then
    raise exception 'Invitation was not found.' using errcode = '42501';
  end if;

  if replacement_token_hash !~ '^[0-9a-f]{64}$'
    or replacement_expires_at <= now()
    or (replacement_maximum_uses is not null and replacement_maximum_uses not between 1 and 100) then
    raise exception 'Replacement invitation settings are invalid.' using errcode = '22023';
  end if;

  update public.invitations
  set revoked_at = coalesce(revoked_at, now())
  where id = target_invitation_id;

  insert into public.invitations (
    token_hash,
    group_id,
    market_id,
    created_by,
    expires_at,
    maximum_uses
  )
  values (
    replacement_token_hash,
    invitation_record.group_id,
    invitation_record.market_id,
    auth.uid(),
    replacement_expires_at,
    replacement_maximum_uses
  )
  returning id into new_invitation_id;

  insert into public.audit_events (group_id, market_id, actor_user_id, event_type, new_state)
  values (
    invitation_record.group_id,
    invitation_record.market_id,
    auth.uid(),
    'invitation_rotated',
    jsonb_build_object(
      'previous_invitation_id', target_invitation_id,
      'invitation_id', new_invitation_id
    )
  );

  return new_invitation_id;
end;
$$;

create policy "group moderators can read invitation metadata"
  on public.invitations for select
  to authenticated
  using (public.group_role(group_id) in ('owner', 'moderator'));

revoke all on function public.create_invitation(uuid, text, uuid, timestamptz, integer) from public;
grant execute on function public.create_invitation(uuid, text, uuid, timestamptz, integer) to authenticated;

revoke all on function public.preview_invitation(text) from public;
grant execute on function public.preview_invitation(text) to anon, authenticated;

revoke all on function public.accept_invitation(text) from public;
grant execute on function public.accept_invitation(text) to authenticated;

revoke all on function public.revoke_invitation(uuid) from public;
grant execute on function public.revoke_invitation(uuid) to authenticated;

revoke all on function public.rotate_invitation(uuid, text, timestamptz, integer) from public;
grant execute on function public.rotate_invitation(uuid, text, timestamptz, integer) to authenticated;

commit;
