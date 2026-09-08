-- ============================================================================
-- CoalGuard AI - Phase 0 schema
-- ----------------------------------------------------------------------------
-- Relational foundation for the org hierarchy, identity/RBAC, field operations,
-- compliance, operations, people and platform tables.
--
-- Conventions:
--   * UUID primary keys (gen_random_uuid())
--   * every table has created_at; mutable tables also have updated_at
--     (kept fresh by the set_updated_at() trigger)
--   * foreign keys are indexed
--   * *_status columns use PostgreSQL enums that mirror packages/types/src/enums.ts
--   * client_ref (uuid, unique) = offline idempotency key set by the mobile app
--   * sync_status marks rows that may have been created offline
--
-- Row Level Security policies live in 0002_rls.sql.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 0. Shared helpers
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 1. Enums  (keep in sync with packages/types/src/enums.ts)
-- ----------------------------------------------------------------------------
create type public.user_role as enum (
  'FIELD_INSPECTOR', 'SAFETY_OFFICER', 'ENVIRONMENTAL_OFFICER', 'MAINTENANCE_OFFICER',
  'HR_OFFICER', 'CONTRACTOR', 'WORKER', 'COMPLIANCE_OFFICER', 'MINE_MANAGER',
  'INTERNAL_AUDITOR', 'REGIONAL_GM', 'SUBSIDIARY_HQ', 'CORPORATE_HQ', 'REGULATOR',
  'SYSTEM_ADMIN'
);

create type public.org_scope_level as enum (
  'corporate', 'subsidiary', 'region', 'mine', 'department'
);

create type public.mine_type as enum ('opencast', 'underground', 'mixed');

create type public.department_type as enum (
  'safety', 'environment', 'maintenance', 'hr', 'operations', 'compliance'
);

create type public.inspection_status as enum (
  'planned', 'in_progress', 'submitted', 'under_review', 'closed', 'cancelled'
);

create type public.risk_level as enum ('low', 'medium', 'high', 'critical');

create type public.inspection_item_response as enum ('ok', 'not_ok', 'na');

create type public.observation_status as enum (
  'open', 'action_required', 'in_progress', 'resolved', 'verified', 'closed'
);

create type public.incident_severity as enum ('minor', 'moderate', 'serious', 'fatal');

create type public.incident_status as enum (
  'reported', 'investigating', 'action_pending', 'closed'
);

create type public.corrective_action_status as enum (
  'open', 'assigned', 'in_progress', 'submitted', 'verified', 'closed', 'overdue', 'rejected'
);

create type public.corrective_action_priority as enum ('low', 'medium', 'high', 'critical');

create type public.evidence_type as enum ('photo', 'video', 'document', 'voice_note');

create type public.compliance_status as enum (
  'compliant', 'at_risk', 'non_compliant', 'pending_review'
);

create type public.equipment_status as enum (
  'operational', 'maintenance', 'breakdown', 'decommissioned'
);

create type public.maintenance_type as enum ('preventive', 'corrective', 'breakdown', 'inspection');

create type public.attendance_status as enum ('present', 'absent', 'leave', 'half_day');

create type public.grievance_status as enum (
  'open', 'acknowledged', 'investigating', 'resolved', 'closed'
);

create type public.notification_status as enum ('unread', 'read', 'archived');

create type public.notification_priority as enum ('info', 'warning', 'high', 'critical');

create type public.ai_analysis_type as enum (
  'risk_classification', 'recommendation', 'compliance_analysis', 'ocr', 'copilot'
);

create type public.ai_analysis_status as enum ('pending', 'completed', 'failed');

create type public.sync_status as enum ('synced', 'pending', 'conflict');

