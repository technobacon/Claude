begin;

create or replace function public.group_role(target_group_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select membership.role
  from public.group_memberships membership
  where membership.group_id = target_group_id
    and membership.user_id = auth.uid()
    and membership.status = 'active';
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
  opening_points integer := 1000;
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
    opening_points,
    200,
    2000,
    100,
    10
  )
  returning id into new_season_id;

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
    new_group_id,
    new_season_id,
    'opening_grant',
    opening_points,
    'opening_grant:' || new_season_id::text || ':' || caller_user_id::text,
    caller_user_id
  );

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

revoke all on function public.group_role(uuid) from public;
grant execute on function public.group_role(uuid) to authenticated;

revoke all on function public.create_group(text, text, text) from public;
grant execute on function public.create_group(text, text, text) to authenticated;

commit;
