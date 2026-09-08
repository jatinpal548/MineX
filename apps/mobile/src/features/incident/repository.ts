/**
 * Incident - mobile Supabase data layer. RLS-scoped (anon key + user JWT), no
 * service role. Reuses the EXISTING `incidents` table and `ai_analyses`.
 */
import type { IncidentStatus, RiskLevel } from '@coalguard/types';
import { supabase } from '@/lib/supabase';
import { newId } from '@/lib/ids';
import { OfflineError, AuthExpiredError } from '@/features/inspection/repository';
import {
  DB_TO_UI_SEVERITY,
  UI_TO_DB_SEVERITY,
  encodeIncidentDescription,
  parseIncidentDescription,
  type IncidentDraft,
  type IncidentListRow,
} from './types';

const UI_TO_RISK: Record<'critical' | 'high' | 'medium' | 'low', RiskLevel> = {
  critical: 'critical',
  high: 'high',
  medium: 'medium',
  low: 'low',
};

function fail(message: string, cause?: unknown): never {
  const e = cause as { message?: string; code?: string; status?: number } | undefined;
  const msg = (e?.message ?? '').toLowerCase();
  if (
    msg.includes('network request failed') ||
    msg.includes('fetch failed') ||
    msg.includes('failed to fetch') ||
    msg.includes('timeout')
  ) {
    throw new OfflineError();
  }
  if (e?.status === 401 || e?.code === 'PGRST301' || msg.includes('jwt expired')) {
    throw new AuthExpiredError();
  }
  console.warn('[incident]', message, cause);
  throw new Error(e?.code ? `${message} (${e.code})` : message);
}

/** Create / upsert the incident row (idempotent on id + client_ref). */
export async function upsertIncident(d: IncidentDraft): Promise<string> {
  const gps =
    typeof d.gpsLatitude === 'number' && typeof d.gpsLongitude === 'number'
      ? { gps_latitude: d.gpsLatitude, gps_longitude: d.gpsLongitude }
      : {};
  const { data, error } = await supabase
    .from('incidents')
    .upsert(
      {
        id: d.id,
        client_ref: d.clientRef,
        mine_id: d.mineId,
        reported_by: d.reportedBy,
        title: d.title.trim(),
        description: encodeIncidentDescription(d.type, d.description),
        severity: UI_TO_DB_SEVERITY[d.severity],
        status: 'reported' as IncidentStatus,
        occurred_at: d.occurredAt,
        reported_at: d.createdAt,
        immediate_action: d.aiRecommendedAction?.trim() || null,
        sync_status: 'synced',
        ...gps,
      },
      { onConflict: 'id' },
    )
    .select('id')
    .single();
  if (error) fail('Could not save the incident.', error);

  // optional AI analysis row (simulated heuristic), linked back to the incident
  if (d.aiRisk && (d.aiConsequence || d.aiRecommendedAction)) {
    const { data: ai } = await supabase
      .from('ai_analyses')
      .upsert(
        {
          id: newId(),
          analysis_type: 'risk_classification',
          status: 'completed',
          provider: 'coalguard-heuristic',
          model: 'coalguard-mock-v0',
          risk: UI_TO_RISK[d.aiRisk],
          confidence: 0.6,
          summary: d.aiConsequence,
          recommendations: d.aiRecommendedAction ? [d.aiRecommendedAction] : [],
          output: {
            consequence: d.aiConsequence,
            recommendedAction: d.aiRecommendedAction,
            simulated: true,
          },
          entity_type: 'incident',
          entity_id: d.id,
          requested_by: d.reportedBy,
          completed_at: new Date().toISOString(),
        },
        { onConflict: 'id' },
      )
      .select('id')
      .maybeSingle();
    if (ai?.id) {
      await supabase.from('incidents').update({ ai_analysis_id: ai.id }).eq('id', d.id).then(undefined, () => {});
    }
  }

  return (data as { id: string }).id;
}

const LIST_SELECT = `
  id, title, description, severity, status, occurred_at,
  gps_latitude, gps_longitude,
  mine:mines!incidents_mine_id_fkey(name),
  evidence(count)
`;

export async function fetchMyIncidents(reportedBy: string): Promise<IncidentListRow[]> {
  const { data, error } = await supabase
    .from('incidents')
    .select(LIST_SELECT)
    .eq('reported_by', reportedBy)
    .order('occurred_at', { ascending: false })
    .limit(100);
  if (error) fail('Could not load incidents.', error);
  return (data ?? []).map((r) => mapListRow(r as Record<string, unknown>));
}

function mapListRow(r: Record<string, unknown>): IncidentListRow {
  const one = <T>(v: unknown): T | null => (Array.isArray(v) ? ((v[0] as T) ?? null) : ((v as T) ?? null));
  const { type } = parseIncidentDescription((r.description as string) ?? null);
  return {
    id: r.id as string,
    title: r.title as string,
    type,
    severity: DB_TO_UI_SEVERITY[(r.severity as keyof typeof DB_TO_UI_SEVERITY) ?? 'minor'],
    status: r.status as IncidentStatus,
    occurredAt: r.occurred_at as string,
    mineName: one<{ name?: string }>(r.mine)?.name ?? null,
    hasLocation:
      typeof r.gps_latitude === 'number' && typeof r.gps_longitude === 'number',
    evidenceCount: one<{ count?: number }>(r.evidence)?.count ?? 0,
  };
}

export interface IncidentDetail extends IncidentListRow {
  description: string;
  reporterName: string | null;
  reportedAt: string;
  gps: { lat: number; lng: number } | null;
  ai: { risk: string | null; consequence: string | null; recommendedAction: string | null; simulated: boolean } | null;
}

export async function fetchIncidentDetail(id: string): Promise<IncidentDetail | null> {
  const { data, error } = await supabase
    .from('incidents')
    .select(
      `${LIST_SELECT}, description, reported_at, ai_analysis_id,
       reporter:profiles!incidents_reported_by_fkey(full_name)`,
    )
    .eq('id', id)
    .maybeSingle();
  if (error) fail('Could not load the incident.', error);
  if (!data) return null;

  const base = mapListRow(data as Record<string, unknown>);
  const r = data as Record<string, unknown>;
  const one = <T>(v: unknown): T | null => (Array.isArray(v) ? ((v[0] as T) ?? null) : ((v as T) ?? null));
  const { description } = parseIncidentDescription((r.description as string) ?? null);

  let ai: IncidentDetail['ai'] = null;
  const aiId = r.ai_analysis_id as string | null;
  if (aiId) {
    const { data: aiRow } = await supabase
      .from('ai_analyses')
      .select('risk, summary, output')
      .eq('id', aiId)
      .maybeSingle();
    if (aiRow) {
      const out = (aiRow.output ?? {}) as { consequence?: string; recommendedAction?: string; simulated?: boolean };
      ai = {
        risk: (aiRow.risk as string) ?? null,
        consequence: out.consequence ?? (aiRow.summary as string) ?? null,
        recommendedAction: out.recommendedAction ?? null,
        simulated: out.simulated === true,
      };
    }
  }

  return {
    ...base,
    description,
    reporterName: one<{ full_name?: string }>(r.reporter)?.full_name ?? null,
    reportedAt: (r.reported_at as string) ?? base.occurredAt,
    gps: base.hasLocation
      ? { lat: r.gps_latitude as number, lng: r.gps_longitude as number }
      : null,
    ai,
  };
}
