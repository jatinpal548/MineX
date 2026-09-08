-- ============================================================================
-- CoalGuard AI - synthetic demo data (safe to run repeatedly)
-- ----------------------------------------------------------------------------
-- This seeds ONLY data that does not need auth users:
--   subsidiaries, regions, mines, departments, inspection templates,
--   compliance requirements, equipment, workers, contractors, and a few
--   environmental readings.
--
-- Users, profiles and role_assignments need Supabase Auth users first.
-- After you create the demo logins (see docs/SETUP.md), run
-- supabase/seed/role_assignments.example.sql to attach roles.
--
-- All names below are illustrative demo data, not real operational records.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Subsidiaries
-- ---------------------------------------------------------------------------
insert into public.subsidiaries (name, code, hq_location) values
  ('Northern Coalfields (Demo) Ltd', 'NCL-DEMO', 'Singrauli, Madhya Pradesh'),
  ('South Eastern Coalfields (Demo) Ltd', 'SECL-DEMO', 'Bilaspur, Chhattisgarh')
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- Regions
-- ---------------------------------------------------------------------------
insert into public.regions (subsidiary_id, name, code)
select s.id, v.name, v.code
from (values
  ('NCL-DEMO',  'Singrauli Region', 'SGR'),
  ('SECL-DEMO', 'Korba Region',     'KRB')
) as v(sub_code, name, code)
join public.subsidiaries s on s.code = v.sub_code
on conflict (subsidiary_id, code) do nothing;

-- ---------------------------------------------------------------------------
-- Mines
-- ---------------------------------------------------------------------------
insert into public.mines (region_id, name, code, mine_type, latitude, longitude)
select r.id, v.name, v.code, v.mine_type::public.mine_type, v.lat, v.lon
from (values
  ('SGR', 'Jayant OC (Demo)',  'JYT', 'opencast', 24.1190, 82.6560),
  ('SGR', 'Nigahi OC (Demo)',  'NGH', 'opencast', 24.1050, 82.5850),
  ('KRB', 'Gevra OC (Demo)',   'GVR', 'opencast', 22.3400, 82.5600),
  ('KRB', 'Dipka OC (Demo)',   'DPK', 'opencast', 22.3000, 82.5100)
) as v(region_code, name, code, mine_type, lat, lon)
join public.regions r on r.code = v.region_code
on conflict (region_id, code) do nothing;

-- ---------------------------------------------------------------------------
-- Departments - the same six for every mine
-- ---------------------------------------------------------------------------
insert into public.departments (mine_id, name, dept_type)
select m.id, d.name, d.dept_type::public.department_type
from public.mines m
cross join (values
  ('Safety',      'safety'),
  ('Environment', 'environment'),
  ('Maintenance', 'maintenance'),
  ('Human Resources', 'hr'),
  ('Operations',  'operations'),
  ('Compliance',  'compliance')
) as d(name, dept_type)
on conflict (mine_id, dept_type) do nothing;

-- ---------------------------------------------------------------------------
-- Inspection template + checklist
-- ---------------------------------------------------------------------------
insert into public.inspection_templates (name, description, applies_to_dept_type, version)
values ('Daily Safety Round', 'Standard opencast daily safety inspection round.', 'safety', 1)
on conflict (name, version) do nothing;

insert into public.inspection_checklist_items (template_id, section, prompt, guidance, sort_order, is_mandatory)
select t.id, v.section, v.prompt, v.guidance, v.sort_order, v.is_mandatory
from (values
  ('Haul Roads', 'Haul road width >= 3x widest vehicle and berms intact?', 'Measure at the narrowest point; berms at least axle height.', 1, true),
  ('Haul Roads', 'Dust suppression active on active haul roads?', 'Water tanker schedule visible and followed.', 2, true),
  ('Slopes & Benches', 'Bench height and slope angle within approved mine plan?', 'Cross-check with the surveyor''s latest plan.', 3, true),
  ('Slopes & Benches', 'Any visible cracks, overhangs or loose boulders on the highwall?', 'Bar down or barricade; raise an observation.', 4, true),
  ('HEMM', 'Pre-shift checklist completed for all deployed HEMM?', 'Operator logbook signed.', 5, true),
  ('HEMM', 'Reverse alarms, lights and seatbelts functional?', 'Spot check three machines minimum.', 6, true),
  ('Electrical', 'HT/LT panels locked, earthed and free of vegetation/water?', NULL, 7, true),
  ('Emergency', 'First-aid station stocked and rescue contact list displayed?', NULL, 8, false)
) as v(section, prompt, guidance, sort_order, is_mandatory)
cross join (select id from public.inspection_templates where name = 'Daily Safety Round' limit 1) t
on conflict (template_id, sort_order) do nothing;

