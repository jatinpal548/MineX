-- Eligible account holders for drag-and-drop assignment on an inspection.
do $$
begin
  if to_regprocedure('public.has_mine_scope(uuid)') is null then
    raise exception 'MineX assignment requires public.has_mine_scope(uuid)'
      using hint = 'Apply 0002_rls.sql to the MineX Supabase project before running 0009_inspection_assignment.sql.';
  end if;

  if to_regprocedure('public.eligible_ca_assignees(uuid)') is null
     or to_regprocedure('public.notify_governance(uuid,uuid,text)') is null then
    raise exception 'MineX assignment requires the corrective-action governance functions'
      using hint = 'Apply 0006_governance.sql before running 0009_inspection_assignment.sql.';
  end if;
end;
$$;

create or replace function public.eligible_inspection_assignees(p_inspection_id uuid)
returns table (id uuid, full_name text, email text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct p.id, p.full_name, p.email
  from public.inspections i
  join public.role_assignments ra on ra.mine_id = i.mine_id
  join public.profiles p on p.id = ra.profile_id
  where i.id = p_inspection_id
    and public.has_mine_scope(i.mine_id)
    and (ra.valid_to is null or ra.valid_to > now())
    and p.is_active
  order by p.full_name;
$$;

revoke execute on function public.eligible_inspection_assignees(uuid) from public;
grant execute on function public.eligible_inspection_assignees(uuid) to authenticated;
