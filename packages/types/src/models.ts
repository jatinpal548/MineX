/**
 * CoalGuard domain models.
 *
 * Plain TypeScript shapes for the main database rows. They are hand-written for
 * Phase 0 so the apps have something to code against. In a later phase we will
 * additionally generate a fully-typed `Database` definition straight from the
 * live schema with:
 *
 *     npx supabase gen types typescript --linked > packages/types/src/database.generated.ts
 *
 * Keep these interfaces aligned with `supabase/migrations/0001_init.sql`.
 */

import type {
  AiAnalysisStatus,
  AiAnalysisType,
  AttendanceStatus,
  ComplianceStatus,
  CorrectiveActionPriority,
  CorrectiveActionStatus,
  DepartmentType,
  EquipmentStatus,
  EvidenceType,
  GrievanceStatus,
  IncidentSeverity,
  IncidentStatus,
  InspectionItemResponse,
  InspectionStatus,
  MaintenanceType,
  MineType,
  NotificationPriority,
  NotificationStatus,
  ObservationStatus,
  OrgScopeLevel,
  RiskLevel,
  SyncStatus,
  UserRole,
} from './enums';

/** Every table has these. */
export interface BaseRow {
  id: string;
  created_at: string;
  updated_at: string;
}

export interface GeoPoint {
  latitude: number | null;
  longitude: number | null;
}

/* ------------------------------ organisation ------------------------------- */

export interface Subsidiary extends BaseRow {
  name: string;
  code: string;
  hq_location: string | null;
}

export interface Region extends BaseRow {
  subsidiary_id: string;
  name: string;
  code: string;
}

export interface Mine extends BaseRow {
  region_id: string;
  name: string;
  code: string;
  mine_type: MineType;
  latitude: number | null;
  longitude: number | null;
  boundary: unknown | null; // GeoJSON polygon, refined in the GIS phase
  is_active: boolean;
}

export interface Department extends BaseRow {
  mine_id: string;
  name: string;
  dept_type: DepartmentType;
}

/* -------------------------------- identity -------------------------------- */

export interface Profile extends BaseRow {
  /** Same value as the Supabase Auth user id. */
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  employee_code: string | null;
  avatar_url: string | null;
  is_active: boolean;
}

export interface RoleAssignment extends BaseRow {
  profile_id: string;
  role: UserRole;
  scope_level: OrgScopeLevel;
  subsidiary_id: string | null;
  region_id: string | null;
  mine_id: string | null;
  department_id: string | null;
  is_primary: boolean;
  assigned_by: string | null;
  valid_from: string;
  valid_to: string | null;
}

/* ----------------------------- field operations -------------------------- */

export interface InspectionTemplate extends BaseRow {
  name: string;
  description: string | null;
  applies_to_dept_type: DepartmentType | null;
  version: number;
  is_active: boolean;
}

export interface InspectionChecklistItem {
  id: string;
  template_id: string;
  section: string;
  prompt: string;
  guidance: string | null;
  sort_order: number;
  is_mandatory: boolean;
  created_at: string;
}

export interface Inspection extends BaseRow {
  mine_id: string;
  department_id: string | null;
  template_id: string | null;
  title: string;
  inspection_type: string;
  status: InspectionStatus;
  scheduled_for: string | null;
  started_at: string | null;
  submitted_at: string | null;
  closed_at: string | null;
  inspector_id: string;
  summary: string | null;
  overall_risk: RiskLevel | null;
  gps_latitude: number | null;
  gps_longitude: number | null;
  location_accuracy_m: number | null;
  client_ref: string | null;
  sync_status: SyncStatus;
  created_by: string;
}

export interface InspectionItem extends BaseRow {
  inspection_id: string;
  checklist_item_id: string | null;
  section: string;
  prompt: string;
  response: InspectionItemResponse | null;
  notes: string | null;
  risk: RiskLevel | null;
  sort_order: number;
}

export interface Observation extends BaseRow {
  inspection_id: string | null;
  inspection_item_id: string | null;
  mine_id: string;
  department_id: string | null;
  raised_by: string;
  title: string;
  description: string | null;
  category: string | null;
  risk: RiskLevel;
  status: ObservationStatus;
  gps_latitude: number | null;
  gps_longitude: number | null;
  occurred_at: string | null;
  ai_analysis_id: string | null;
  client_ref: string | null;
  sync_status: SyncStatus;
}

export interface Evidence extends BaseRow {
  evidence_type: EvidenceType;
  storage_path: string;
  file_name: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  /** true => show the "SIMULATED FIELD EVIDENCE" label in the UI. */
  is_simulated: boolean;
  caption: string | null;
  captured_at: string | null;
  gps_latitude: number | null;
  gps_longitude: number | null;
  location_accuracy_m: number | null;
  uploaded_by: string;
  mine_id: string;
  inspection_id: string | null;
  observation_id: string | null;
  incident_id: string | null;
  corrective_action_id: string | null;
  client_ref: string | null;
  sync_status: SyncStatus;
}

export interface Incident extends BaseRow {
  mine_id: string;
  department_id: string | null;
  reported_by: string;
  title: string;
  description: string | null;
  severity: IncidentSeverity;
  status: IncidentStatus;
  occurred_at: string;
  reported_at: string;
  gps_latitude: number | null;
  gps_longitude: number | null;
  people_affected: number;
  immediate_action: string | null;
  root_cause: string | null;
  ai_analysis_id: string | null;
  client_ref: string | null;
  sync_status: SyncStatus;
}

