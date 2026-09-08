/**
 * Supabase data layer for the inspection workflow.
 *
 * Pure async functions - no React. Every write respects Row Level Security
 * (the mobile client only ever uses the public anon key + the signed-in user's
 * JWT). On any Postgres error these throw an `Error` with a short, human
 * message; screens turn that into an ErrorState. Nothing here fabricates data.
 */
import type { CorrectiveActionPriority, RiskLevel } from '@coalguard/types';
import { supabase } from '@/lib/supabase';
import { newId } from '@/lib/ids';
import type { RiskAnalysis } from '@/lib/ai/classifyRisk';
import type { RiskClassificationInput } from '@coalguard/ai/types';
import {
  computeProgress,
  highestRisk,
  type DraftChecklistItem,
  type DraftObservation,
  type InspectionDraft,
  type TemplateSummary,
} from './types';

/** The device has no working connection - the write should be queued locally. */
export class OfflineError extends Error {
  constructor() {
    super('offline');
    this.name = 'OfflineError';
  }
}
/** The Supabase session expired - keep local data, re-authenticate, then resume. */
export class AuthExpiredError extends Error {
  constructor() {
    super('auth-expired');
    this.name = 'AuthExpiredError';
  }
}

function classify(cause: unknown): 'network' | 'auth' | 'server' {
  const e = cause as
    { message?: string; code?: string; status?: number; name?: string } | undefined;
  const msg = (e?.message ?? '').toLowerCase();
  if (
    e?.name === 'AbortError' ||
    msg.includes('network request failed') ||
    msg.includes('failed to fetch') ||
    msg.includes('fetch failed') ||
    msg.includes('networkerror') ||
    msg.includes('network error') ||
    msg.includes('timeout') ||
    msg.includes('unable to resolve host')
  ) {
    return 'network';
  }
  if (
    e?.status === 401 ||
    e?.code === 'PGRST301' ||
    e?.code === '401' ||
    msg.includes('jwt expired') ||
    msg.includes('token is expired') ||
    msg.includes('invalid claim') ||
    msg.includes('jws') ||
    msg.includes('not authenticated')
  ) {
    return 'auth';
  }
  return 'server';
}

function fail(message: string, cause?: unknown): never {
  if (cause) console.warn('[inspection]', message, cause);
  const kind = classify(cause);
  if (kind === 'network') throw new OfflineError();
  if (kind === 'auth') throw new AuthExpiredError();
  // real server error: append the Postgres error code (23503 FK, 42501 RLS,
  // 23502 not-null, ...) - short and diagnostic, not a stack trace.
  const code = (cause as { code?: string } | undefined)?.code;
  throw new Error(code ? `${message} (${code})` : message);
}

/* ------------------------------- templates ----------------------------- */

const CATEGORY_LABEL: Record<string, string> = {
  safety: 'Safety',
  environment: 'Environmental',
  maintenance: 'Equipment',
  hr: 'Workforce',
  operations: 'Operations',
  compliance: 'Compliance',
};

export async function fetchTemplates(): Promise<TemplateSummary[]> {
  const { data, error } = await supabase
    .from('inspection_templates')
    .select(
      'id, name, description, applies_to_dept_type, is_active, inspection_checklist_items(count)',
    )
    .eq('is_active', true)
    .order('name');
  if (error) fail('Could not load inspection templates.', error);

  return (data ?? []).map((row: Record<string, unknown>) => {
    const countRel = row.inspection_checklist_items as { count: number }[] | undefined;
    const dept = (row.applies_to_dept_type as string) ?? 'operations';
    return {
      id: row.id as string,
      name: row.name as string,
      description: (row.description as string) ?? null,
      category: CATEGORY_LABEL[dept] ?? 'General',
      itemCount: countRel?.[0]?.count ?? 0,
    };
  });
}

/* ---------------------------- start / resume -------------------------- */

