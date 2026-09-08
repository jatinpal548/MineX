/** Observations: list + detail. RLS-scoped SSR client. */
import { analyzeObservation } from '@coalguard/ai';
import type {
  CorrectiveActionPriority,
  CorrectiveActionStatus,
  ObservationStatus,
  RiskLevel,
} from '@coalguard/types';
import { createClient } from '@/lib/supabase/server';
import { PAGE_SIZE, one, embedCount, paged, rangeFor, type Paged } from './shared';
import type { EvidenceItem } from './inspections';

export interface ObservationListRow {
  id: string;
  title: string;
  category: string | null;
  risk: RiskLevel;
  status: ObservationStatus;
  createdAt: string;
  mineName: string | null;
  mineCode: string | null;
  inspection: { id: string; title: string } | null;
  inspectorName: string | null;
  correctiveActionCount: number;
  evidenceCount: number;
}

export interface ObservationListParams {
  search?: string;
  risk?: RiskLevel;
  status?: ObservationStatus;
  mineId?: string;
  from?: string;
  to?: string;
  page?: number;
}

export async function listObservations(
  params: ObservationListParams,
): Promise<Paged<ObservationListRow>> {
  const supabase = await createClient();
  const page = params.page && params.page > 0 ? params.page : 1;
  const [lo, hi] = rangeFor(page, PAGE_SIZE);

  let q = supabase
    .from('observations')
    .select(
      `id, title, category, risk, status, created_at,
       mine:mines!observations_mine_id_fkey(name, code),
       inspection:inspections!observations_inspection_id_fkey(id, title),
       raised_by_profile:profiles!observations_raised_by_fkey(full_name),
       corrective_actions(count),
       evidence(count)`,
      { count: 'exact' },
    )
    .order('created_at', { ascending: false })
    .range(lo, hi);

  if (params.search) q = q.ilike('title', `%${params.search}%`);
  if (params.risk) q = q.eq('risk', params.risk);
  if (params.status) q = q.eq('status', params.status);
  if (params.mineId) q = q.eq('mine_id', params.mineId);
  if (params.from) q = q.gte('created_at', params.from);
  if (params.to) q = q.lte('created_at', params.to);

  const { data, count, error } = await q;
  if (error) throw new Error(error.message);

  const rows: ObservationListRow[] = ((data ?? []) as Record<string, unknown>[]).map((r) => {
    const mine = one(r.mine as unknown) as { name?: string; code?: string } | null;
    const insp = one(r.inspection as unknown) as { id: string; title: string } | null;
    const who = one(r.raised_by_profile as unknown) as { full_name?: string } | null;
    return {
      id: r.id as string,
      title: r.title as string,
      category: (r.category as string) ?? null,
      risk: r.risk as RiskLevel,
      status: r.status as ObservationStatus,
      createdAt: r.created_at as string,
      mineName: mine?.name ?? null,
      mineCode: mine?.code ?? null,
      inspection: insp ? { id: insp.id, title: insp.title } : null,
      inspectorName: who?.full_name ?? null,
      correctiveActionCount: embedCount(r.corrective_actions),
      evidenceCount: embedCount(r.evidence),
    };
  });

  return paged(rows, count ?? 0, page, PAGE_SIZE);
}

/* ------------------------------- detail ------------------------------- */

export interface ObservationCorrectiveAction {
  id: string;
  title: string;
  description: string | null;
  status: CorrectiveActionStatus;
  priority: CorrectiveActionPriority;
  dueDate: string | null;
  createdAt: string;
  assignedAt: string | null;
  submittedAt: string | null;
  verifiedAt: string | null;
  closedAt: string | null;
  assigneeName: string | null;
  verifierName: string | null;
}

export interface ObservationAiAnalysis {
  id: string;
  analysisType: string;
  status: string;
  provider: string | null;
  model: string | null;
  risk: RiskLevel | null;
  confidence: number | null;
  summary: string | null;
  recommendations: string[];
  /** Plain-language "what happens if ignored" from ai_analyses.output. */
  consequence: string | null;
  /** Single most important next step from ai_analyses.output. */
  recommendedAction: string | null;
  simulated: boolean;
  createdAt: string;
  completedAt: string | null;
}

export interface TimelineEvent {
  key: string;
  label: string;
  at: string;
  actor?: string | null;
}