export interface CorrectiveAction extends BaseRow {
  observation_id: string | null;
  incident_id: string | null;
  inspection_id: string | null;
  mine_id: string;
  title: string;
  description: string | null;
  priority: CorrectiveActionPriority;
  status: CorrectiveActionStatus;
  assigned_to: string | null;
  assigned_by: string | null;
  assigned_at: string | null;
  due_date: string | null;
  submitted_at: string | null;
  verified_by: string | null;
  verified_at: string | null;
  closed_at: string | null;
  closure_notes: string | null;
  rejection_reason: string | null;
  ai_analysis_id: string | null;
}

/* -------------------------------- compliance ----------------------------- */

export interface ComplianceRequirement extends BaseRow {
  code: string;
  title: string;
  description: string | null;
  authority: string;
  category: string | null;
  frequency: string | null;
  applies_to_mine_type: MineType | null;
  reference_url: string | null;
  is_active: boolean;
}

export interface ComplianceRecord extends BaseRow {
  requirement_id: string;
  mine_id: string;
  status: ComplianceStatus;
  period_start: string | null;
  period_end: string | null;
  due_date: string | null;
  submitted_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  notes: string | null;
  ai_analysis_id: string | null;
}

export interface ComplianceDocument extends BaseRow {
  compliance_record_id: string | null;
  requirement_id: string | null;
  mine_id: string;
  title: string;
  storage_path: string;
  mime_type: string | null;
  file_size_bytes: number | null;
  doc_date: string | null;
  uploaded_by: string;
  ocr_text: string | null;
  ai_analysis_id: string | null;
}

/* -------------------------------- operations ----------------------------- */

export interface EnvironmentalReading {
  id: string;
  mine_id: string;
  department_id: string | null;
  parameter: string;
  value: number;
  unit: string;
  station_name: string | null;
  gps_latitude: number | null;
  gps_longitude: number | null;
  recorded_at: string;
  recorded_by: string | null;
  source: string;
  is_breach: boolean;
  threshold: number | null;
  created_at: string;
}

export interface Equipment extends BaseRow {
  mine_id: string;
  department_id: string | null;
  asset_code: string;
  name: string;
  category: string | null;
  manufacturer: string | null;
  model: string | null;
  commissioned_on: string | null;
  status: EquipmentStatus;
  last_service_on: string | null;
  next_service_due: string | null;
}

export interface MaintenanceRecord extends BaseRow {
  equipment_id: string;
  mine_id: string;
  maintenance_type: MaintenanceType;
  description: string | null;
  performed_by: string | null;
  contractor_id: string | null;
  scheduled_for: string | null;
  performed_at: string | null;
  downtime_hours: number | null;
  cost: number | null;
  status: string;
}

export interface Attendance {
  id: string;
  mine_id: string;
  department_id: string | null;
  worker_id: string | null;
  contractor_worker_id: string | null;
  profile_id: string | null;
  work_date: string;
  status: AttendanceStatus;
  shift: string | null;
  check_in_at: string | null;
  check_out_at: string | null;
  hours_worked: number | null;
  recorded_by: string | null;
  created_at: string;
}

/* ---------------------------------- people ------------------------------- */

export interface Worker extends BaseRow {
  mine_id: string;
  department_id: string | null;
  employee_code: string;
  full_name: string;
  designation: string | null;
  date_of_joining: string | null;
  skill_category: string | null;
  is_active: boolean;
}

export interface Contractor extends BaseRow {
  subsidiary_id: string | null;
  mine_id: string;
  name: string;
  registration_no: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  contract_start: string | null;
  contract_end: string | null;
  scope_of_work: string | null;
  is_active: boolean;
}

export interface ContractorWorker extends BaseRow {
  contractor_id: string;
  mine_id: string;
  full_name: string;
  id_proof_type: string | null;
  id_proof_number: string | null;
  designation: string | null;
  induction_done: boolean;
  induction_date: string | null;
  medical_valid_until: string | null;
  is_active: boolean;
}

export interface Grievance extends BaseRow {
  mine_id: string;
  department_id: string | null;
  raised_by_profile_id: string | null;
  raised_by_worker_id: string | null;
  raised_by_contractor_worker_id: string | null;
  is_anonymous: boolean;
  category: string | null;
  title: string;
  description: string | null;
  status: GrievanceStatus;
  assigned_to: string | null;
  resolution_notes: string | null;
  resolved_at: string | null;
}

/* -------------------------------- platform ------------------------------- */

export interface Notification {
  id: string;
  recipient_id: string;
  title: string;
  body: string | null;
  priority: NotificationPriority;
  status: NotificationStatus;
  category: string | null;
  resource_type: string | null;
  resource_id: string | null;
  action_url: string | null;
  read_at: string | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  mine_id: string | null;
  before: unknown | null;
  after: unknown | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface AiAnalysis {
  id: string;
  analysis_type: AiAnalysisType;
  status: AiAnalysisStatus;
  provider: string | null;
  model: string | null;
  input: unknown | null;
  output: unknown | null;
  risk: RiskLevel | null;
  confidence: number | null;
  summary: string | null;
  recommendations: unknown | null;
  tokens_used: number | null;
  error: string | null;
  entity_type: string | null;
  entity_id: string | null;
  requested_by: string | null;
  created_at: string;
  completed_at: string | null;
}

/* --------------------------- composed view types ------------------------ */

/** The signed-in user plus every role/scope they hold. */
export interface CurrentUser {
  profile: Profile;
  roles: RoleAssignment[];
}
