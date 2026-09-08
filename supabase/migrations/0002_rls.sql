-- ============================================================================
-- CoalGuard AI - Phase 0 Row Level Security (RBAC enforcement)
-- ----------------------------------------------------------------------------
-- RLS is the REAL security boundary. The TypeScript helpers in
-- packages/config/src/rbac.ts only decide what UI to show.
--
-- Model:
--   * Every table has RLS enabled.
--   * SYSTEM_ADMIN can do everything (blanket policy on every table).
--   * "Mine-scoped" tables (the operational data) are readable/writable only
--     when the row's mine_id is inside the caller's scope, computed by
--     public.user_mine_ids().
--   * Org-hierarchy tables are readable by any authenticated user (not
--     sensitive) and writable only by SYSTEM_ADMIN.
--   * profiles / role_assignments / notifications have their own rules.
--
-- Tables without an explicit scoped policy are therefore admin-only for now.
-- Phase 1 adds finer policies (e.g. inspector can only edit their own draft).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Helper functions  (SECURITY DEFINER so they can read role_assignments
--    regardless of the caller's own policies; STABLE so the planner caches them)
-- ----------------------------------------------------------------------------
create or replace function public.current_profile_id()
returns uuid
language sql
stable
as $$
  select auth.uid();
$$;

create or replace function public.is_system_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.role_assignments ra
    where ra.profile_id = auth.uid()
      and ra.role = 'SYSTEM_ADMIN'
      and (ra.valid_to is null or ra.valid_to > now())
  );
$$;

-- Every mine id the current user is allowed to touch, based on all of their
-- active role assignments. Mirrors packages/config/src/org.ts.
create or replace function public.user_mine_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  with active as (
    select * from public.role_assignments ra
    where ra.profile_id = auth.uid()
      and (ra.valid_to is null or ra.valid_to > now())
  )
  -- corporate scope OR regulator-style group access => every mine
  select m.id
  from public.mines m
  where exists (select 1 from active a where a.scope_level = 'corporate')

  union
  -- subsidiary scope => mines under that subsidiary
  select m.id
  from public.mines m
  join public.regions r on r.id = m.region_id
  join active a on a.scope_level = 'subsidiary' and a.subsidiary_id = r.subsidiary_id

  union
  -- region scope
  select m.id
  from public.mines m
  join active a on a.scope_level = 'region' and a.region_id = m.region_id

  union
  -- mine / department scope
  select m.id
  from public.mines m
  join active a on a.scope_level in ('mine', 'department') and a.mine_id = m.id;
$$;

create or replace function public.has_mine_scope(target_mine uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_system_admin()
      or exists (select 1 from public.user_mine_ids() mid where mid = target_mine);
$$;

-- ----------------------------------------------------------------------------
-- 2. Enable RLS + blanket SYSTEM_ADMIN policy on every public table
-- ----------------------------------------------------------------------------
do $$
declare
  t text;
  all_tables text[] := array[
    'subsidiaries','regions','mines','departments',
    'profiles','role_assignments',
    'inspection_templates','inspection_checklist_items','inspections','inspection_items',
    'observations','incidents','corrective_actions','evidence',
    'compliance_requirements','compliance_records','compliance_documents',
    'environmental_readings','equipment','contractors','maintenance_records',
    'workers','contractor_workers','attendance','grievances',
    'notifications','audit_logs','ai_analyses'
  ];
begin
  foreach t in array all_tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy admin_all_%1$s on public.%1$s
       for all to authenticated
       using (public.is_system_admin())
       with check (public.is_system_admin())', t
    );
  end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. Org hierarchy - readable by any signed-in user, writable by admin only
-- ----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['subsidiaries','regions','mines','departments'] loop
    execute format(
      'create policy read_org_%1$s on public.%1$s
       for select to authenticated using (true)', t
    );
  end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. Identity
-- ----------------------------------------------------------------------------
-- profiles: read your own + anyone in your mine scope; update only your own.
create policy profiles_read_self on public.profiles
  for select to authenticated
  using (id = auth.uid());

create policy profiles_read_in_scope on public.profiles
  for select to authenticated
  using (
    exists (
      select 1 from public.role_assignments ra
      where ra.profile_id = public.profiles.id
        and ra.mine_id is not null
        and public.has_mine_scope(ra.mine_id)
    )
  );

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- role_assignments: a user can see their own; admin manages the rest
-- (covered by the blanket admin policy).
create policy role_assignments_read_self on public.role_assignments
  for select to authenticated
  using (profile_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 5. Mine-scoped operational tables - SELECT / INSERT / UPDATE within scope
-- ----------------------------------------------------------------------------
do $$
declare
  t text;
  scoped_tables text[] := array[
    'inspections','inspection_items','observations','incidents',
    'corrective_actions','evidence',
    'compliance_records','compliance_documents',
    'environmental_readings','equipment','contractors','maintenance_records',
    'workers','contractor_workers','attendance','grievances','audit_logs'
  ];
begin
  foreach t in array scoped_tables loop
    -- inspection_items has no mine_id of its own; handled separately below
    continue when t = 'inspection_items';

    execute format(
      'create policy scope_select_%1$s on public.%1$s
       for select to authenticated using (public.has_mine_scope(mine_id))', t
    );
    execute format(
      'create policy scope_insert_%1$s on public.%1$s
       for insert to authenticated with check (public.has_mine_scope(mine_id))', t
    );
    execute format(
      'create policy scope_update_%1$s on public.%1$s
       for update to authenticated
       using (public.has_mine_scope(mine_id))
       with check (public.has_mine_scope(mine_id))', t
    );
  end loop;
end;
$$;

-- inspection_items follow their parent inspection's mine.
create policy scope_select_inspection_items on public.inspection_items
  for select to authenticated
  using (
    exists (
      select 1 from public.inspections i
      where i.id = inspection_id and public.has_mine_scope(i.mine_id)
    )
  );
create policy scope_write_inspection_items on public.inspection_items
  for all to authenticated
  using (
    exists (
      select 1 from public.inspections i
      where i.id = inspection_id and public.has_mine_scope(i.mine_id)
    )
  )
  with check (
    exists (
      select 1 from public.inspections i
      where i.id = inspection_id and public.has_mine_scope(i.mine_id)
    )
  );

-- ----------------------------------------------------------------------------
-- 6. Reference data that everyone signed in may read
-- ----------------------------------------------------------------------------
create policy read_inspection_templates on public.inspection_templates
  for select to authenticated using (true);
create policy read_inspection_checklist_items on public.inspection_checklist_items
  for select to authenticated using (true);
create policy read_compliance_requirements on public.compliance_requirements
  for select to authenticated using (true);

-- ----------------------------------------------------------------------------
-- 7. Notifications - only the recipient
-- ----------------------------------------------------------------------------
create policy notifications_own on public.notifications
  for select to authenticated using (recipient_id = auth.uid());
create policy notifications_update_own on public.notifications
  for update to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 8. AI analyses - readable by the requester or anyone with scope on the
--    linked entity's mine is deferred to Phase 1; for now: requester + admin.
-- ----------------------------------------------------------------------------
create policy ai_analyses_read_own on public.ai_analyses
  for select to authenticated using (requested_by = auth.uid());
create policy ai_analyses_insert_own on public.ai_analyses
  for insert to authenticated with check (requested_by = auth.uid());
