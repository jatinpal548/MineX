-- ============================================================================
-- CoalGuard AI - table privileges
-- ----------------------------------------------------------------------------
-- Supabase normally auto-grants privileges on new `public` tables to the
-- anon / authenticated / service_role roles and relies on RLS to filter rows.
-- We make that explicit here so the schema is self-contained and predictable:
--   * privileges let a role *reach* a table
--   * RLS policies (0002) decide *which rows* it actually sees / writes
-- Every table has RLS enabled with deny-by-default, so a bare GRANT is safe.
-- ============================================================================

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on all tables in schema public
  to anon, authenticated, service_role;

grant usage, select on all sequences in schema public
  to anon, authenticated, service_role;

grant execute on all functions in schema public
  to anon, authenticated, service_role;

-- Apply the same defaults to anything created later in this schema.
alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated, service_role;

alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated, service_role;

alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;