-- ----------------------------------------------------------------------------
-- 2. Organisation hierarchy
--    corporate -> subsidiary -> region -> mine -> department
-- ----------------------------------------------------------------------------
create table public.subsidiaries (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  code         text not null unique,
  hq_location  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.regions (
  id             uuid primary key default gen_random_uuid(),
  subsidiary_id  uuid not null references public.subsidiaries(id) on delete cascade,
  name           text not null,
  code           text not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (subsidiary_id, code)
);
create index idx_regions_subsidiary on public.regions(subsidiary_id);

create table public.mines (
  id          uuid primary key default gen_random_uuid(),
  region_id   uuid not null references public.regions(id) on delete cascade,
  name        text not null,
  code        text not null,
  mine_type   public.mine_type not null default 'opencast',
  latitude    double precision,
  longitude   double precision,
  boundary    jsonb,                       -- GeoJSON polygon, refined in the GIS phase
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (region_id, code)
);
create index idx_mines_region on public.mines(region_id);

create table public.departments (
  id          uuid primary key default gen_random_uuid(),
  mine_id     uuid not null references public.mines(id) on delete cascade,
  name        text not null,
  dept_type   public.department_type not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (mine_id, dept_type)
);
create index idx_departments_mine on public.departments(mine_id);

-- ----------------------------------------------------------------------------
-- 3. Identity & RBAC
-- ----------------------------------------------------------------------------
-- One row per Supabase Auth user. id == auth.users.id.
create table public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  full_name      text not null default '',
  email          text not null default '',
  phone          text,
  employee_code  text,
  avatar_url     text,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- A user may hold several roles, each attached to one node of the org tree.
create table public.role_assignments (
  id             uuid primary key default gen_random_uuid(),
  profile_id     uuid not null references public.profiles(id) on delete cascade,
  role           public.user_role not null,
  scope_level    public.org_scope_level not null,
  subsidiary_id  uuid references public.subsidiaries(id) on delete cascade,
  region_id      uuid references public.regions(id) on delete cascade,
  mine_id        uuid references public.mines(id) on delete cascade,
  department_id  uuid references public.departments(id) on delete cascade,
  is_primary     boolean not null default false,
  assigned_by    uuid references public.profiles(id) on delete set null,
  valid_from     timestamptz not null default now(),
  valid_to       timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- the scope pointer column must match the declared scope_level
  constraint role_scope_consistent check (
    (scope_level = 'corporate'  and subsidiary_id is null and region_id is null and mine_id is null and department_id is null)
    or (scope_level = 'subsidiary' and subsidiary_id is not null and region_id is null and mine_id is null and department_id is null)
    or (scope_level = 'region'     and region_id is not null and mine_id is null and department_id is null)
    or (scope_level = 'mine'       and mine_id is not null and department_id is null)
    or (scope_level = 'department' and mine_id is not null and department_id is not null)
  )
);
create index idx_role_assignments_profile on public.role_assignments(profile_id);
create index idx_role_assignments_role on public.role_assignments(role);
create index idx_role_assignments_mine on public.role_assignments(mine_id);
create index idx_role_assignments_subsidiary on public.role_assignments(subsidiary_id);
create index idx_role_assignments_region on public.role_assignments(region_id);

-- Auto-create a profile row whenever an auth user is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 4. Field operations
-- ----------------------------------------------------------------------------
create table public.inspection_templates (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,
  description          text,
  applies_to_dept_type public.department_type,
  version              integer not null default 1,
  is_active            boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (name, version)
);

create table public.inspection_checklist_items (
  id            uuid primary key default gen_random_uuid(),
  template_id   uuid not null references public.inspection_templates(id) on delete cascade,
  section       text not null default 'General',
  prompt        text not null,
  guidance      text,
  sort_order    integer not null default 0,
  is_mandatory  boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (template_id, sort_order)
);
create index idx_checklist_items_template on public.inspection_checklist_items(template_id);

create table public.inspections (
  id                  uuid primary key default gen_random_uuid(),
  mine_id             uuid not null references public.mines(id) on delete cascade,
  department_id       uuid references public.departments(id) on delete set null,
  template_id         uuid references public.inspection_templates(id) on delete set null,
  title               text not null,
  inspection_type     text not null default 'safety_round',
  status              public.inspection_status not null default 'planned',
  scheduled_for       timestamptz,
  started_at          timestamptz,
  submitted_at        timestamptz,
  closed_at           timestamptz,
  inspector_id        uuid not null references public.profiles(id) on delete restrict,
  summary             text,
  overall_risk        public.risk_level,
  gps_latitude        double precision,
  gps_longitude       double precision,
  location_accuracy_m double precision,
  client_ref          uuid unique,
  sync_status         public.sync_status not null default 'synced',
  created_by          uuid not null references public.profiles(id) on delete restrict,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index idx_inspections_mine on public.inspections(mine_id);
create index idx_inspections_inspector on public.inspections(inspector_id);
create index idx_inspections_status on public.inspections(status);
create index idx_inspections_scheduled_for on public.inspections(scheduled_for);

create table public.inspection_items (
  id                 uuid primary key default gen_random_uuid(),
  inspection_id      uuid not null references public.inspections(id) on delete cascade,
  checklist_item_id  uuid references public.inspection_checklist_items(id) on delete set null,
  section            text not null default 'General',
  prompt             text not null,
  response           public.inspection_item_response,
  notes              text,
  risk               public.risk_level,
  sort_order         integer not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index idx_inspection_items_inspection on public.inspection_items(inspection_id);

create table public.observations (
  id                  uuid primary key default gen_random_uuid(),
  inspection_id       uuid references public.inspections(id) on delete set null,
  inspection_item_id  uuid references public.inspection_items(id) on delete set null,
  mine_id             uuid not null references public.mines(id) on delete cascade,
  department_id       uuid references public.departments(id) on delete set null,
  raised_by           uuid not null references public.profiles(id) on delete restrict,
  title               text not null,
  description         text,
  category            text,
  risk                public.risk_level not null default 'medium',
  status              public.observation_status not null default 'open',
  gps_latitude        double precision,
  gps_longitude       double precision,
  occurred_at         timestamptz,
  ai_analysis_id      uuid,
  client_ref          uuid unique,
  sync_status         public.sync_status not null default 'synced',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index idx_observations_mine on public.observations(mine_id);
create index idx_observations_inspection on public.observations(inspection_id);
create index idx_observations_status on public.observations(status);
create index idx_observations_risk on public.observations(risk);

create table public.incidents (
  id                uuid primary key default gen_random_uuid(),
  mine_id           uuid not null references public.mines(id) on delete cascade,
  department_id     uuid references public.departments(id) on delete set null,
  reported_by       uuid not null references public.profiles(id) on delete restrict,
  title             text not null,
  description       text,
  severity          public.incident_severity not null default 'minor',
  status            public.incident_status not null default 'reported',
  occurred_at       timestamptz not null default now(),
  reported_at       timestamptz not null default now(),
  gps_latitude      double precision,
  gps_longitude     double precision,
  people_affected   integer not null default 0,
  immediate_action  text,
  root_cause        text,
  ai_analysis_id    uuid,
  client_ref        uuid unique,
  sync_status       public.sync_status not null default 'synced',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index idx_incidents_mine on public.incidents(mine_id);
create index idx_incidents_status on public.incidents(status);
create index idx_incidents_severity on public.incidents(severity);

create table public.corrective_actions (
  id               uuid primary key default gen_random_uuid(),
  observation_id   uuid references public.observations(id) on delete cascade,
  incident_id      uuid references public.incidents(id) on delete cascade,
  inspection_id    uuid references public.inspections(id) on delete set null,
  mine_id          uuid not null references public.mines(id) on delete cascade,
  title            text not null,
  description      text,
  priority         public.corrective_action_priority not null default 'medium',
  status           public.corrective_action_status not null default 'open',
  assigned_to      uuid references public.profiles(id) on delete set null,
  assigned_by      uuid references public.profiles(id) on delete set null,
  assigned_at      timestamptz,
  due_date         date,
  submitted_at     timestamptz,
  verified_by      uuid references public.profiles(id) on delete set null,
  verified_at      timestamptz,
  closed_at        timestamptz,
  closure_notes    text,
  rejection_reason text,
  ai_analysis_id   uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index idx_corrective_actions_mine on public.corrective_actions(mine_id);
create index idx_corrective_actions_observation on public.corrective_actions(observation_id);
create index idx_corrective_actions_incident on public.corrective_actions(incident_id);
create index idx_corrective_actions_assigned_to on public.corrective_actions(assigned_to);
create index idx_corrective_actions_status on public.corrective_actions(status);
create index idx_corrective_actions_due_date on public.corrective_actions(due_date);

-- ----------------------------------------------------------------------------
-- 5. Evidence  (photos / video / documents / voice notes)
-- ----------------------------------------------------------------------------
create table public.evidence (
  id                   uuid primary key default gen_random_uuid(),
  evidence_type        public.evidence_type not null default 'photo',
  storage_path         text not null,               -- path inside the Supabase Storage bucket
  file_name            text,
  mime_type            text,
  file_size_bytes      bigint,
  is_simulated         boolean not null default false,  -- true => UI shows "SIMULATED FIELD EVIDENCE"
  caption              text,
  captured_at          timestamptz,
  gps_latitude         double precision,
  gps_longitude        double precision,
  location_accuracy_m  double precision,
  uploaded_by          uuid not null references public.profiles(id) on delete restrict,
  mine_id              uuid not null references public.mines(id) on delete cascade,
  inspection_id        uuid references public.inspections(id) on delete cascade,
  observation_id       uuid references public.observations(id) on delete cascade,
  incident_id          uuid references public.incidents(id) on delete cascade,
  corrective_action_id uuid references public.corrective_actions(id) on delete cascade,
  client_ref           uuid unique,
  sync_status          public.sync_status not null default 'synced',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  -- evidence must hang off at least one parent record
  constraint evidence_has_parent check (
    inspection_id is not null
    or observation_id is not null
    or incident_id is not null
    or corrective_action_id is not null
  )
);
create index idx_evidence_mine on public.evidence(mine_id);
create index idx_evidence_inspection on public.evidence(inspection_id);
create index idx_evidence_observation on public.evidence(observation_id);
create index idx_evidence_incident on public.evidence(incident_id);
create index idx_evidence_corrective_action on public.evidence(corrective_action_id);

-- ----------------------------------------------------------------------------
-- 6. Compliance
-- ----------------------------------------------------------------------------
create table public.compliance_requirements (
  id                   uuid primary key default gen_random_uuid(),
  code                 text not null unique,
  title                text not null,
  description          text,
  authority            text not null default 'DGMS',
  category             text,
  frequency            text,
  applies_to_mine_type public.mine_type,
  reference_url        text,
  is_active            boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table public.compliance_records (
  id              uuid primary key default gen_random_uuid(),
  requirement_id  uuid not null references public.compliance_requirements(id) on delete cascade,
  mine_id         uuid not null references public.mines(id) on delete cascade,
  status          public.compliance_status not null default 'pending_review',
  period_start    date,
  period_end      date,
  due_date        date,
  submitted_at    timestamptz,
  reviewed_by     uuid references public.profiles(id) on delete set null,
  reviewed_at     timestamptz,
  notes           text,
  ai_analysis_id  uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (requirement_id, mine_id, period_start)
);
create index idx_compliance_records_mine on public.compliance_records(mine_id);
create index idx_compliance_records_requirement on public.compliance_records(requirement_id);
create index idx_compliance_records_status on public.compliance_records(status);
create index idx_compliance_records_due_date on public.compliance_records(due_date);

create table public.compliance_documents (
  id                    uuid primary key default gen_random_uuid(),
  compliance_record_id  uuid references public.compliance_records(id) on delete cascade,
  requirement_id        uuid references public.compliance_requirements(id) on delete set null,
  mine_id               uuid not null references public.mines(id) on delete cascade,
  title                 text not null,
  storage_path          text not null,
  mime_type             text,
  file_size_bytes       bigint,
  doc_date              date,
  uploaded_by           uuid not null references public.profiles(id) on delete restrict,
  ocr_text              text,
  ai_analysis_id        uuid,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index idx_compliance_documents_record on public.compliance_documents(compliance_record_id);
create index idx_compliance_documents_mine on public.compliance_documents(mine_id);

-- ----------------------------------------------------------------------------
-- 7. Operations
-- ----------------------------------------------------------------------------
create table public.environmental_readings (
  id            uuid primary key default gen_random_uuid(),
  mine_id       uuid not null references public.mines(id) on delete cascade,
  department_id uuid references public.departments(id) on delete set null,
  parameter     text not null,             -- PM2.5 / PM10 / noise_db / water_ph / SO2 / NOx
  value         numeric not null,
  unit          text not null,
  station_name  text,
  gps_latitude  double precision,
  gps_longitude double precision,
  recorded_at   timestamptz not null default now(),
  recorded_by   uuid references public.profiles(id) on delete set null,
  source        text not null default 'manual',   -- manual | sensor
  is_breach     boolean not null default false,
  threshold     numeric,
  created_at    timestamptz not null default now()
);
create index idx_env_readings_mine on public.environmental_readings(mine_id);
create index idx_env_readings_parameter on public.environmental_readings(parameter);
create index idx_env_readings_recorded_at on public.environmental_readings(recorded_at);

create table public.equipment (
  id               uuid primary key default gen_random_uuid(),
  mine_id          uuid not null references public.mines(id) on delete cascade,
  department_id    uuid references public.departments(id) on delete set null,
  asset_code       text not null unique,
  name             text not null,
  category         text,                    -- HEMM | pump | conveyor | vehicle ...
  manufacturer     text,
  model            text,
  commissioned_on  date,
  status           public.equipment_status not null default 'operational',
  last_service_on  date,
  next_service_due date,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index idx_equipment_mine on public.equipment(mine_id);
create index idx_equipment_status on public.equipment(status);

create table public.contractors (
  id              uuid primary key default gen_random_uuid(),
  subsidiary_id   uuid references public.subsidiaries(id) on delete set null,
  mine_id         uuid not null references public.mines(id) on delete cascade,
  name            text not null,
  registration_no text not null unique,
  contact_person  text,
  phone           text,
  email           text,
  contract_start  date,
  contract_end    date,
  scope_of_work   text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index idx_contractors_mine on public.contractors(mine_id);

create table public.maintenance_records (
  id               uuid primary key default gen_random_uuid(),
  equipment_id     uuid not null references public.equipment(id) on delete cascade,
  mine_id          uuid not null references public.mines(id) on delete cascade,
  maintenance_type public.maintenance_type not null default 'preventive',
  description      text,
  performed_by     uuid references public.profiles(id) on delete set null,
  contractor_id    uuid references public.contractors(id) on delete set null,
  scheduled_for    date,
  performed_at     timestamptz,
  downtime_hours   numeric,
  cost             numeric,
  status           text not null default 'planned',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index idx_maintenance_records_equipment on public.maintenance_records(equipment_id);
create index idx_maintenance_records_mine on public.maintenance_records(mine_id);

-- ----------------------------------------------------------------------------
-- 8. People
-- ----------------------------------------------------------------------------
create table public.workers (
  id              uuid primary key default gen_random_uuid(),
  mine_id         uuid not null references public.mines(id) on delete cascade,
  department_id   uuid references public.departments(id) on delete set null,
  employee_code   text not null unique,
  full_name       text not null,
  designation     text,
  date_of_joining date,
  skill_category  text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index idx_workers_mine on public.workers(mine_id);

create table public.contractor_workers (
  id                  uuid primary key default gen_random_uuid(),
  contractor_id       uuid not null references public.contractors(id) on delete cascade,
  mine_id             uuid not null references public.mines(id) on delete cascade,
  full_name           text not null,
  id_proof_type       text,
  id_proof_number     text,
  designation         text,
  induction_done      boolean not null default false,
  induction_date      date,
  medical_valid_until date,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index idx_contractor_workers_contractor on public.contractor_workers(contractor_id);
create index idx_contractor_workers_mine on public.contractor_workers(mine_id);

create table public.attendance (
  id                    uuid primary key default gen_random_uuid(),
  mine_id               uuid not null references public.mines(id) on delete cascade,
  department_id         uuid references public.departments(id) on delete set null,
  worker_id             uuid references public.workers(id) on delete cascade,
  contractor_worker_id  uuid references public.contractor_workers(id) on delete cascade,
  profile_id            uuid references public.profiles(id) on delete cascade,
  work_date             date not null default current_date,
  status                public.attendance_status not null default 'present',
  shift                 text,
  check_in_at           timestamptz,
  check_out_at          timestamptz,
  hours_worked          numeric,
  recorded_by           uuid references public.profiles(id) on delete set null,
  created_at            timestamptz not null default now(),
  constraint attendance_one_subject check (
    (worker_id is not null)::int
    + (contractor_worker_id is not null)::int
    + (profile_id is not null)::int = 1
  )
);
create index idx_attendance_mine on public.attendance(mine_id);
create index idx_attendance_work_date on public.attendance(work_date);

create table public.grievances (
  id                              uuid primary key default gen_random_uuid(),
  mine_id                         uuid not null references public.mines(id) on delete cascade,
  department_id                   uuid references public.departments(id) on delete set null,
  raised_by_profile_id            uuid references public.profiles(id) on delete set null,
  raised_by_worker_id             uuid references public.workers(id) on delete set null,
  raised_by_contractor_worker_id  uuid references public.contractor_workers(id) on delete set null,
  is_anonymous                    boolean not null default false,
  category                        text,
  title                           text not null,
  description                     text,
  status                          public.grievance_status not null default 'open',
  assigned_to                     uuid references public.profiles(id) on delete set null,
  resolution_notes                text,
  resolved_at                     timestamptz,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now()
);
create index idx_grievances_mine on public.grievances(mine_id);
create index idx_grievances_status on public.grievances(status);

-- ----------------------------------------------------------------------------
-- 9. Platform
-- ----------------------------------------------------------------------------
create table public.notifications (
  id             uuid primary key default gen_random_uuid(),
  recipient_id   uuid not null references public.profiles(id) on delete cascade,
  title          text not null,
  body           text,
  priority       public.notification_priority not null default 'info',
  status         public.notification_status not null default 'unread',
  category       text,
  resource_type  text,
  resource_id    uuid,
  action_url     text,
  read_at        timestamptz,
  created_at     timestamptz not null default now()
);
create index idx_notifications_recipient on public.notifications(recipient_id);
create index idx_notifications_status on public.notifications(status);

create table public.audit_logs (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid references public.profiles(id) on delete set null,
  action       text not null,
  entity_type  text not null,
  entity_id    uuid,
  mine_id      uuid references public.mines(id) on delete set null,
  before       jsonb,
  after        jsonb,
  ip_address   inet,
  user_agent   text,
  created_at   timestamptz not null default now()
);
create index idx_audit_logs_entity on public.audit_logs(entity_type, entity_id);
create index idx_audit_logs_actor on public.audit_logs(actor_id);
create index idx_audit_logs_mine on public.audit_logs(mine_id);
create index idx_audit_logs_created_at on public.audit_logs(created_at);

create table public.ai_analyses (
  id               uuid primary key default gen_random_uuid(),
  analysis_type    public.ai_analysis_type not null,
  status           public.ai_analysis_status not null default 'pending',
  provider         text,
  model            text,
  input            jsonb,
  output           jsonb,
  risk             public.risk_level,
  confidence       numeric,
  summary          text,
  recommendations  jsonb,
  tokens_used      integer,
  error            text,
  entity_type      text,
  entity_id        uuid,
  requested_by     uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  completed_at     timestamptz
);
create index idx_ai_analyses_entity on public.ai_analyses(entity_type, entity_id);
create index idx_ai_analyses_type on public.ai_analyses(analysis_type);

-- Deferred FKs from operational tables to ai_analyses (created after the table).
alter table public.observations
  add constraint observations_ai_analysis_fk
  foreign key (ai_analysis_id) references public.ai_analyses(id) on delete set null;
alter table public.incidents
  add constraint incidents_ai_analysis_fk
  foreign key (ai_analysis_id) references public.ai_analyses(id) on delete set null;
alter table public.corrective_actions
  add constraint corrective_actions_ai_analysis_fk
  foreign key (ai_analysis_id) references public.ai_analyses(id) on delete set null;
alter table public.compliance_records
  add constraint compliance_records_ai_analysis_fk
  foreign key (ai_analysis_id) references public.ai_analyses(id) on delete set null;
alter table public.compliance_documents
  add constraint compliance_documents_ai_analysis_fk
  foreign key (ai_analysis_id) references public.ai_analyses(id) on delete set null;

-- ----------------------------------------------------------------------------
-- 10. updated_at triggers for every mutable table
-- ----------------------------------------------------------------------------
do $$
declare
  t text;
  mutable_tables text[] := array[
    'subsidiaries','regions','mines','departments',
    'profiles','role_assignments',
    'inspection_templates','inspections','inspection_items',
    'observations','incidents','corrective_actions','evidence',
    'compliance_requirements','compliance_records','compliance_documents',
    'equipment','contractors','maintenance_records',
    'workers','contractor_workers','grievances'
  ];
begin
  foreach t in array mutable_tables loop
    execute format(
      'create trigger set_updated_at before update on public.%I
       for each row execute function public.set_updated_at()', t
    );
  end loop;
end;
$$;
