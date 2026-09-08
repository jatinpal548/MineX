-- ============================================================================
-- CoalGuard AI - attach demo roles to demo users
-- ----------------------------------------------------------------------------
-- RUN THIS ONLY AFTER:
--   1. supabase/migrations have been applied
--   2. supabase/seed/seed.sql has been run
--   3. you have created the demo login users in Supabase Auth
--      (Dashboard -> Authentication -> Users -> Add user), e.g.:
--          admin@coalguard.demo
--          manager.jayant@coalguard.demo
--          inspector.jayant@coalguard.demo
--          env.gevra@coalguard.demo
--
-- The handle_new_user() trigger already created a matching public.profiles row
-- for each of them. This script just inserts role_assignments.
--
-- Adjust the emails / mine codes to match what you created.
-- ============================================================================

-- helper: profile id by email
--   (select id from public.profiles where email = 'x')

-- SYSTEM_ADMIN (corporate scope) -----------------------------------------
insert into public.role_assignments (profile_id, role, scope_level, is_primary)
select p.id, 'SYSTEM_ADMIN', 'corporate', true
from public.profiles p
where p.email = 'admin@coalguard.demo'
on conflict do nothing;

-- MINE_MANAGER at Jayant OC --------------------------------------------
insert into public.role_assignments (profile_id, role, scope_level, mine_id, is_primary)
select p.id, 'MINE_MANAGER', 'mine', m.id, true
from public.profiles p
cross join (select id from public.mines where code = 'JYT' limit 1) m
where p.email = 'manager.jayant@coalguard.demo'
on conflict do nothing;

-- FIELD_INSPECTOR at Jayant OC, Safety department ---------------------
insert into public.role_assignments (profile_id, role, scope_level, mine_id, department_id, is_primary)
select p.id, 'FIELD_INSPECTOR', 'department', m.id, d.id, true
from public.profiles p
cross join (select id from public.mines where code = 'JYT' limit 1) m
join public.departments d on d.mine_id = m.id and d.dept_type = 'safety'
where p.email = 'inspector.jayant@coalguard.demo'
on conflict do nothing;

-- ENVIRONMENTAL_OFFICER at Gevra OC ---------------------------------
insert into public.role_assignments (profile_id, role, scope_level, mine_id, department_id, is_primary)
select p.id, 'ENVIRONMENTAL_OFFICER', 'department', m.id, d.id, true
from public.profiles p
cross join (select id from public.mines where code = 'GVR' limit 1) m
join public.departments d on d.mine_id = m.id and d.dept_type = 'environment'
where p.email = 'env.gevra@coalguard.demo'
on conflict do nothing;
