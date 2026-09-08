-- ============================================================================
-- CoalGuard AI - Phase 0 Storage buckets
-- ----------------------------------------------------------------------------
-- Three private buckets. Access is controlled by policies on storage.objects.
-- Phase 0 rule (deliberately simple): any authenticated user may read/write
-- objects in these buckets. Phase 1 will tighten this to mine-scope using the
-- object path prefix (e.g. "evidence/<mine_id>/...").
-- ============================================================================

insert into storage.buckets (id, name, public)
values
  ('evidence', 'evidence', false),
  ('documents', 'documents', false),
  ('avatars', 'avatars', false)
on conflict (id) do nothing;

-- evidence bucket -----------------------------------------------------------
create policy "evidence read (authenticated)" on storage.objects
  for select to authenticated using (bucket_id = 'evidence');
create policy "evidence write (authenticated)" on storage.objects
  for insert to authenticated with check (bucket_id = 'evidence');
create policy "evidence update own" on storage.objects
  for update to authenticated using (bucket_id = 'evidence' and owner = auth.uid());
create policy "evidence delete own" on storage.objects
  for delete to authenticated using (bucket_id = 'evidence' and owner = auth.uid());

-- documents bucket --------------------------------------------------------
create policy "documents read (authenticated)" on storage.objects
  for select to authenticated using (bucket_id = 'documents');
create policy "documents write (authenticated)" on storage.objects
  for insert to authenticated with check (bucket_id = 'documents');
create policy "documents update own" on storage.objects
  for update to authenticated using (bucket_id = 'documents' and owner = auth.uid());
create policy "documents delete own" on storage.objects
  for delete to authenticated using (bucket_id = 'documents' and owner = auth.uid());

-- avatars bucket --------------------------------------------------------
create policy "avatars read (authenticated)" on storage.objects
  for select to authenticated using (bucket_id = 'avatars');
create policy "avatars write own" on storage.objects
  for insert to authenticated with check (bucket_id = 'avatars' and owner = auth.uid());
create policy "avatars update own" on storage.objects
  for update to authenticated using (bucket_id = 'avatars' and owner = auth.uid());