interface StartArgs {
  /** client-generated UUID - used as BOTH the local id and the server id */
  id: string;
  clientRef: string;
  templateId: string;
  templateName: string;
  inspectionType: string;
  mineId: string;
  departmentId: string | null;
  inspectorId: string;
  startedAt?: string;
}

/** Creates the draft inspection row (status = in_progress). Idempotent by id/clientRef. */
export async function startInspection(args: StartArgs): Promise<string> {
  const nowIso = args.startedAt ?? new Date().toISOString();
  const { data, error } = await supabase
    .from('inspections')
    .insert({
      id: args.id,
      client_ref: args.clientRef,
      mine_id: args.mineId,
      department_id: args.departmentId,
      template_id: args.templateId,
      title: args.templateName,
      inspection_type: args.inspectionType,
      status: 'in_progress',
      started_at: nowIso,
      inspector_id: args.inspectorId,
      created_by: args.inspectorId,
      sync_status: 'synced',
    })
    .select('id')
    .single();

  if (error) {
    // 23505 = the row already exists (id / client_ref) -> a safe replay
    if ((error as { code?: string }).code === '23505') return args.id;
    fail('Could not start the inspection.', error);
  }
  return (data as { id: string }).id;
}

/* ------------------------------- fetch draft -------------------------- */

