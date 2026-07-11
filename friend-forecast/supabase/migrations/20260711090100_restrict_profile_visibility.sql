begin;

create or replace function public.shares_group_with(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_user_id = auth.uid()
    or exists (
      select 1
      from public.group_memberships mine
      join public.group_memberships theirs
        on theirs.group_id = mine.group_id
      where mine.user_id = auth.uid()
        and mine.status = 'active'
        and theirs.user_id = target_user_id
        and theirs.status = 'active'
    );
$$;

revoke all on function public.is_group_member(uuid) from public;
grant execute on function public.is_group_member(uuid) to authenticated;

revoke all on function public.shares_group_with(uuid) from public;
grant execute on function public.shares_group_with(uuid) to authenticated;

drop policy if exists "profiles are readable by authenticated users" on public.profiles;

create policy "profiles are visible within shared groups"
  on public.profiles for select
  to authenticated
  using (public.shares_group_with(id));

commit;
