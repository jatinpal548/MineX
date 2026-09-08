-- ============================================================================
-- CoalGuard AI - DEMO RESET  (safe to run repeatedly)
-- ----------------------------------------------------------------------------
-- Returns the LIVE database to the clean hackathon demo state:
--
--   * exactly the 2 demo inspection trees survive (fixed UUIDs below), created
--     by supabase/seed/demo-seed.mjs
--   * every other operational row (old field-test inspections / observations /
--     evidence / corrective actions / notifications / audit logs) is removed
--   * the 2 demo corrective actions are reset to `open` + unassigned so the
--     M3B governance walk-through (assign -> progress -> submit -> verify /
--     reject) can be demonstrated again from scratch
--
-- What it does NOT touch: org hierarchy, mines, departments, profiles,
-- role_assignments, inspection templates + checklist items, compliance
-- requirements, equipment / workers / contractors / environmental_readings
-- (all reference data from seed.sql), RLS policies, functions, storage buckets.
--
-- Storage OBJECTS for deleted evidence are NOT removed by SQL - run
-- demo-seed.mjs (which also prunes orphaned objects) or delete them in the
-- Storage UI. The 2 demo evidence images are kept.
--
-- Run it in the Supabase SQL editor, or:  psql "$DB_URL" -f demo_reset.sql
-- ============================================================================

do $$
declare
  keep_inspections uuid[] := array[
    'a1000000-0000-4000-8000-000000000001',   -- Daily Safety Round - Jayant OC (East Highwall)
    'a1000000-0000-4000-8000-000000000002'    -- Daily Safety Round - Jayant OC (Workshop & Substation)
  ];
  keep_observations uuid[] := array[
    'a2000000-0000-4000-8000-000000000001',
    'a2000000-0000-4000-8000-000000000002'
  ];
  keep_evidence uuid[] := array[
    'a3000000-0000-4000-8000-000000000001',
    'a3000000-0000-4000-8000-000000000002'
  ];
  demo_cas uuid[] := array[
    'a4000000-0000-4000-8000-000000000001',    -- Barricade East highwall crest ...
    'a4000000-0000-4000-8000-000000000002'     -- Restore HT panel interlock ...
  ];
begin
  -- children first ------------------------------------------------------------
  delete from public.evidence      where id      <> all (keep_evidence);
  delete from public.notifications where category = 'governance'
                                    or resource_type = 'corrective_action';
  delete from public.audit_logs    where entity_type = 'corrective_action';
  delete from public.observations  where id      <> all (keep_observations);
  delete from public.inspection_items
                                    where inspection_id <> all (keep_inspections);
  delete from public.inspections   where id      <> all (keep_inspections);

  -- reset the 2 governance corrective actions to a clean initial state -------
  update public.corrective_actions set
    status           = 'open',
    assigned_to      = null,
    assigned_by      = null,
    assigned_at      = null,
    due_date         = null,
    submitted_at     = null,
    verified_by      = null,
    verified_at      = null,
    closed_at        = null,
    closure_notes    = null,
    rejection_reason = null,
    updated_at       = now()
  where id = any (demo_cas);

  -- the 2 demo observations sit in "action required" (a CA exists, not yet done)
  update public.observations set status = 'action_required', updated_at = now()
  where id = any (keep_observations);
end $$;

-- quick check -----------------------------------------------------------------
select 'inspections' as t, count(*) from public.inspections
union all select 'inspection_items', count(*) from public.inspection_items
union all select 'observations', count(*) from public.observations
union all select 'evidence', count(*) from public.evidence
union all select 'corrective_actions', count(*) from public.corrective_actions
union all select 'notifications', count(*) from public.notifications
union all select 'audit_logs', count(*) from public.audit_logs
order by t;
