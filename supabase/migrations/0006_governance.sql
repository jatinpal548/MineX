-- ============================================================================
-- CoalGuard AI - M3B: Governance actions support
-- ----------------------------------------------------------------------------
-- ADDITIVE ONLY. No tables, columns or enum values are added or changed.
-- The corrective-action lifecycle uses the EXISTING corrective_action_status
-- enum ('open','assigned','in_progress','submitted','verified','closed',
-- 'overdue','rejected') and the existing corrective_actions columns.
--
-- This migration adds three SECURITY DEFINER helpers + one extra SELECT policy
-- so the Command Center can, within the caller's own mine scope:
--   1. see the names of people at their mine        (profiles_read_same_scope)
--   2. list valid assignees for a corrective action (eligible_ca_assignees)
--   3. deliver an in-app notification               (notify_governance)
--
-- audit_logs already allows scoped inserts (scope_insert_audit_logs in 0002),
-- so the audit trail is written directly by the app with the user's session.
-- ============================================================================

-- 1. Profile ids the caller is allowed to see because they share a mine scope
--    (plus the caller themselves). SECURITY DEFINER so it can read
--    role_assignments regardless of that table's own RLS - same pattern as
--    public.user_mine_ids().
create or replace function public.scoped_profile_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid()
  union
  select distinct ra.profile_id
  from public.role_assignments ra
  where ra.mine_id is not null
    and (ra.valid_to is null or ra.valid_to > now())
    and public.has_mine_scope(ra.mine_id);
$$;

-- Additional (OR-ed) read policy: a signed-in user may read the profile row of
-- anyone assigned to a mine inside their scope. Existing profiles_read_self /
-- profiles_read_in_scope are unchanged.
drop policy if exists profiles_read_same_scope on public.profiles;
create policy profiles_read_same_scope on public.profiles
  for select to authenticated
  using (id in (select public.scoped_profile_ids()));

-- 2. Valid assignees for a corrective action: active profiles with a role
--    assignment AT that action's mine. Returns nothing unless the caller has
--    scope on the action's mine.
create or replace function public.eligible_ca_assignees(p_ca_id uuid)
returns table (id uuid, full_name text, email text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_mine uuid;
begin
  -- Qualify the column: this function RETURNS TABLE (id, ...), so a bare `id`
  -- here is ambiguous with that OUT column (Postgres error 42702).
  select ca.mine_id into v_mine
  from public.corrective_actions ca
  where ca.id = p_ca_id;
  if v_mine is null or not public.has_mine_scope(v_mine) then
    return;
  end if;

  return query
    select distinct p.id, p.full_name, p.email
    from public.profiles p
    join public.role_assignments ra on ra.profile_id = p.id
    where ra.mine_id = v_mine
      and (ra.valid_to is null or ra.valid_to > now())
      and p.is_active
    order by p.full_name;
end;
$$;

-- 3. Deliver an in-app notification for a corrective-action governance event.
--    Validates the caller has scope on the action and the recipient is within
--    the caller's scope. This is the ONLY sanctioned insert path into
--    notifications for non-admins (the table has no general INSERT policy).
create or replace function public.notify_governance(
  p_ca_id     uuid,
  p_recipient uuid,
  p_kind      text
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_mine     uuid;
  v_title    text;
  v_body     text;
  v_priority public.notification_priority := 'info';
begin
  if p_recipient is null then
    return;
  end if;

  select mine_id into v_mine from public.corrective_actions where id = p_ca_id;
  if v_mine is null or not public.has_mine_scope(v_mine) then
    raise exception 'notify_governance: not authorized for this corrective action';
  end if;

  if p_recipient <> auth.uid()
     and not exists (select 1 from public.scoped_profile_ids() s where s = p_recipient) then
    raise exception 'notify_governance: recipient is outside your scope';
  end if;

  if p_kind = 'assigned' then
    v_title := 'Corrective action assigned to you';
    v_body := 'A corrective action has been assigned to you for closure.';
    v_priority := 'high';
  elsif p_kind = 'submitted' then
    v_title := 'Corrective action submitted for verification';
    v_body := 'An assigned corrective action has been submitted for your verification.';
    v_priority := 'warning';
  elsif p_kind = 'verified' then
    v_title := 'Corrective action verified';
    v_body := 'Your corrective action closure has been verified and closed.';
    v_priority := 'info';
  elsif p_kind = 'rejected' then
    v_title := 'Corrective action requires review';
    v_body := 'Your corrective action closure was rejected. Open it to see the reason.';
    v_priority := 'high';
  else
    return;
  end if;

  insert into public.notifications
    (recipient_id, title, body, priority, category, resource_type, resource_id, action_url)
  values
    (p_recipient, v_title, v_body, v_priority, 'governance', 'corrective_action', p_ca_id,
     '/corrective-actions/' || p_ca_id::text);
end;
$$;

grant execute on function public.scoped_profile_ids()            to authenticated;
grant execute on function public.eligible_ca_assignees(uuid)     to authenticated;
grant execute on function public.notify_governance(uuid, uuid, text) to authenticated;