export async function fetchDraft(inspectionId: string): Promise<InspectionDraft> {
  const { data: insp, error: iErr } = await supabase
    .from('inspections')
    .select(
      'id, title, status, template_id, mine_id, inspector_id, started_at, submitted_at, overall_risk, inspection_templates(name)',
    )
    .eq('id', inspectionId)
    .maybeSingle();
  if (iErr) fail('Could not load the inspection.', iErr);
  if (!insp) fail('Inspection not found.');

  const templateId = (insp.template_id as string) ?? null;

  const [blueprintRes, savedRes, obsRes] = await Promise.all([
    templateId
      ? supabase
          .from('inspection_checklist_items')
          .select('id, section, prompt, guidance, is_mandatory, sort_order')
          .eq('template_id', templateId)
          .order('sort_order')
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from('inspection_items')
      .select('id, checklist_item_id, section, prompt, response, notes, risk, sort_order')
      .eq('inspection_id', inspectionId),
    supabase
      .from('observations')
      .select(
        'id, inspection_item_id, title, description, category, risk, ai_analysis_id, gps_latitude, gps_longitude, corrective_actions(id, priority), evidence(count)',
      )
      .eq('inspection_id', inspectionId),
  ]);
  if (blueprintRes.error) fail('Could not load the checklist.', blueprintRes.error);
  if (savedRes.error) fail('Could not load your saved answers.', savedRes.error);
  if (obsRes.error) fail('Could not load observations.', obsRes.error);

  const saved = (savedRes.data ?? []) as Record<string, unknown>[];
  const byChecklistId = new Map<string, Record<string, unknown>>();
  const legacy: Record<string, unknown>[] = [];
  for (const s of saved) {
    const cid = s.checklist_item_id as string | null;
    if (cid) byChecklistId.set(cid, s);
    else legacy.push(s);
  }

  const blueprint = (blueprintRes.data ?? []) as Record<string, unknown>[];
  const items: DraftChecklistItem[] = blueprint.map((b) => {
    const existing = byChecklistId.get(b.id as string);
    return {
      id: (existing?.id as string) ?? newId(),
      checklistItemId: b.id as string,
      section: (b.section as string) ?? 'General',
      prompt: b.prompt as string,
      guidance: (b.guidance as string) ?? null,
      isMandatory: Boolean(b.is_mandatory),
      sortOrder: (b.sort_order as number) ?? 0,
      response: (existing?.response as DraftChecklistItem['response']) ?? null,
      notes: (existing?.notes as string) ?? '',
      observationId: null,
    };
  });

  const obsRows = (obsRes.data ?? []) as Record<string, unknown>[];

  // pull the AI analyses for these observations in one go (RLS: requester-only)
  const analysisIds = obsRows
    .map((o) => o.ai_analysis_id as string | null)
    .filter((x): x is string => Boolean(x));
  const analysisById = new Map<string, Record<string, unknown>>();
  if (analysisIds.length > 0) {
    const { data: aiRows } = await supabase
      .from('ai_analyses')
      .select('id, risk, confidence, summary, recommendations, output, provider')
      .in('id', analysisIds);
    for (const a of (aiRows ?? []) as Record<string, unknown>[]) {
      analysisById.set(a.id as string, a);
    }
  }

  const observations: DraftObservation[] = obsRows.map((o) => {
    const ca = (o.corrective_actions as { id: string; priority: CorrectiveActionPriority }[])?.[0];
    const ai = o.ai_analysis_id ? analysisById.get(o.ai_analysis_id as string) : undefined;
    const recs = ai?.recommendations;
    const output = ai?.output as
      { source?: DraftObservation['aiSource']; simulated?: boolean } | undefined;
    return {
      id: o.id as string,
      inspectionItemId: (o.inspection_item_id as string) ?? null,
      checklistItemId: null,
      title: o.title as string,
      description: (o.description as string) ?? '',
      category: (o.category as string) ?? null,
      risk: (o.risk as RiskLevel) ?? 'medium',
      aiAnalysisId: (o.ai_analysis_id as string) ?? null,
      aiRationale: (ai?.summary as string) ?? null,
      aiRecommendations: Array.isArray(recs) ? (recs as string[]) : [],
      aiSimulated: output?.simulated ?? false,
      aiSource: output?.source ?? null,
      correctiveActionId: ca?.id ?? null,
      correctiveActionPriority: ca?.priority ?? null,
      evidenceCount: (o.evidence as { count: number }[] | undefined)?.[0]?.count ?? 0,
      hasLocation: o.gps_latitude != null && o.gps_longitude != null,
    };
  });

  // link observations back to their checklist item
  const itemById = new Map(items.map((it) => [it.id, it]));
  for (const obs of observations) {
    if (obs.inspectionItemId && itemById.has(obs.inspectionItemId)) {
      itemById.get(obs.inspectionItemId)!.observationId = obs.id;
    }
  }

  return {
    id: insp.id as string,
    title: insp.title as string,
    status: insp.status as InspectionDraft['status'],
    templateId,
    templateName:
      (insp.inspection_templates as { name?: string } | null)?.name ?? (insp.title as string),
    mineId: insp.mine_id as string,
    inspectorId: insp.inspector_id as string,
    startedAt: (insp.started_at as string) ?? null,
    submittedAt: (insp.submitted_at as string) ?? null,
    overallRisk: (insp.overall_risk as RiskLevel) ?? null,
    items,
    observations,
  };
}

/* --------------------------- save checklist -------------------------- */

export async function saveResponses(
  inspectionId: string,
  items: DraftChecklistItem[],
): Promise<void> {
  const rows = items
    .filter((it) => it.response || it.notes.trim())
    .map((it) => ({
      id: it.id,
      inspection_id: inspectionId,
      checklist_item_id: it.checklistItemId,
      section: it.section,
      prompt: it.prompt,
      response: it.response,
      notes: it.notes.trim() || null,
      sort_order: it.sortOrder,
    }));
  if (rows.length === 0) return;

  const { error } = await supabase.from('inspection_items').upsert(rows, { onConflict: 'id' });
  if (error) fail('Could not save your checklist answers.', error);
}

/* ---------------------------- observations -------------------------- */

interface CreateObservationArgs {
  /** client-generated UUID (local id == server id) */
  id?: string;
  clientRef?: string;
  /** null for a standalone "Quick Observation" raised outside an inspection */
  inspectionId: string | null;
  inspectionItemId: string | null;
  mineId: string;
  departmentId: string | null;
  raisedBy: string;
  title: string;
  description: string;
  category: string | null;
  occurredAt?: string;
  gpsLatitude?: number | null;
  gpsLongitude?: number | null;
}

