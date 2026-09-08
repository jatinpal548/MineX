/**
 * Offline-first write + read facade for the inspection workflow (Milestone 2B-2).
 *
 * WRITES: persist to SQLite + enqueue a sync op + kick the sync engine, then
 * return the client id IMMEDIATELY. The UI never waits on the network. When the
 * device is online the sync engine drains the op within a moment; when offline
 * it waits for reconnection. Nothing is lost.
 *
 * READS: online -> server (and the draft is cached locally); offline -> the
 * cached snapshot with any un-synced local edits overlaid.
 *
 * NOTE: starting a NEW inspection still needs connectivity (to pull the template
 * checklist). Everything after that - answers, observations, evidence, GPS, AI,
 * corrective actions, submit - works fully offline.
 */
import type { CorrectiveActionPriority, RiskLevel } from '@coalguard/types';
import { newId } from '@/lib/ids';
import * as repo from './repository';
import { OfflineError } from './repository';
import { discardPreparedEvidence, prepareEvidence, prepareVoiceNote } from './evidence';
import type { PendingImage } from '@/lib/media/types';
import type { PreparedEvidence } from './evidence';
import {
  clearInspectionLocal,
  deleteRecord,
  enqueue,
  getRecord,
  getRecords,
  getUnsyncedInspectionIds,
  putRecord,
  queueSummary,
} from './localStore';
import { runSync } from './syncEngine';
import type { DraftChecklistItem, DraftObservation, InspectionDraft } from './types';

const kick = () => {
  void runSync();
};

/* ------------------------------ start ------------------------------ */

export async function startInspectionOffline(args: {
  clientRef: string;
  templateId: string;
  templateName: string;
  inspectionType: string;
  mineId: string;
  departmentId: string | null;
  inspectorId: string;
}): Promise<string> {
  const id = newId();
  // online-only: needs the template checklist blueprint
  await repo.startInspection({ id, startedAt: new Date().toISOString(), ...args });
  const draft = await repo.fetchDraft(id);
  await putRecord('inspection', id, id, draft, 'synced');
  return id;
}

/* ---------------------------- checklist --------------------------- */

export async function saveResponsesOffline(
  inspectionId: string,
  items: DraftChecklistItem[],
): Promise<void> {
  const answered = items.filter((it) => it.response || it.notes.trim());
  if (answered.length === 0) return;
  for (const it of answered) {
    await putRecord('inspection_item', it.id, inspectionId, it, 'queued');
  }
  await enqueue({
    op: 'upsert_items',
    kind: 'inspection_item',
    recordId: `${inspectionId}:items`,
    inspectionId,
    args: { inspectionId, items: answered },
  });
  kick();
}

/* --------------------------- observation ------------------------- */

interface CreateObsArgs {
  id?: string;
  inspectionId: string;
  inspectionItemId: string | null;
  mineId: string;
  departmentId: string | null;
  raisedBy: string;
  title: string;
  description: string;
  category: string | null;
}

function draftObs(
  id: string,
  a: CreateObsArgs,
  extra: Partial<DraftObservation> = {},
): DraftObservation {
  return {
    id,
    inspectionItemId: a.inspectionItemId,
    checklistItemId: null,
    title: a.title.trim(),
    description: a.description.trim(),
    category: a.category,
    risk: 'medium',
    aiAnalysisId: null,
    aiRationale: null,
    aiRecommendations: [],
    aiSimulated: false,
    aiSource: null,
    correctiveActionId: null,
    correctiveActionPriority: null,
    evidenceCount: 0,
    hasLocation: false,
    ...extra,
  };
}

