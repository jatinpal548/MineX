/**
 * Domain types for the field inspection workflow.
 *
 * These are the shapes the workflow screens work with. They map closely to the
 * Supabase tables (`inspections`, `inspection_items`, `observations`,
 * `corrective_actions`, `ai_analyses`) but stay UI-friendly.
 */
import type {
  CorrectiveActionPriority,
  InspectionItemResponse,
  InspectionStatus,
  RiskLevel,
} from '@coalguard/types';

export type ChecklistResponse = InspectionItemResponse; // 'ok' | 'not_ok' | 'na'

export interface TemplateSummary {
  id: string;
  name: string;
  description: string | null;
  /** derived from applies_to_dept_type */
  category: string;
  itemCount: number;
}

export interface DraftChecklistItem {
  /** stable id - also the future inspection_items.id (generated client-side) */
  id: string;
  checklistItemId: string | null;
  section: string;
  prompt: string;
  guidance: string | null;
  isMandatory: boolean;
  sortOrder: number;
  response: ChecklistResponse | null;
  notes: string;
  /** id of the observation raised for this item, if any */
  observationId: string | null;
}

export interface DraftObservation {
  id: string;
  inspectionItemId: string | null;
  checklistItemId: string | null;
  title: string;
  description: string;
  category: string | null;
  risk: RiskLevel;
  aiAnalysisId: string | null;
  aiRationale: string | null;
  aiRecommendations: string[];
  aiSimulated: boolean;
  aiSource: 'server' | 'on-device' | null;
  correctiveActionId: string | null;
  correctiveActionPriority: CorrectiveActionPriority | null;
  /** number of evidence photos attached */
  evidenceCount: number;
  /** number of voice notes attached (local + synced) */
  voiceCount?: number;
  /** true when GPS coordinates were captured for this observation */
  hasLocation: boolean;
}

export interface InspectionDraft {
  id: string;
  title: string;
  status: InspectionStatus;
  templateId: string | null;
  templateName: string;
  mineId: string;
  inspectorId: string;
  startedAt: string | null;
  submittedAt: string | null;
  overallRisk: RiskLevel | null;
  items: DraftChecklistItem[];
  observations: DraftObservation[];
}

export interface ChecklistProgress {
  total: number;
  answered: number;
  passed: number;
  failed: number;
  na: number;
  mandatoryRemaining: number;
}

export function computeProgress(items: DraftChecklistItem[]): ChecklistProgress {
  let answered = 0;
  let passed = 0;
  let failed = 0;
  let na = 0;
  let mandatoryRemaining = 0;
  for (const it of items) {
    if (it.response) answered += 1;
    if (it.response === 'ok') passed += 1;
    else if (it.response === 'not_ok') failed += 1;
    else if (it.response === 'na') na += 1;
    if (it.isMandatory && !it.response) mandatoryRemaining += 1;
  }
  return { total: items.length, answered, passed, failed, na, mandatoryRemaining };
}

const RISK_ORDER: RiskLevel[] = ['low', 'medium', 'high', 'critical'];

export function highestRisk(risks: RiskLevel[]): RiskLevel | null {
  if (risks.length === 0) return null;
  return risks.reduce((a, b) => (RISK_ORDER.indexOf(b) > RISK_ORDER.indexOf(a) ? b : a));
}

export function isHighOrCritical(risk: RiskLevel): boolean {
  return risk === 'high' || risk === 'critical';
}
