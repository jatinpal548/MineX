-- ============================================================================
-- CoalGuard AI - Milestone 2: additional inspection templates
-- ----------------------------------------------------------------------------
-- SEED-ONLY migration. No tables, columns, enums or policies are changed.
-- Adds four domain templates + their checklist items so the mobile
-- "Start Inspection" flow has real options to choose from.
--
-- `applies_to_dept_type` is used as the template CATEGORY (safety / environment
-- / maintenance / ...). Re-runnable: inserts are guarded by unique keys.
-- ============================================================================

-- 1. Templates -------------------------------------------------------------
insert into public.inspection_templates (name, description, applies_to_dept_type, version)
values
  ('Safety & PPE Inspection',
   'General workplace safety and personal protective equipment check for a work area or crew.',
   'safety', 1),
  ('Electrical Safety Inspection',
   'Condition of electrical installations, panels, earthing and cabling in the inspected zone.',
   'safety', 1),
  ('Equipment & Machinery Inspection',
   'Pre-use / periodic condition check of HEMM and fixed machinery.',
   'maintenance', 1),
  ('Environmental Compliance Inspection',
   'Dust, water, noise and waste controls against environmental clearance conditions.',
   'environment', 1)
on conflict (name, version) do nothing;

-- 2. Checklist items -----------------------------------------------------
-- Helper pattern: join each row set to its template by name.

insert into public.inspection_checklist_items
  (template_id, section, prompt, guidance, sort_order, is_mandatory)
select t.id, v.section, v.prompt, v.guidance, v.sort_order, v.is_mandatory
from (values
  ('PPE',        'All personnel wearing helmet, safety shoes and hi-vis?', 'Check every person in the work area.', 1, true),
  ('PPE',        'Task-specific PPE available and in use (goggles, gloves, ear protection)?', 'Match PPE to the hazard of the task.', 2, true),
  ('Access',     'Walkways and access routes clear of obstructions and trip hazards?', NULL, 3, true),
  ('Access',     'Edge protection / barricading in place near excavations and drops?', 'Barricades at least axle height; signage present.', 4, true),
  ('Housekeeping','Work area free of accumulated spoil, spillage and loose material?', NULL, 5, false),
  ('Emergency',  'Assembly point and emergency contacts known to the crew?', 'Ask two workers to confirm.', 6, true),
  ('Emergency',  'First-aid kit present, stocked and within date?', NULL, 7, true),
  ('Permits',    'Valid work permit / SOP available for the task in progress?', NULL, 8, true)
) as v(section, prompt, guidance, sort_order, is_mandatory)
join public.inspection_templates t on t.name = 'Safety & PPE Inspection' and t.version = 1
on conflict (template_id, sort_order) do nothing;

insert into public.inspection_checklist_items
  (template_id, section, prompt, guidance, sort_order, is_mandatory)
select t.id, v.section, v.prompt, v.guidance, v.sort_order, v.is_mandatory
from (values
  ('Panels',    'HT/LT panels closed, locked and free of water or vegetation?', NULL, 1, true),
  ('Panels',    'Danger boards and shock-treatment charts displayed?', NULL, 2, true),
  ('Earthing',  'Earthing connections intact and visibly bonded?', 'Look for loose or corroded straps.', 3, true),
  ('Cabling',   'Trailing / flexible cables free of cuts, joints and mechanical damage?', 'Raise an observation for any damaged cable.', 4, true),
  ('Cabling',   'Cables routed clear of roadways and standing water?', NULL, 5, true),
  ('Protection','ELCB / earth-fault protection tested within schedule?', 'Check the test log date.', 6, true),
  ('Isolation', 'Isolation and lock-out points identified and functional?', NULL, 7, true)
) as v(section, prompt, guidance, sort_order, is_mandatory)
join public.inspection_templates t on t.name = 'Electrical Safety Inspection' and t.version = 1
on conflict (template_id, sort_order) do nothing;

insert into public.inspection_checklist_items
  (template_id, section, prompt, guidance, sort_order, is_mandatory)
select t.id, v.section, v.prompt, v.guidance, v.sort_order, v.is_mandatory
from (values
  ('Pre-use',   'Operator pre-shift checklist completed and signed?', NULL, 1, true),
  ('Brakes',    'Service and parking brakes effective on test?', 'Do not clear if any doubt - raise an observation.', 2, true),
  ('Safety',    'Reverse alarm, horn, lights and beacons working?', NULL, 3, true),
  ('Safety',    'Seat belt fitted and serviceable?', NULL, 4, true),
  ('Structure', 'No visible cracks in chassis, bucket, boom or guards?', NULL, 5, true),
  ('Fluids',    'No significant hydraulic, fuel or coolant leaks?', NULL, 6, false),
  ('Fire',      'Fire extinguisher / suppression present and within date?', NULL, 7, true)
) as v(section, prompt, guidance, sort_order, is_mandatory)
join public.inspection_templates t on t.name = 'Equipment & Machinery Inspection' and t.version = 1
on conflict (template_id, sort_order) do nothing;

insert into public.inspection_checklist_items
  (template_id, section, prompt, guidance, sort_order, is_mandatory)
select t.id, v.section, v.prompt, v.guidance, v.sort_order, v.is_mandatory
from (values
  ('Air',       'Dust suppression (sprinklers / tankers) operating on active roads and faces?', NULL, 1, true),
  ('Air',       'Visible dust within acceptable limits at the work area boundary?', 'Note direction and source if excessive.', 2, false),
  ('Water',     'No untreated discharge to natural drainage or outside the lease?', 'Raise an observation for any discharge.', 3, true),
  ('Water',     'Garland drains and settling ponds intact and not overflowing?', NULL, 4, true),
  ('Noise',     'High-noise activity screened / scheduled away from the boundary?', NULL, 5, false),
  ('Waste',     'Used oil, filters and scrap stored in designated, bunded areas?', NULL, 6, true),
  ('Plantation','Green belt / plantation area free of encroachment and damage?', NULL, 7, false)
) as v(section, prompt, guidance, sort_order, is_mandatory)
join public.inspection_templates t on t.name = 'Environmental Compliance Inspection' and t.version = 1
on conflict (template_id, sort_order) do nothing;