export async function createObservationOffline(a: CreateObsArgs): Promise<string> {
  const id = a.id ?? newId();
  await putRecord('observation', id, a.inspectionId, draftObs(id, a), 'queued');
  await enqueue({
    op: 'upsert_observation',
    kind: 'observation',
    recordId: id,
    inspectionId: a.inspectionId,
    dependsOn: a.inspectionItemId ?? null,
    args: {
      id,
      clientRef: id,
      inspectionId: a.inspectionId,
      inspectionItemId: a.inspectionItemId,
      mineId: a.mineId,
      departmentId: a.departmentId,
      raisedBy: a.raisedBy,
      title: a.title,
      description: a.description,
      category: a.category,
      occurredAt: new Date().toISOString(),
    },
  });
  kick();
  return id;
}

/**
 * Standalone "Quick Observation" - a hazard raised outside any inspection.
 * Reuses the SAME observations table + upsert_observation op; `inspection_id`
 * is null. Idempotent on the client id. Grouped locally by its own id so its
 * evidence / voice ops depend on it and its local footprint clears once synced.
 */
export async function saveQuickObservationOffline(args: {
  id: string;
  mineId: string;
  departmentId: string | null;
  raisedBy: string;
  title: string;
  description: string;
  category: string | null;
  risk: RiskLevel;
  gpsLatitude?: number | null;
  gpsLongitude?: number | null;
  ai?: {
    risk: RiskLevel;
    rationale: string;
    recommendations: string[];
    consequence: string;
    recommendedAction: string;
  } | null;
}): Promise<string> {
  const hasGps =
    typeof args.gpsLatitude === 'number' && typeof args.gpsLongitude === 'number';
  await putRecord(
    'observation',
    args.id,
    args.id,
    draftObs(args.id, {
      inspectionId: null as unknown as string,
      inspectionItemId: null,
      mineId: args.mineId,
      departmentId: args.departmentId,
      raisedBy: args.raisedBy,
      title: args.title,
      description: args.description,
      category: args.category,
    }, {
      risk: args.risk,
      hasLocation: hasGps,
      aiRationale: args.ai?.rationale ?? null,
      aiRecommendations: args.ai?.recommendations ?? [],
      aiSimulated: !!args.ai,
    }),
    'queued',
  );
  await enqueue({
    op: 'upsert_observation',
    kind: 'observation',
    recordId: args.id,
    inspectionId: args.id,
    args: {
      id: args.id,
      clientRef: args.id,
      inspectionId: null,
      inspectionItemId: null,
      mineId: args.mineId,
      departmentId: args.departmentId,
      raisedBy: args.raisedBy,
      title: args.title,
      description: args.description,
      category: args.category,
      occurredAt: new Date().toISOString(),
      ...(hasGps ? { gpsLatitude: args.gpsLatitude, gpsLongitude: args.gpsLongitude } : null),
    },
  });
  kick();
  return args.id;
}

/** Merge a patch into the locally-stored observation record (if there is one). */
export async function patchObservationLocal(
  inspectionId: string,
  observationId: string,
  patch: Partial<DraftObservation>,
): Promise<void> {
  const rec = await getRecord<DraftObservation>('observation', observationId);
  const base =
    rec?.payload ??
    draftObs(observationId, {
      inspectionId,
      inspectionItemId: null,
      mineId: '',
      departmentId: null,
      raisedBy: '',
      title: '',
      description: '',
      category: null,
    });
  await putRecord(
    'observation',
    observationId,
    inspectionId,
    { ...base, ...patch },
    rec?.syncState === 'synced' ? 'synced' : 'queued',
  );
}

export async function updateObservationOffline(args: {
  inspectionId: string;
  observationId: string;
  mineId: string;
  raisedBy: string;
  inspectionItemId: string | null;
  title: string;
  description: string;
  category: string | null;
  risk?: RiskLevel | null;
  gpsLatitude?: number | null;
  gpsLongitude?: number | null;
}): Promise<void> {
  const hasGps =
    typeof args.gpsLatitude === 'number' && typeof args.gpsLongitude === 'number';
  await patchObservationLocal(args.inspectionId, args.observationId, {
    title: args.title.trim(),
    description: args.description.trim(),
    category: args.category,
    ...(args.risk ? { risk: args.risk } : null),
    ...(hasGps ? { hasLocation: true } : null),
  });
  await enqueue({
    op: 'upsert_observation',
    kind: 'observation',
    recordId: args.observationId,
    inspectionId: args.inspectionId,
    dependsOn: args.inspectionItemId ?? null,
    args: {
      id: args.observationId,
      clientRef: args.observationId,
      inspectionId: args.inspectionId,
      inspectionItemId: args.inspectionItemId,
      mineId: args.mineId,
      departmentId: null,
      raisedBy: args.raisedBy,
      title: args.title,
      description: args.description,
      category: args.category,
      ...(hasGps
        ? { gpsLatitude: args.gpsLatitude, gpsLongitude: args.gpsLongitude }
        : null),
    },
  });
  kick();
}

