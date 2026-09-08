/**
 * CoalGuard shared enums.
 *
 * These string values MUST stay identical to the PostgreSQL enum types created
 * in `supabase/migrations/0001_init.sql`. They are the single source of truth
 * shared by the mobile app, the web app and the backend.
 *
 * Pattern used everywhere in this file:
 *   1. declare a `const` tuple of the allowed values (usable at runtime)
 *   2. derive a union type from it (usable at compile time)
 */

/* -------------------------------------------------------------------------- */
/* Identity & access                                                          */
/* -------------------------------------------------------------------------- */

export const USER_ROLES = [
  'FIELD_INSPECTOR',
  'SAFETY_OFFICER',
  'ENVIRONMENTAL_OFFICER',
  'MAINTENANCE_OFFICER',
  'HR_OFFICER',
  'CONTRACTOR',
  'WORKER',
  'COMPLIANCE_OFFICER',
  'MINE_MANAGER',
  'INTERNAL_AUDITOR',
  'REGIONAL_GM',
  'SUBSIDIARY_HQ',
  'CORPORATE_HQ',
  'REGULATOR',
  'SYSTEM_ADMIN',
] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** Levels of the Corporate -> Subsidiary -> Region -> Mine -> Department tree. */
export const ORG_SCOPE_LEVELS = [
  'corporate',
  'subsidiary',
  'region',
  'mine',
  'department',
] as const;
export type OrgScopeLevel = (typeof ORG_SCOPE_LEVELS)[number];

/* -------------------------------------------------------------------------- */
/* Organisation                                                               */
/* -------------------------------------------------------------------------- */

export const MINE_TYPES = ['opencast', 'underground', 'mixed'] as const;
export type MineType = (typeof MINE_TYPES)[number];

export const DEPARTMENT_TYPES = [
  'safety',
  'environment',
  'maintenance',
  'hr',
  'operations',
  'compliance',
] as const;
export type DepartmentType = (typeof DEPARTMENT_TYPES)[number];

/* -------------------------------------------------------------------------- */
/* Field operations                                                           */
/* -------------------------------------------------------------------------- */

export const INSPECTION_STATUSES = [
  'planned',
  'in_progress',
  'submitted',
  'under_review',
  'closed',
  'cancelled',
] as const;
export type InspectionStatus = (typeof INSPECTION_STATUSES)[number];

/** Risk band. Maps to the design-system status colours (green/amber/orange/red). */
export const RISK_LEVELS = ['low', 'medium', 'high', 'critical'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const INSPECTION_ITEM_RESPONSES = ['ok', 'not_ok', 'na'] as const;
export type InspectionItemResponse = (typeof INSPECTION_ITEM_RESPONSES)[number];

export const OBSERVATION_STATUSES = [
  'open',
  'action_required',
  'in_progress',
  'resolved',
  'verified',
  'closed',
] as const;
export type ObservationStatus = (typeof OBSERVATION_STATUSES)[number];

export const INCIDENT_SEVERITIES = ['minor', 'moderate', 'serious', 'fatal'] as const;
export type IncidentSeverity = (typeof INCIDENT_SEVERITIES)[number];

export const INCIDENT_STATUSES = ['reported', 'investigating', 'action_pending', 'closed'] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export const CORRECTIVE_ACTION_STATUSES = [
  'open',
  'assigned',
  'in_progress',
  'submitted',
  'verified',
  'closed',
  'overdue',
  'rejected',
] as const;
export type CorrectiveActionStatus = (typeof CORRECTIVE_ACTION_STATUSES)[number];

export const CORRECTIVE_ACTION_PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;
export type CorrectiveActionPriority = (typeof CORRECTIVE_ACTION_PRIORITIES)[number];

export const EVIDENCE_TYPES = ['photo', 'video', 'document', 'voice_note'] as const;
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];

/* -------------------------------------------------------------------------- */
/* Compliance & operations                                                    */
/* -------------------------------------------------------------------------- */

export const COMPLIANCE_STATUSES = [
  'compliant',
  'at_risk',
  'non_compliant',
  'pending_review',
] as const;
export type ComplianceStatus = (typeof COMPLIANCE_STATUSES)[number];

export const EQUIPMENT_STATUSES = [
  'operational',
  'maintenance',
  'breakdown',
  'decommissioned',
] as const;
export type EquipmentStatus = (typeof EQUIPMENT_STATUSES)[number];

export const MAINTENANCE_TYPES = ['preventive', 'corrective', 'breakdown', 'inspection'] as const;
export type MaintenanceType = (typeof MAINTENANCE_TYPES)[number];

export const ATTENDANCE_STATUSES = ['present', 'absent', 'leave', 'half_day'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const GRIEVANCE_STATUSES = [
  'open',
  'acknowledged',
  'investigating',
  'resolved',
  'closed',
] as const;
export type GrievanceStatus = (typeof GRIEVANCE_STATUSES)[number];

/* -------------------------------------------------------------------------- */
/* Platform                                                                   */
/* -------------------------------------------------------------------------- */

export const NOTIFICATION_STATUSES = ['unread', 'read', 'archived'] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

export const NOTIFICATION_PRIORITIES = ['info', 'warning', 'high', 'critical'] as const;
export type NotificationPriority = (typeof NOTIFICATION_PRIORITIES)[number];

export const AI_ANALYSIS_TYPES = [
  'risk_classification',
  'recommendation',
  'compliance_analysis',
  'ocr',
  'copilot',
] as const;
export type AiAnalysisType = (typeof AI_ANALYSIS_TYPES)[number];

export const AI_ANALYSIS_STATUSES = ['pending', 'completed', 'failed'] as const;
export type AiAnalysisStatus = (typeof AI_ANALYSIS_STATUSES)[number];

/**
 * Offline-first sync marker carried by rows that can be created on-device
 * before they reach the server.
 */
export const SYNC_STATUSES = ['synced', 'pending', 'conflict'] as const;
export type SyncStatus = (typeof SYNC_STATUSES)[number];
