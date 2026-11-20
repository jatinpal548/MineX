/**
 * Inspections: list + detail. RLS-scoped SSR client. Nothing is fabricated -
 * a missing row yields null and the page renders an empty / not-found state.
 */
import type {
  CorrectiveActionPriority,
  CorrectiveActionStatus,
  InspectionItemResponse,
  InspectionStatus,
  ObservationStatus,
  RiskLevel,
} from '@coalguard/types';
import { createClient } from '@/lib/supabase/server';
import { PAGE_SIZE, one, embedCount, paged, rangeFor, type Paged } from './shared';

export interface InspectionListRow {
  id: string;
  title: string;
  inspectionType: string;
  status: InspectionStatus;
  overallRisk: RiskLevel | null;
  templateName: string | null;
  mineName: string | null;
  mineCode: string | null;
  inspectorName: string | null;
  startedAt: string | null;
  submittedAt: string | null;
  createdAt: string;
  observationCount: number;
}

export interface InspectionListParams {
  search?: string;
  status?: InspectionStatus;
  risk?: RiskLevel;
  mineId?: string;
  from?: string;
  to?: string;
  page?: number;
}

export async function listInspections(
  params: InspectionListParams,
): Promise<Paged<InspectionListRow>> {
  const supabase = await createClient();
  const page = params.page && params.page > 0 ? params.page : 1;
  const [lo, hi] = rangeFor(page, PAGE_SIZE);

  let q = supabase
    .from('inspections')
    .select(
      `id, title, inspection_type, status, overall_risk, started_at, submitted_at, created_at,
       template:inspection_templates!inspections_template_id_fkey(name),
       mine:mines!inspections_mine_id_fkey(name, code),
       inspector:profiles!inspections_inspector_id_fkey(full_name),
       observations(count)`,
      { count: 'exact' },
    )
    .order('created_at', { ascending: false })
    .range(lo, hi);

  if (params.search) q = q.ilike('title', `%${params.search}%`);
  if (params.status) q = q.eq('status', params.status);
  if (params.risk) q = q.eq('overall_risk', params.risk);
  if (params.mineId) q = q.eq('mine_id', params.mineId);
  if (params.from) q = q.gte('created_at', params.from);
  if (params.to) q = q.lte('created_at', params.to);

  const { data, count, error } = await q;
  if (error) throw new Error(error.message);

  const rows: InspectionListRow[] = ((data ?? []) as Record<string, unknown>[]).map((r) => {
    const mine = one(r.mine as unknown) as { name?: string; code?: string } | null;
    const tpl = one(r.template as unknown) as { name?: string } | null;
    const insp = one(r.inspector as unknown) as { full_name?: string } | null;
    return {
      id: r.id as string,
      title: r.title as string,
      inspectionType: (r.inspection_type as string) ?? '',
      status: r.status as InspectionStatus,
      overallRisk: (r.overall_risk as RiskLevel) ?? null,
      templateName: tpl?.name ?? null,
      mineName: mine?.name ?? null,
      mineCode: mine?.code ?? null,
      inspectorName: insp?.full_name ?? null,
      startedAt: (r.started_at as string) ?? null,
      submittedAt: (r.submitted_at as string) ?? null,
      createdAt: r.created_at as string,
      observationCount: embedCount(r.observations),
    };
  });

  return paged(rows, count ?? 0, page, PAGE_SIZE);
}

/* ------------------------------- detail ------------------------------- */

export interface InspectionChecklistItem {
  id: string;
  section: string;
  prompt: string;
  response: InspectionItemResponse | null;
  notes: string | null;
  risk: RiskLevel | null;
  sortOrder: number;
}

export interface InspectionObservation {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  risk: RiskLevel;
  status: ObservationStatus;
  createdAt: string;
  inspectorName: string | null;
  correctiveAction: {
    id: string;
    status: CorrectiveActionStatus;
    priority: CorrectiveActionPriority;
    assigneeName: string | null;
  } | null;
  evidenceCount: number;
}

export interface EvidenceItem {
  id: string;
  storagePath: string;
  fileName: string | null;
  mimeType: string | null;
  evidenceType: string;
  isSimulated: boolean;
  caption: string | null;
  capturedAt: string | null;
  coords: { lat: number; lng: number } | null;
  observationId: string | null;
}

export interface InspectionDetail {
  id: string;
  title: string;
  inspectionType: string;
  status: InspectionStatus;
  summary: string | null;
  overallRisk: RiskLevel | null;
  scheduledFor: string | null;
  startedAt: string | null;
  submittedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  coords: { lat: number; lng: number } | null;
  templateName: string | null;
  templateDescription: string | null;
  mineName: string | null;
  mineCode: string | null;
  orgPath: string | null;
  inspector: { name: string; email: string | null; employeeCode: string | null } | null;
  items: InspectionChecklistItem[];
  observations: InspectionObservation[];
  evidence: EvidenceItem[];
  progress: { total: number; ok: number; notOk: number; na: number; answered: number };
}