/* ---------------------------- ai analysis ------------------------ */

export async function saveAiAnalysisOffline(args: {
  inspectionId: string;
  observationId: string;
  requestedBy: string;
  input: unknown;
  result: {
    risk: RiskLevel;
    rationale: string;
    recommendations: string[];
    simulated: boolean;
    source: 'server' | 'on-device';
    provider?: string;
    model?: string;
  };
}): Promise<string> {
  const id = newId();
  await patchObservationLocal(args.inspectionId, args.observationId, {
    risk: args.result.risk,
    aiAnalysisId: id,
    aiRationale: args.result.rationale,
    aiRecommendations: args.result.recommendations,
    aiSimulated: args.result.simulated,
    aiSource: args.result.source,
  });
  await enqueue({
    op: 'save_ai_analysis',
    kind: 'observation',
    recordId: args.observationId,
    inspectionId: args.inspectionId,
    dependsOn: args.observationId,
    args: {
      id,
      requestedBy: args.requestedBy,
      observationId: args.observationId,
      input: args.input,
      result: args.result,
    },
  });
  kick();
  return id;
}

/* ------------------------ corrective action -------------------- */

export async function createCorrectiveActionOffline(args: {
  inspectionId: string;
  observationId: string;
  mineId: string;
  title: string;
  description: string;
  priority: CorrectiveActionPriority;
}): Promise<string> {
  const id = newId();
  await patchObservationLocal(args.inspectionId, args.observationId, {
    correctiveActionId: id,
    correctiveActionPriority: args.priority,
  });
  await enqueue({
    op: 'upsert_corrective_action',
    kind: 'observation',
    recordId: args.observationId,
    inspectionId: args.inspectionId,
    dependsOn: args.observationId,
    args: {
      id,
      observationId: args.observationId,
      inspectionId: args.inspectionId,
      mineId: args.mineId,
      title: args.title,
      description: args.description,
      priority: args.priority,
    },
  });
  kick();
  return id;
}

/* ------------------------------ evidence ----------------------- */

export interface LocalEvidence {
  id: string;
  localUri: string;
  isSimulated: boolean;
  capturedAt: string;
  observationId: string;
}

export async function addEvidenceOffline(args: {
  image: PendingImage;
  inspectionId: string;
  mineId: string;
  observationId: string;
  uploadedBy: string;
  location?: { latitude?: number; longitude?: number; accuracy?: number | null } | null;
}): Promise<LocalEvidence> {
  const prepared: PreparedEvidence = await prepareEvidence(args.image);
  const rec: LocalEvidence = {
    id: prepared.id,
    localUri: prepared.localUri,
    isSimulated: prepared.isSimulated,
    capturedAt: prepared.capturedAt,
    observationId: args.observationId,
  };
  await putRecord('evidence', prepared.id, args.inspectionId, rec, 'queued');
  await patchObservationLocal(args.inspectionId, args.observationId, {
    hasLocation: Boolean(args.location?.latitude),
  });
  await enqueue({
    op: 'upload_evidence',
    kind: 'evidence',
    recordId: prepared.id,
    inspectionId: args.inspectionId,
    dependsOn: args.observationId,
    args: {
      id: prepared.id,
      localUri: prepared.localUri,
      fileSize: prepared.fileSize,
      isSimulated: prepared.isSimulated,
      capturedAt: prepared.capturedAt,
      mineId: args.mineId,
      inspectionId: args.inspectionId,
      observationId: args.observationId,
      uploadedBy: args.uploadedBy,
      location: args.location ?? null,
    },
  });
  kick();
  return rec;
}