export interface ObservationDetail {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  risk: RiskLevel;
  status: ObservationStatus;
  createdAt: string;
  occurredAt: string | null;
  coords: { lat: number; lng: number } | null;
  mineName: string | null;
  mineCode: string | null;
  inspection: { id: string; title: string; status: string } | null;
  inspector: { name: string; email: string | null } | null;
  evidence: EvidenceItem[];
  correctiveAction: ObservationCorrectiveAction | null;
  aiAnalysis: ObservationAiAnalysis | null;
  timeline: TimelineEvent[];
}

function mapEvidenceRow(r: Record<string, unknown>): EvidenceItem {
  const lat = r.gps_latitude as number | null;
  const lng = r.gps_longitude as number | null;
  return {
    id: r.id as string,
    storagePath: r.storage_path as string,
    fileName: (r.file_name as string) ?? null,
    mimeType: (r.mime_type as string) ?? null,
    evidenceType: (r.evidence_type as string) ?? 'photo',
    isSimulated: Boolean(r.is_simulated),
    caption: (r.caption as string) ?? null,
    capturedAt: (r.captured_at as string) ?? null,
    coords: typeof lat === 'number' && typeof lng === 'number' ? { lat, lng } : null,
    observationId: (r.observation_id as string) ?? null,
  };
}

function toStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
  return [];
}