-- ---------------------------------------------------------------------------
-- Compliance requirements (illustrative; verify against current statute)
-- ---------------------------------------------------------------------------
insert into public.compliance_requirements (code, title, description, authority, category, frequency, applies_to_mine_type) values
  ('DGMS-DSR',   'Daily safety report submission', 'Daily safety status report to area manager.', 'DGMS', 'safety', 'daily', null),
  ('DGMS-MINE-PLAN', 'Approved mine plan adherence', 'Working confined to the approved mining plan and boundaries.', 'DGMS', 'operations', 'continuous', null),
  ('MOEFCC-EC',  'Environmental clearance conditions', 'Compliance with EC conditions and half-yearly report.', 'MoEFCC', 'environment', 'half_yearly', null),
  ('CPCB-AAQ',   'Ambient air quality monitoring', 'PM2.5/PM10/SO2/NOx monitoring at notified stations.', 'CPCB', 'environment', 'monthly', null),
  ('CGWA-WATER', 'Ground water abstraction permit', 'Valid NOC and quarterly abstraction return.', 'CGWA', 'environment', 'quarterly', null),
  ('DGMS-FIRSTAID', 'First-aid & rescue readiness audit', 'First-aid stations, trained personnel and rescue arrangements.', 'DGMS', 'safety', 'quarterly', null)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- Equipment - two assets per mine
-- ---------------------------------------------------------------------------
insert into public.equipment (mine_id, asset_code, name, category, manufacturer, status)
select m.id,
       m.code || '-' || v.suffix,
       v.name, v.category, v.manufacturer, v.status::public.equipment_status
from public.mines m
cross join (values
  ('SHOVEL-01', 'Electric Rope Shovel', 'HEMM', 'BEML', 'operational'),
  ('DUMPER-01', 'Rear Dump Truck 100T', 'HEMM', 'Komatsu', 'maintenance')
) as v(suffix, name, category, manufacturer, status)
on conflict (asset_code) do nothing;

-- ---------------------------------------------------------------------------
-- Workers - three per mine
-- ---------------------------------------------------------------------------
insert into public.workers (mine_id, employee_code, full_name, designation, skill_category)
select m.id,
       m.code || '-W' || v.n,
       v.full_name, v.designation, v.skill_category
from public.mines m
cross join (values
  ('1', 'Demo Worker One',   'Shovel Operator',  'skilled'),
  ('2', 'Demo Worker Two',   'Dumper Operator',  'skilled'),
  ('3', 'Demo Worker Three', 'Support Crew',     'semi_skilled')
) as v(n, full_name, designation, skill_category)
on conflict (employee_code) do nothing;

-- ---------------------------------------------------------------------------
-- Contractors - one per mine
-- ---------------------------------------------------------------------------
insert into public.contractors (subsidiary_id, mine_id, name, registration_no, contact_person, scope_of_work)
select r.subsidiary_id, m.id,
       'Demo OB Removal Contractor ' || m.code,
       'REG-' || m.code || '-001',
       'Site In-charge',
       'Overburden removal and haulage'
from public.mines m
join public.regions r on r.id = m.region_id
on conflict (registration_no) do nothing;

-- ---------------------------------------------------------------------------
-- Environmental readings - one recent sample per mine per parameter
-- ---------------------------------------------------------------------------
insert into public.environmental_readings
  (mine_id, parameter, value, unit, station_name, recorded_at, source, is_breach, threshold)
select m.id, v.parameter, v.value, v.unit,
       m.code || ' Boundary Station',
       now() - (v.hours_ago || ' hours')::interval,
       'sensor', v.value > v.threshold, v.threshold
from public.mines m
cross join (values
  ('PM10',  118.0, 'ug/m3', 100.0, 3),
  ('PM2.5',  54.0, 'ug/m3',  60.0, 3),
  ('noise_db', 74.5, 'dB(A)', 75.0, 6),
  ('SO2',    41.0, 'ug/m3',  80.0, 6)
) as v(parameter, value, unit, threshold, hours_ago)
where not exists (
  select 1 from public.environmental_readings er
  where er.mine_id = m.id and er.parameter = v.parameter
);