/**
 * Evidence for an incident or a corrective action - same offline pipeline as
 * observation evidence, grouped locally by the parent id. `dependsOn` the parent
 * id so its create/upsert op runs first.
 */
export type EvidenceParent =
  | { kind: 'incident'; incidentId: string }
  | { kind: 'corrective_action'; correctiveActionId: string }
  | { kind: 'observation'; observationId: string; groupId?: string };

export async function addParentEvidenceOffline(args: {
  image: PendingImage;
  mineId: string;
  uploadedBy: string;
  parent: EvidenceParent;
  location?: { latitude?: number; longitude?: number; accuracy?: number | null } | null;
}): Promise<LocalEvidence> {
  const prepared: PreparedEvidence = await prepareEvidence(args.image);
  const p = args.parent;
  const parentId =
    p.kind === 'incident'
      ? p.incidentId
      : p.kind === 'corrective_action'
        ? p.correctiveActionId
        : p.observationId;
  const groupId = p.kind === 'observation' ? (p.groupId ?? p.observationId) : parentId;
  const rec: LocalEvidence = {
    id: prepared.id,
    localUri: prepared.localUri,
    isSimulated: prepared.isSimulated,
    capturedAt: prepared.capturedAt,
    observationId: p.kind === 'observation' ? p.observationId : '',
  };
  await putRecord('evidence', prepared.id, groupId, rec, 'queued');
  await enqueue({
    op: 'upload_evidence',
    kind: 'evidence',
    recordId: prepared.id,
    inspectionId: groupId,
    dependsOn: parentId,
    args: {
      id: prepared.id,
      localUri: prepared.localUri,
      fileSize: prepared.fileSize,
      isSimulated: prepared.isSimulated,
      capturedAt: prepared.capturedAt,
      mineId: args.mineId,
      uploadedBy: args.uploadedBy,
      ...(p.kind === 'incident'
        ? { incidentId: p.incidentId }
        : p.kind === 'corrective_action'
          ? { correctiveActionId: p.correctiveActionId }
          : { observationId: p.observationId }),
      location: args.location ?? null,
    },
  });
  kick();
  return rec;
}

/** Drop a not-yet-uploaded local photo (its file + record + queued op). */
export async function cancelEvidenceOffline(id: string, localUri: string): Promise<void> {
  await discardPreparedEvidence(localUri);
  await deleteRecord('evidence', id);
}

/* --------------------------- voice notes --------------------------- */

export interface LocalVoiceNote {
  id: string;
  localUri: string;
  durationMs: number;
  capturedAt: string;
  observationId?: string;
}

/**
 * Queue a recorded voice note for upload (evidence_type = 'voice_note').
 * Same offline pipeline as photos: local file + `records` row + `upload_voice_note`
 * queue op that depends on its parent so ordering + retry + idempotency hold.
 */
