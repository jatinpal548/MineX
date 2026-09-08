/**
 * Incident capture types. The `incidents` table already covers everything we
 * need (title, description, severity, status, gps, occurred_at, reported_at,
 * ai_analysis_id, client_ref, sync_status) so there is NO new table.
 *
 * Two UI-only mappings live here:
 *  - UI severity (Critical/High/Medium/Low) <-> DB `incident_severity`
 *    (fatal/serious/moderate/minor)
 *  - incident "type" (Safety/Electrical/...) is carried as a `Type: X` prefix
 *    line in `description` (the schema has no type column and we must not add a
 *    table). `parseIncidentDescription` splits it back out.
 */
import type { IncidentSeverity, IncidentStatus } from '@coalguard/types';

export const INCIDENT_TYPES = [
  'safety',
  'environmental',
  'equipment',
  'electrical',
  'labour',
  'other',
] as const;
export type IncidentType = (typeof INCIDENT_TYPES)[number];

export const INCIDENT_TYPE_LABEL: Record<IncidentType, string> = {
  safety: 'Safety',
  environmental: 'Environmental',
  equipment: 'Equipment',
  electrical: 'Electrical',
  labour: 'Labour',
  other: 'Other',
};

export type UiSeverity = 'critical' | 'high' | 'medium' | 'low';

export const UI_TO_DB_SEVERITY: Record<UiSeverity, IncidentSeverity> = {
  critical: 'fatal',
  high: 'serious',
  medium: 'moderate',
  low: 'minor',
};
export const DB_TO_UI_SEVERITY: Record<IncidentSeverity, UiSeverity> = {
  fatal: 'critical',
  serious: 'high',
  moderate: 'medium',
  minor: 'low',
};

export const INCIDENT_STATUS_LABEL: Record<IncidentStatus, string> = {
  reported: 'Open',
  investigating: 'Under Review',
  action_pending: 'Action Pending',
  closed: 'Closed',
};

export function encodeIncidentDescription(type: IncidentType, description: string): string {
  const body = description.trim();
  return `Type: ${INCIDENT_TYPE_LABEL[type]}${body ? `\n\n${body}` : ''}`;
}

export function parseIncidentDescription(raw: string | null): {
  type: IncidentType;
  description: string;
} {
  const text = raw ?? '';
  const m = text.match(/^Type:\s*(.+?)\s*(?:\n\n([\s\S]*))?$/);
  if (m) {
    const label = m[1]!.trim().toLowerCase();
    const type =
      (INCIDENT_TYPES.find((t) => INCIDENT_TYPE_LABEL[t].toLowerCase() === label) as IncidentType) ??
      'other';
    return { type, description: (m[2] ?? '').trim() };
  }
  return { type: 'other', description: text.trim() };
}

export interface IncidentDraft {
  id: string;
  clientRef: string;
  title: string;
  type: IncidentType;
  severity: UiSeverity;
  description: string;
  mineId: string;
  reportedBy: string;
  occurredAt: string;
  gpsLatitude: number | null;
  gpsLongitude: number | null;
  locationAccuracy: number | null;
  status: IncidentStatus;
  createdAt: string;
  aiRisk: UiSeverity | null;
  aiConsequence: string | null;
  aiRecommendedAction: string | null;
  aiSimulated: boolean;
}

export interface IncidentListRow {
  id: string;
  title: string;
  type: IncidentType;
  severity: UiSeverity;
  status: IncidentStatus;
  occurredAt: string;
  mineName: string | null;
  hasLocation: boolean;
  evidenceCount: number;
  syncState?: 'queued' | 'syncing' | 'failed';
}