function mapEvidence(r: Record<string, unknown>): EvidenceItem {
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

export async function getInspectionDetail(id: string): Promise<InspectionDetail | null> {
  const supabase = await createClient();

  const { data: insp, error } = await supabase
    .from('inspections')
    .select(
      `id, title, inspection_type, status, summary, overall_risk, scheduled_for, started_at,
       submitted_at, closed_at, created_at, gps_latitude, gps_longitude,
       template:inspection_templates!inspections_template_id_fkey(name, description),
       mine:mines!inspections_mine_id_fkey(name, code, region:regions(name, subsidiary:subsidiaries(code))),
       inspector:profiles!inspections_inspector_id_fkey(full_name, email, employee_code)`,
    )
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!insp) return null;

  const [itemsRes, obsRes, eviRes] = await Promise.all([
    supabase
      .from('inspection_items')
      .select('id, section, prompt, response, notes, risk, sort_order')
      .eq('inspection_id', id)
      .order('sort_order', { ascending: true }),
    supabase
      .from('observations')
      .select(
        `id, title, description, category, risk, status, created_at,
         raised_by_profile:profiles!observations_raised_by_fkey(full_name),
         corrective_actions(id, status, priority, assignee:profiles!corrective_actions_assigned_to_fkey(full_name)),
         evidence(count)`,
      )
      .eq('inspection_id', id)
      .order('created_at', { referencedTable: 'corrective_actions', ascending: false })
      .limit(1, { referencedTable: 'corrective_actions' })
      .order('created_at', { ascending: true }),
    supabase
      .from('evidence')
      .select(
        `id, storage_path, file_name, mime_type, evidence_type, is_simulated, caption,
         captured_at, gps_latitude, gps_longitude, observation_id`,
      )
      .eq('inspection_id', id)
      .order('created_at', { ascending: true }),
  ]);

  const items: InspectionChecklistItem[] = ((itemsRes.data ?? []) as Record<string, unknown>[]).map(
    (r) => ({
      id: r.id as string,
      section: (r.section as string) ?? 'General',
      prompt: r.prompt as string,
      response: (r.response as InspectionItemResponse) ?? null,
      notes: (r.notes as string) ?? null,
      risk: (r.risk as RiskLevel) ?? null,
      sortOrder: (r.sort_order as number) ?? 0,
    }),
  );

  const observations: InspectionObservation[] = ((obsRes.data ?? []) as Record<string, unknown>[]).map(
    (r) => {
      const ca = one(r.corrective_actions as unknown) as
        | { id: string; status: CorrectiveActionStatus; priority: CorrectiveActionPriority;
            assignee: { full_name: string } | { full_name: string }[] | null }
        | null;
      const who = one(r.raised_by_profile as unknown) as { full_name?: string } | null;
      return {
        id: r.id as string,
        title: r.title as string,
        description: (r.description as string) ?? null,
        category: (r.category as string) ?? null,
        risk: r.risk as RiskLevel,
        status: r.status as ObservationStatus,
        createdAt: r.created_at as string,
        inspectorName: who?.full_name ?? null,
        correctiveAction: ca ? {
          id: ca.id, status: ca.status, priority: ca.priority,
          assigneeName: one(ca.assignee)?.full_name || null,
        } : null,
        evidenceCount: embedCount(r.evidence),
      };
    },
  );

  const evidence = ((eviRes.data ?? []) as Record<string, unknown>[]).map(mapEvidence);

  const answered = items.filter((i) => i.response !== null);
  const progress = {
    total: items.length,
    ok: items.filter((i) => i.response === 'ok').length,
    notOk: items.filter((i) => i.response === 'not_ok').length,
    na: items.filter((i) => i.response === 'na').length,
    answered: answered.length,
  };

  const mine = one(insp.mine as unknown) as
    | { name?: string; code?: string; region?: { name?: string; subsidiary?: { code?: string } } | null }
    | null;
  const region = mine?.region ?? null;
  const orgPath = [region?.name, region?.subsidiary?.code].filter(Boolean).join(' · ') || null;
  const tpl = one(insp.template as unknown) as { name?: string; description?: string } | null;
  const inspector = one(insp.inspector as unknown) as
    | { full_name?: string; email?: string; employee_code?: string }
    | null;
  const lat = insp.gps_latitude as number | null;
  const lng = insp.gps_longitude as number | null;

  return {
    id: insp.id as string,
    title: insp.title as string,
    inspectionType: (insp.inspection_type as string) ?? '',
    status: insp.status as InspectionStatus,
    summary: (insp.summary as string) ?? null,
    overallRisk: (insp.overall_risk as RiskLevel) ?? null,
    scheduledFor: (insp.scheduled_for as string) ?? null,
    startedAt: (insp.started_at as string) ?? null,
    submittedAt: (insp.submitted_at as string) ?? null,
    closedAt: (insp.closed_at as string) ?? null,
    createdAt: insp.created_at as string,
    coords: typeof lat === 'number' && typeof lng === 'number' ? { lat, lng } : null,
    templateName: tpl?.name ?? null,
    templateDescription: tpl?.description ?? null,
    mineName: mine?.name ?? null,
    mineCode: mine?.code ?? null,
    orgPath,
    inspector: inspector
      ? {
          name: inspector.full_name ?? 'Unknown',
          email: inspector.email ?? null,
          employeeCode: inspector.employee_code ?? null,
        }
      : null,
    items,
    observations,
    evidence,
    progress,
  };
}