export async function getObservationDetail(id: string): Promise<ObservationDetail | null> {
  const supabase = await createClient();

  const { data: obs, error } = await supabase
    .from('observations')
    .select(
      `id, title, description, category, risk, status, created_at, occurred_at,
       gps_latitude, gps_longitude, ai_analysis_id,
       mine:mines!observations_mine_id_fkey(name, code),
       inspection:inspections!observations_inspection_id_fkey(id, title, status),
       raised_by_profile:profiles!observations_raised_by_fkey(full_name, email)`,
    )
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!obs) return null;

  const aiId = (obs.ai_analysis_id as string) ?? null;

  const [eviRes, caRes, aiRes] = await Promise.all([
    supabase
      .from('evidence')
      .select(
        `id, storage_path, file_name, mime_type, evidence_type, is_simulated, caption,
         captured_at, gps_latitude, gps_longitude, observation_id`,
      )
      .eq('observation_id', id)
      .order('created_at', { ascending: true }),
    supabase
      .from('corrective_actions')
      .select(
        `id, title, description, status, priority, due_date, created_at, assigned_at,
         submitted_at, verified_at, closed_at,
         assignee:profiles!corrective_actions_assigned_to_fkey(full_name),
         verifier:profiles!corrective_actions_verified_by_fkey(full_name)`,
      )
      .eq('observation_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    aiId
      ? supabase
          .from('ai_analyses')
          .select(
            `id, analysis_type, status, provider, model, risk, confidence, summary,
             recommendations, output, created_at, completed_at`,
          )
          .eq('id', aiId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  const evidence = ((eviRes.data ?? []) as Record<string, unknown>[]).map(mapEvidenceRow);

  const caRow = caRes.data as Record<string, unknown> | null;
  const correctiveAction: ObservationCorrectiveAction | null = caRow
    ? {
        id: caRow.id as string,
        title: caRow.title as string,
        description: (caRow.description as string) ?? null,
        status: caRow.status as CorrectiveActionStatus,
        priority: caRow.priority as CorrectiveActionPriority,
        dueDate: (caRow.due_date as string) ?? null,
        createdAt: caRow.created_at as string,
        assignedAt: (caRow.assigned_at as string) ?? null,
        submittedAt: (caRow.submitted_at as string) ?? null,
        verifiedAt: (caRow.verified_at as string) ?? null,
        closedAt: (caRow.closed_at as string) ?? null,
        assigneeName:
          (one(caRow.assignee as unknown) as { full_name?: string } | null)?.full_name ?? null,
        verifierName:
          (one(caRow.verifier as unknown) as { full_name?: string } | null)?.full_name ?? null,
      }
    : null;

  const aiRow = aiRes.data as Record<string, unknown> | null;
  const aiOutput = (aiRow?.output ?? null) as Record<string, unknown> | null;
  let aiAnalysis: ObservationAiAnalysis | null = aiRow
    ? {
        id: aiRow.id as string,
        analysisType: (aiRow.analysis_type as string) ?? 'risk_classification',
        status: (aiRow.status as string) ?? 'completed',
        provider: (aiRow.provider as string) ?? null,
        model: (aiRow.model as string) ?? null,
        risk: (aiRow.risk as RiskLevel) ?? null,
        confidence: typeof aiRow.confidence === 'number' ? (aiRow.confidence as number) : null,
        summary: (aiRow.summary as string) ?? null,
        recommendations: toStringArray(aiRow.recommendations),
        consequence:
          typeof aiOutput?.consequence === 'string' ? (aiOutput.consequence as string) : null,
        recommendedAction:
          typeof aiOutput?.recommendedAction === 'string'
            ? (aiOutput.recommendedAction as string)
            : null,
        simulated: aiOutput?.simulated === true || aiRow.provider === 'coalguard-heuristic',
        createdAt: aiRow.created_at as string,
        completedAt: (aiRow.completed_at as string) ?? null,
      }
    : null;

  // Fallback: if no persisted analysis is readable (e.g. it was requested by
  // another user and ai_analyses RLS is requester-scoped), derive one live from
  // the same observation text with the shared deterministic heuristic. Always
  // flagged `simulated` so it is never presented as a real model.
  if (!aiAnalysis) {
    const a = analyzeObservation({
      title: obs.title as string,
      description: (obs.description as string) ?? null,
      category: (obs.category as string) ?? null,
    });
    aiAnalysis = {
      id: `derived-${obs.id as string}`,
      analysisType: 'risk_classification',
      status: 'completed',
      provider: 'coalguard-heuristic',
      model: 'coalguard-mock-v0',
      risk: a.risk,
      confidence: a.confidence,
      summary: a.rationale,
      recommendations: a.recommendations,
      consequence: a.consequence,
      recommendedAction: a.recommendedAction,
      simulated: true,
      createdAt: obs.created_at as string,
      completedAt: null,
    };
  }

  const mine = one(obs.mine as unknown) as { name?: string; code?: string } | null;
  const insp = one(obs.inspection as unknown) as
    | { id: string; title: string; status: string }
    | null;
  const who = one(obs.raised_by_profile as unknown) as
    | { full_name?: string; email?: string }
    | null;
  const lat = obs.gps_latitude as number | null;
  const lng = obs.gps_longitude as number | null;

  const timeline: TimelineEvent[] = [
    { key: 'created', label: 'Observation created', at: obs.created_at as string },
  ];
  if (correctiveAction) {
    timeline.push({
      key: 'ca_created',
      label: 'Corrective action created',
      at: correctiveAction.createdAt,
    });
    if (correctiveAction.assignedAt)
      timeline.push({
        key: 'ca_assigned',
        label: `Assigned${correctiveAction.assigneeName ? ` to ${correctiveAction.assigneeName}` : ''}`,
        at: correctiveAction.assignedAt,
      });
    if (correctiveAction.submittedAt)
      timeline.push({ key: 'ca_submitted', label: 'Closure submitted', at: correctiveAction.submittedAt });
    if (correctiveAction.verifiedAt)
      timeline.push({
        key: 'ca_verified',
        label: `Verified${correctiveAction.verifierName ? ` by ${correctiveAction.verifierName}` : ''}`,
        at: correctiveAction.verifiedAt,
      });
    if (correctiveAction.closedAt)
      timeline.push({ key: 'ca_closed', label: 'Closed', at: correctiveAction.closedAt });
  }
  timeline.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  return {
    id: obs.id as string,
    title: obs.title as string,
    description: (obs.description as string) ?? null,
    category: (obs.category as string) ?? null,
    risk: obs.risk as RiskLevel,
    status: obs.status as ObservationStatus,
    createdAt: obs.created_at as string,
    occurredAt: (obs.occurred_at as string) ?? null,
    coords: typeof lat === 'number' && typeof lng === 'number' ? { lat, lng } : null,
    mineName: mine?.name ?? null,
    mineCode: mine?.code ?? null,
    inspection: insp ? { id: insp.id, title: insp.title, status: insp.status } : null,
    inspector: who ? { name: who.full_name ?? 'Unknown', email: who.email ?? null } : null,
    evidence,
    correctiveAction,
    aiAnalysis,
    timeline,
  };
}