export async function addVoiceNoteOffline(args: {
  recording: { uri: string; durationMs: number; sizeBytes: number | null };
  mineId: string;
  uploadedBy: string;
  parent:
    | { kind: 'observation'; inspectionId: string; observationId: string }
    | { kind: 'incident'; incidentId: string }
    | { kind: 'corrective_action'; correctiveActionId: string };
}): Promise<LocalVoiceNote> {
  const prepared = await prepareVoiceNote({
    uri: args.recording.uri,
    durationMs: args.recording.durationMs,
    sizeBytes: args.recording.sizeBytes,
  });

  const groupId =
    args.parent.kind === 'observation'
      ? args.parent.inspectionId
      : args.parent.kind === 'incident'
        ? args.parent.incidentId
        : args.parent.correctiveActionId;
  const dependsOn =
    args.parent.kind === 'observation'
      ? args.parent.observationId
      : args.parent.kind === 'incident'
        ? args.parent.incidentId
        : args.parent.correctiveActionId;

  const rec: LocalVoiceNote = {
    id: prepared.id,
    localUri: prepared.localUri,
    durationMs: prepared.durationMs,
    capturedAt: prepared.capturedAt,
    ...(args.parent.kind === 'observation' ? { observationId: args.parent.observationId } : null),
  };
  await putRecord('evidence', prepared.id, groupId, rec, 'queued');
  await enqueue({
    op: 'upload_voice_note',
    kind: 'evidence',
    recordId: prepared.id,
    inspectionId: groupId,
    dependsOn,
    args: {
      id: prepared.id,
      localUri: prepared.localUri,
      durationMs: prepared.durationMs,
      fileSize: prepared.fileSize,
      capturedAt: prepared.capturedAt,
      mineId: args.mineId,
      uploadedBy: args.uploadedBy,
      ...(args.parent.kind === 'observation'
        ? { observationId: args.parent.observationId }
        : args.parent.kind === 'incident'
          ? { incidentId: args.parent.incidentId }
          : { correctiveActionId: args.parent.correctiveActionId }),
    },
  });
  kick();
  return rec;
}

export async function cancelVoiceNoteOffline(id: string, localUri: string): Promise<void> {
  await discardPreparedEvidence(localUri);
  await deleteRecord('evidence', id);
}

/* ------------------------------- submit ----------------------- */

export async function submitInspectionOffline(
  draft: InspectionDraft,
): Promise<{ status: 'submitted'; synced: boolean }> {
  const submitted: InspectionDraft = {
    ...draft,
    status: 'submitted',
    submittedAt: new Date().toISOString(),
  };
  await putRecord('inspection', draft.id, draft.id, submitted, 'queued');
  await enqueue({
    op: 'submit_inspection',
    kind: 'inspection',
    recordId: draft.id,
    inspectionId: draft.id,
    args: { draft: submitted },
  });
  kick();
  const summary = await queueSummary(draft.id);
  // give the engine a beat to flush if we're online
  await new Promise((r) => setTimeout(r, 400));
  const after = await queueSummary(draft.id);
  return { status: 'submitted', synced: after.total === 0 && summary.total >= 0 };
}

/* --------------------------- delete draft -------------------- */

/**
 * Abandon an in-progress draft: cancel it on the server (RLS-safe status change)
 * then wipe its local SQLite footprint, queued sync ops and any local evidence
 * files. Only works for drafts that have NOT been submitted. Needs a connection
 * (the draft always exists server-side once started).
 */
export async function deleteDraftOffline(inspectionId: string): Promise<void> {
  // 1. server: in_progress -> cancelled (throws OfflineError when offline,
  //    or a plain Error if it was already submitted)
  await repo.deleteDraftInspection(inspectionId);

  // 2. local evidence files for this draft
  try {
    const records = await getRecords(inspectionId);
    for (const rec of records) {
      if (rec.kind === 'evidence') {
        const uri = (rec.payload as LocalEvidence)?.localUri;
        if (uri) await discardPreparedEvidence(uri).catch(() => {});
      }
    }
  } catch {
    /* non-fatal - the DB rows are cleared next */
  }

  // 3. local records + queued ops
  await clearInspectionLocal(inspectionId);
}

/* ------------------------------- reads ----------------------- */

