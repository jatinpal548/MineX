/**
 * Display metadata for the database enums used by the Command Center.
 *
 * Values MUST match the PostgreSQL enums in supabase/migrations/0001_init.sql
 * (mirrored in @coalguard/types). Nothing here invents a status.
 */
import type {
  CorrectiveActionStatus,
  InspectionStatus,
  ObservationStatus,
  RiskLevel,
} from '@coalguard/types';
import {
  CORRECTIVE_ACTION_STATUSES,
  INSPECTION_STATUSES,
  OBSERVATION_STATUSES,
  RISK_LEVELS,
} from '@coalguard/types';

export type Tone = 'neutral' | 'safe' | 'warning' | 'high-risk' | 'critical' | 'info';

/* ------------------------------- risk ---------------------------------- */

export const RISK_META: Record<RiskLevel, { label: string; tone: Tone; rank: number }> = {
  low: { label: 'Low', tone: 'safe', rank: 1 },
  medium: { label: 'Medium', tone: 'warning', rank: 2 },
  high: { label: 'High', tone: 'high-risk', rank: 3 },
  critical: { label: 'Critical', tone: 'critical', rank: 4 },
};

export const RISK_ORDER = RISK_LEVELS;

/** Highest risk first. */
export function compareRiskDesc(a: RiskLevel, b: RiskLevel): number {
  return RISK_META[b].rank - RISK_META[a].rank;
}

/* --------------------------- inspection ------------------------------- */

export const INSPECTION_STATUS_META: Record<InspectionStatus, { label: string; tone: Tone }> = {
  planned: { label: 'Planned', tone: 'neutral' },
  in_progress: { label: 'In progress', tone: 'info' },
  submitted: { label: 'Submitted', tone: 'warning' },
  under_review: { label: 'Under review', tone: 'warning' },
  closed: { label: 'Closed', tone: 'safe' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

export const INSPECTION_STATUS_ORDER = INSPECTION_STATUSES;

/* --------------------------- observation ----------------------------- */

export const OBSERVATION_STATUS_META: Record<ObservationStatus, { label: string; tone: Tone }> = {
  open: { label: 'Open', tone: 'high-risk' },
  action_required: { label: 'Action required', tone: 'critical' },
  in_progress: { label: 'In progress', tone: 'info' },
  resolved: { label: 'Resolved', tone: 'safe' },
  verified: { label: 'Verified', tone: 'safe' },
  closed: { label: 'Closed', tone: 'neutral' },
};

export const OBSERVATION_STATUS_ORDER = OBSERVATION_STATUSES;

/** Observation statuses that still need attention from a manager. */
export const OBSERVATION_OPEN_STATUSES: ObservationStatus[] = [
  'open',
  'action_required',
  'in_progress',
];

/* ------------------------ corrective action -------------------------- */

export const CA_STATUS_META: Record<CorrectiveActionStatus, { label: string; tone: Tone }> = {
  open: { label: 'Open', tone: 'high-risk' },
  assigned: { label: 'Assigned', tone: 'info' },
  in_progress: { label: 'In progress', tone: 'info' },
  submitted: { label: 'Submitted', tone: 'warning' },
  verified: { label: 'Verified', tone: 'safe' },
  closed: { label: 'Closed', tone: 'neutral' },
  overdue: { label: 'Overdue', tone: 'critical' },
  rejected: { label: 'Rejected', tone: 'critical' },
};

export const CA_STATUS_ORDER = CORRECTIVE_ACTION_STATUSES;

/** Corrective actions still requiring work. */
export const CA_PENDING_STATUSES: CorrectiveActionStatus[] = [
  'open',
  'assigned',
  'in_progress',
  'submitted',
  'overdue',
  'rejected',
];
