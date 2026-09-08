/**
 * Offline-first incident capture. Same SQLite `records` + `sync_queue` + sync
 * engine as the inspection workflow - NOT a second offline system.
 *
 *   saveIncidentOffline()  -> writes the local record, enqueues `upsert_incident`,
 *                             returns immediately. Evidence photos attach with
 *                             `addParentEvidenceOffline({ parent: { kind:'incident' } })`
 *                             and depend on this op.
 *   listIncidentsOffline() -> server rows (online) merged with any not-yet-synced
 *                             local drafts, tagged with their sync state.
 */
import { OfflineError } from '@/features/inspection/repository';
import {
  enqueue,
  getRecord,
  getRecords,
  putRecord,
  queueSummary,
} from '@/features/inspection/localStore';
import { runSync } from '@/features/inspection/syncEngine';
import { getDb } from '@/lib/db';
import * as repo from './repository';
import { DB_TO_UI_SEVERITY, parseIncidentDescription, type IncidentDraft, type IncidentListRow } from './types';

const kick = () => {
  void runSync();
};

export async function saveIncidentOffline(draft: IncidentDraft): Promise<string> {
  await putRecord('incident', draft.id, draft.id, draft, 'queued');
  await enqueue({
    op: 'upsert_incident',
    kind: 'incident',
    recordId: draft.id,
    inspectionId: draft.id,
    args: { draft },
  });
  kick();
  return draft.id;
}

export async function listIncidentsOffline(reportedBy: string): Promise<IncidentListRow[]> {
  let server: IncidentListRow[] = [];
  let offline = false;
  try {
    server = await repo.fetchMyIncidents(reportedBy);
  } catch (e) {
    if (!(e instanceof OfflineError)) throw e;
    offline = true;
  }

  const byId = new Map(server.map((r) => [r.id, { ...r } as IncidentListRow]));

  // merge not-yet-synced local drafts (their local record id == their own id)
  const draftIds = await incidentDraftIds();
  for (const id of draftIds) {
    const q = await queueSummary(id);
    const state: IncidentListRow['syncState'] =
      q.failed > 0 ? 'failed' : q.syncing > 0 ? 'syncing' : q.total > 0 ? 'queued' : undefined;
    const existing = byId.get(id);
    if (existing) {
      existing.syncState = state;
      continue;
    }
    const rec = await getRecord<IncidentDraft>('incident', id);
    if (!rec) continue;
    const d = rec.payload;
    const evi = await getRecords(id);
    byId.set(id, {
      id,
      title: d.title,
      type: d.type,
      severity: d.severity,
      status: 'reported',
      occurredAt: d.occurredAt,
      mineName: null,
      hasLocation: typeof d.gpsLatitude === 'number',
      evidenceCount: evi.filter((r) => r.kind === 'evidence').length,
      syncState: state ?? 'queued',
    });
  }

  const rows = [...byId.values()];
  rows.sort((a, b) => (b.occurredAt > a.occurredAt ? 1 : -1));
  void offline;
  return rows;
}

/** Local `incident` record ids (their inspection_id == their own id). */
async function incidentDraftIds(): Promise<string[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ id: string }>(
    "SELECT id FROM records WHERE kind = 'incident'",
  );
  return rows.map((r) => r.id);
}

/** For the detail screen when the incident is still a local-only draft. */
export async function getIncidentDraftLocal(id: string): Promise<repo.IncidentDetail | null> {
  const rec = await getRecord<IncidentDraft>('incident', id);
  if (!rec) return null;
  const d = rec.payload;
  return {
    id: d.id,
    title: d.title,
    type: d.type,
    severity: d.severity,
    status: 'reported',
    occurredAt: d.occurredAt,
    mineName: null,
    hasLocation: typeof d.gpsLatitude === 'number',
    evidenceCount: 0,
    description: d.description,
    reporterName: null,
    reportedAt: d.createdAt,
    gps:
      typeof d.gpsLatitude === 'number' && typeof d.gpsLongitude === 'number'
        ? { lat: d.gpsLatitude, lng: d.gpsLongitude }
        : null,
    ai:
      d.aiRisk || d.aiConsequence
        ? {
            risk: d.aiRisk,
            consequence: d.aiConsequence,
            recommendedAction: d.aiRecommendedAction,
            simulated: d.aiSimulated,
          }
        : null,
  };
}

export { DB_TO_UI_SEVERITY, parseIncidentDescription };