function overlay(
  base: InspectionDraft,
  records: Awaited<ReturnType<typeof getRecords>>,
): InspectionDraft {
  const items = base.items.map((it) => ({ ...it }));
  const observations = base.observations.map((o) => ({ ...o }));

  for (const rec of records) {
    if (rec.syncState === 'synced') continue;
    if (rec.kind === 'inspection_item') {
      const p = rec.payload as DraftChecklistItem;
      const match =
        items.find((i) => i.id === p.id) ||
        items.find((i) => i.checklistItemId && i.checklistItemId === p.checklistItemId);
      if (match) {
        match.id = p.id;
        match.response = p.response;
        match.notes = p.notes;
      }
    } else if (rec.kind === 'observation') {
      const p = rec.payload as DraftObservation;
      const i = observations.findIndex((o) => o.id === p.id);
      if (i >= 0) observations[i] = { ...observations[i], ...p };
      else observations.push(p);
      const linked = items.find((it) => it.id === p.inspectionItemId);
      if (linked) linked.observationId = p.id;
    } else if (rec.kind === 'evidence') {
      const p = rec.payload as LocalEvidence & Partial<LocalVoiceNote>;
      const isVoice = typeof p.durationMs === 'number';
      const o = observations.find((ob) => ob.id === p.observationId);
      if (o && !isVoice) o.evidenceCount += 1;
      if (o && isVoice) o.voiceCount = (o.voiceCount ?? 0) + 1;
    }
  }
  return { ...base, items, observations };
}

export async function loadDraftOffline(id: string): Promise<InspectionDraft> {
  try {
    const server = await repo.fetchDraft(id);
    await putRecord('inspection', id, id, server, 'synced');
    const records = await getRecords(id);
    const pending = records.filter((r) => r.kind !== 'inspection' && r.syncState !== 'synced');
    return pending.length ? overlay(server, pending) : server;
  } catch (e) {
    if (!(e instanceof OfflineError)) throw e;
    const cached = await getRecord<InspectionDraft>('inspection', id);
    if (!cached) {
      throw new Error('This inspection is not available offline. Reconnect and try again.');
    }
    const records = await getRecords(id);
    return overlay(
      cached.payload,
      records.filter((r) => r.kind !== 'inspection'),
    );
  }
}

export async function listInspectionsOffline(): Promise<repo.InspectionListRow[]> {
  let server: repo.InspectionListRow[] = [];
  let offline = false;
  try {
    server = await repo.fetchInspectionList();
  } catch (e) {
    if (!(e instanceof OfflineError)) throw e;
    offline = true;
  }

  const byId = new Map(server.map((r) => [r.id, { ...r } as repo.InspectionListRow]));
  const localIds = await getUnsyncedInspectionIds();

  for (const lid of localIds) {
    const q = await queueSummary(lid);
    const state: repo.InspectionListRow['syncState'] =
      q.failed > 0 ? 'failed' : q.syncing > 0 ? 'syncing' : q.total > 0 ? 'queued' : 'synced';

    const rec = await getRecord<InspectionDraft>('inspection', lid);
    const d = rec?.payload;

    // progress detail from the local snapshot + un-synced overlay (no network)
    let answered: number | undefined;
    let itemCount: number | undefined;
    let photoCount: number | undefined;
    let hasLocation: boolean | undefined;
    if (d) {
      const local = await getRecords(lid);
      const merged = overlay(
        d,
        local.filter((r) => r.kind !== 'inspection'),
      );
      answered = merged.items.filter((it) => it.response).length;
      itemCount = merged.items.length;
      photoCount = merged.observations.reduce((s, o) => s + (o.evidenceCount ?? 0), 0);
      hasLocation = merged.observations.some((o) => o.hasLocation);
    }

    const existing = byId.get(lid);
    if (existing) {
      existing.syncState = state;
      if (answered !== undefined) {
        existing.answered = answered;
        existing.itemCount = itemCount;
        existing.photoCount = photoCount;
        existing.hasLocation = hasLocation;
      }
      continue;
    }
    if (!d) continue;
    byId.set(lid, {
      id: lid,
      title: d.title,
      templateName: d.templateName,
      status: d.status,
      overallRisk: d.overallRisk,
      createdAt: d.startedAt ?? new Date().toISOString(),
      submittedAt: d.submittedAt,
      observationCount: d.observations.length,
      syncState: state,
      answered,
      itemCount,
      photoCount,
      hasLocation,
    });
  }

  const rows = [...byId.values()];
  if (offline) rows.sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
  return rows;
}