export async function createObservation(args: CreateObservationArgs): Promise<string> {
  const id = args.id ?? newId();
  const gps =
    typeof args.gpsLatitude === 'number' && typeof args.gpsLongitude === 'number'
      ? { gps_latitude: args.gpsLatitude, gps_longitude: args.gpsLongitude }
      : {};
  const { data, error } = await supabase
    .from('observations')
    .upsert(
      {
        id,
        client_ref: args.clientRef ?? id,
        inspection_id: args.inspectionId ?? null,
        inspection_item_id: args.inspectionItemId,
        mine_id: args.mineId,
        department_id: args.departmentId,
        raised_by: args.raisedBy,
        title: args.title.trim(),
        description: args.description.trim() || null,
        category: args.category,
        status: 'open',
        occurred_at: args.occurredAt ?? new Date().toISOString(),
        sync_status: 'synced',
        ...gps,
      },
      { onConflict: 'id' },
    )
    .select('id')
    .single();
  if (error) fail('Could not save the observation.', error);
  return (data as { id: string }).id;
}

export async function updateObservation(
  observationId: string,
  patch: {
    title?: string;
    description?: string;
    category?: string | null;
    risk?: RiskLevel;
    aiAnalysisId?: string | null;
    gpsLatitude?: number | null;
    gpsLongitude?: number | null;
  },
): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.title !== undefined) row.title = patch.title.trim();
  if (patch.description !== undefined) row.description = patch.description.trim() || null;
  if (patch.category !== undefined) row.category = patch.category;
  if (patch.risk !== undefined) row.risk = patch.risk;
  if (patch.aiAnalysisId !== undefined) row.ai_analysis_id = patch.aiAnalysisId;
  if (typeof patch.gpsLatitude === 'number' && typeof patch.gpsLongitude === 'number') {
    row.gps_latitude = patch.gpsLatitude;
    row.gps_longitude = patch.gpsLongitude;
  }
  if (Object.keys(row).length === 0) return;

  const { error } = await supabase.from('observations').update(row).eq('id', observationId);
  if (error) fail('Could not update the observation.', error);
}

/* ----------------------------- ai analyses ------------------------- */

export async function saveAiAnalysis(args: {
  id?: string;
  requestedBy: string;
  observationId: string;
  input: RiskClassificationInput;
  result: RiskAnalysis;
}): Promise<string> {
  const id = args.id ?? newId();
  const { data, error } = await supabase
    .from('ai_analyses')
    .upsert(
      {
        id,
        analysis_type: 'risk_classification',
        status: 'completed',
        provider:
          args.result.source === 'server'
            ? (args.result.provider ?? 'server')
            : 'on-device-heuristic',
        model: args.result.model ?? null,
        input: args.input,
        output: args.result,
        risk: args.result.risk,
        confidence: args.result.confidence,
        summary: args.result.rationale,
        recommendations: args.result.recommendations,
        entity_type: 'observation',
        entity_id: args.observationId,
        requested_by: args.requestedBy,
        completed_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    )
    .select('id')
    .single();
  if (error) fail('Could not save the AI analysis.', error);
  return (data as { id: string }).id;
}

/* ------------------------- corrective actions --------------------- */

export async function createCorrectiveAction(args: {
  id?: string;
  observationId: string;
  inspectionId: string;
  mineId: string;
  title: string;
  description: string;
  priority: CorrectiveActionPriority;
}): Promise<string> {
  const id = args.id ?? newId();
  const { data, error } = await supabase
    .from('corrective_actions')
    .upsert(
      {
        id,
        observation_id: args.observationId,
        inspection_id: args.inspectionId,
        mine_id: args.mineId,
        title: args.title.trim(),
        description: args.description.trim() || null,
        priority: args.priority,
        status: 'open',
      },
      { onConflict: 'id' },
    )
    .select('id')
    .single();
  if (error) fail('Could not create the corrective action.', error);
  return (data as { id: string }).id;
}

/* ------------------------------- submit --------------------------- */

export async function submitInspection(draft: InspectionDraft): Promise<InspectionDraft> {
  if (draft.status === 'submitted') return draft;

  // 1. flush any unsaved checklist answers first (safe to retry)
  await saveResponses(draft.id, draft.items);

  // 2. compute the roll-up
  const progress = computeProgress(draft.items);
  const overall = highestRisk(draft.observations.map((o) => o.risk));
  const summary =
    `${progress.passed} passed, ${progress.failed} failed, ${progress.na} N/A of ${progress.total} checks. ` +
    `${draft.observations.length} observation(s) raised.`;

  // 3. finalise the inspection row
  const { error } = await supabase
    .from('inspections')
    .update({
      status: 'submitted',
      submitted_at: new Date().toISOString(),
      overall_risk: overall,
      summary,
    })
    .eq('id', draft.id)
    .eq('status', 'in_progress'); // guard: never re-submit
  if (error) fail('Could not submit the inspection. Your answers are saved - try again.', error);

  // 4. flag high/critical observations as needing action (best-effort)
  const needsAction = draft.observations
    .filter((o) => o.risk === 'high' || o.risk === 'critical')
    .map((o) => o.id);
  if (needsAction.length > 0) {
    await supabase.from('observations').update({ status: 'action_required' }).in('id', needsAction);
  }

  return {
    ...draft,
    status: 'submitted',
    submittedAt: new Date().toISOString(),
    overallRisk: overall,
  };
}

/* --------------------------- delete draft ---------------------- */

/**
 * Abandon an IN-PROGRESS inspection draft.
 *
 * We do NOT hard-delete rows from the field app (there is deliberately no RLS
 * DELETE policy for inspectors). Instead the draft is moved to the existing
 * `cancelled` status via the normal `scope_update` policy - RLS-safe, no service
 * role, no schema change. Cancelled drafts are filtered out of every list.
 * A submitted inspection can never be cancelled here.
 */
export async function deleteDraftInspection(inspectionId: string): Promise<void> {
  const { data, error } = await supabase
    .from('inspections')
    .update({ status: 'cancelled' })
    .eq('id', inspectionId)
    .eq('status', 'in_progress')
    .select('id');
  if (error) fail('Could not delete the inspection.', error);
  if (!data || data.length === 0) {
    // either it was already submitted, or it never reached the server
    throw new Error('This inspection can no longer be deleted from the field app.');
  }
  // best-effort: detach any observations that were already created for the draft
  await supabase.from('observations').update({ status: 'closed' }).eq('inspection_id', inspectionId);
}

/* ---------------------------- list / detail --------------------- */

export interface InspectionListRow {
  id: string;
  title: string;
  templateName: string | null;
  status: string;
  overallRisk: RiskLevel | null;
  createdAt: string;
  submittedAt: string | null;
  observationCount: number;
  /** offline/sync state - undefined = fully on the server */
  syncState?: 'queued' | 'syncing' | 'synced' | 'failed';
  /** progress detail - populated for locally-cached drafts */
  answered?: number;
  itemCount?: number;
  photoCount?: number;
  hasLocation?: boolean;
}

export async function fetchInspectionList(): Promise<InspectionListRow[]> {
  const { data, error } = await supabase
    .from('inspections')
    .select(
      'id, title, status, overall_risk, created_at, submitted_at, inspection_templates(name), observations(count)',
    )
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) fail('Could not load inspections.', error);

  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    title: row.title as string,
    templateName: (row.inspection_templates as { name?: string } | null)?.name ?? null,
    status: row.status as string,
    overallRisk: (row.overall_risk as RiskLevel) ?? null,
    createdAt: row.created_at as string,
    submittedAt: (row.submitted_at as string) ?? null,
    observationCount: (row.observations as { count: number }[] | undefined)?.[0]?.count ?? 0,
  }));
}
