/**
 * Local persistence for offline inspection capture. Thin CRUD over the SQLite
 * `records` + `sync_queue` tables (see src/lib/db). No React here.
 */
import { getDb } from '@/lib/db';

export type RecordKind =
  | 'inspection'
  | 'inspection_item'
  | 'observation'
  | 'evidence'
  | 'incident';
export type SyncState = 'local' | 'queued' | 'syncing' | 'synced' | 'failed';
export type SyncOp =
  | 'upsert_inspection'
  | 'upsert_items'
  | 'upsert_observation'
  | 'save_ai_analysis'
  | 'upsert_corrective_action'
  | 'upload_evidence'
  | 'upload_voice_note'
  | 'submit_inspection'
  | 'upsert_incident';

export const SYNC_MAX_ATTEMPTS = 6;

export interface LocalRecord<T = unknown> {
  kind: RecordKind;
  id: string;
  inspectionId: string;
  payload: T;
  syncState: SyncState;
  updatedAt: string;
}

export interface QueueOp {
  seq: number;
  op: SyncOp;
  kind: RecordKind;
  recordId: string;
  inspectionId: string;
  args: unknown;
  dependsOn: string | null;
  attempts: number;
  lastError: string | null;
  status: 'pending' | 'syncing' | 'done' | 'failed';
  createdAt: string;
}

/* -------------------------------- records --------------------------- */

export async function putRecord<T>(
  kind: RecordKind,
  id: string,
  inspectionId: string,
  payload: T,
  syncState: SyncState = 'local',
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO records (kind, id, inspection_id, payload, sync_state, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(kind, id) DO UPDATE SET
       payload = excluded.payload,
       sync_state = excluded.sync_state,
       updated_at = excluded.updated_at`,
    kind,
    id,
    inspectionId,
    JSON.stringify(payload),
    syncState,
    new Date().toISOString(),
  );
}

export async function setRecordState(
  kind: RecordKind,
  id: string,
  syncState: SyncState,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'UPDATE records SET sync_state = ? WHERE kind = ? AND id = ?',
    syncState,
    kind,
    id,
  );
}

export async function deleteRecord(kind: RecordKind, id: string): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM records WHERE kind = ? AND id = ?', kind, id);
    await db.runAsync("DELETE FROM sync_queue WHERE record_id = ? AND status != 'done'", id);
  });
}

export async function getRecords(inspectionId: string): Promise<LocalRecord[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    kind: RecordKind;
    id: string;
    inspection_id: string;
    payload: string;
    sync_state: SyncState;
    updated_at: string;
  }>('SELECT * FROM records WHERE inspection_id = ?', inspectionId);
  return rows.map((r) => ({
    kind: r.kind,
    id: r.id,
    inspectionId: r.inspection_id,
    payload: JSON.parse(r.payload),
    syncState: r.sync_state,
    updatedAt: r.updated_at,
  }));
}

export async function getRecord<T>(kind: RecordKind, id: string): Promise<LocalRecord<T> | null> {
  const db = await getDb();
  const r = await db.getFirstAsync<{
    kind: RecordKind;
    id: string;
    inspection_id: string;
    payload: string;
    sync_state: SyncState;
    updated_at: string;
  }>('SELECT * FROM records WHERE kind = ? AND id = ?', kind, id);
  if (!r) return null;
  return {
    kind: r.kind,
    id: r.id,
    inspectionId: r.inspection_id,
    payload: JSON.parse(r.payload) as T,
    syncState: r.sync_state,
    updatedAt: r.updated_at,
  };
}

/** Local inspections that are NOT yet fully synced (for the merged list). */
export async function getUnsyncedInspectionIds(): Promise<string[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ inspection_id: string }>(
    "SELECT DISTINCT inspection_id FROM records WHERE kind = 'inspection'",
  );
  return rows.map((r) => r.inspection_id);
}

/** Wipe an inspection's local footprint once the server has everything. */
export async function clearInspectionLocal(inspectionId: string): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM records WHERE inspection_id = ?', inspectionId);
    await db.runAsync('DELETE FROM sync_queue WHERE inspection_id = ?', inspectionId);
  });
}

/* ------------------------------ sync queue -------------------------- */

export async function enqueue(args: {
  op: SyncOp;
  kind: RecordKind;
  recordId: string;
  inspectionId: string;
  args: unknown;
  dependsOn?: string | null;
}): Promise<void> {
  const db = await getDb();
  // de-dupe: if a pending op for the same record+op already exists, replace its args
  const existing = await db.getFirstAsync<{ seq: number }>(
    "SELECT seq FROM sync_queue WHERE record_id = ? AND op = ? AND status = 'pending'",
    args.recordId,
    args.op,
  );
  if (existing) {
    await db.runAsync(
      'UPDATE sync_queue SET args = ?, attempts = 0, last_error = NULL WHERE seq = ?',
      JSON.stringify(args.args),
      existing.seq,
    );
    return;
  }
  await db.runAsync(
    `INSERT INTO sync_queue (op, kind, record_id, inspection_id, args, depends_on, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args.op,
    args.kind,
    args.recordId,
    args.inspectionId,
    JSON.stringify(args.args),
    args.dependsOn ?? null,
    new Date().toISOString(),
  );
}

function mapOp(r: Record<string, unknown>): QueueOp {
  return {
    seq: r.seq as number,
    op: r.op as SyncOp,
    kind: r.kind as RecordKind,
    recordId: r.record_id as string,
    inspectionId: r.inspection_id as string,
    args: JSON.parse(r.args as string),
    dependsOn: (r.depends_on as string) ?? null,
    attempts: r.attempts as number,
    lastError: (r.last_error as string) ?? null,
    status: r.status as QueueOp['status'],
    createdAt: r.created_at as string,
  };
}

/** Next op to run: lowest seq, pending, under the attempt cap, deps satisfied. */
export async function nextRunnableOp(): Promise<QueueOp | null> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    "SELECT * FROM sync_queue WHERE status = 'pending' AND attempts < ? ORDER BY seq ASC",
    SYNC_MAX_ATTEMPTS,
  );
  for (const raw of rows) {
    const op = mapOp(raw);
    if (!op.dependsOn) return op;
    const dep = await db.getFirstAsync<{ status: string }>(
      "SELECT status FROM sync_queue WHERE record_id = ? AND status != 'done' LIMIT 1",
      op.dependsOn,
    );
    if (!dep) return op; // all ops for the dependency are done
  }
  return null;
}

export async function markOp(seq: number, status: QueueOp['status']): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE sync_queue SET status = ? WHERE seq = ?', status, seq);
}

export async function failOp(seq: number, error: string, terminal: boolean): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'UPDATE sync_queue SET attempts = attempts + 1, last_error = ?, status = ? WHERE seq = ?',
    error,
    terminal ? 'failed' : 'pending',
    seq,
  );
}

export async function requeueOp(seq: number): Promise<void> {
  const db = await getDb();
  await db.runAsync("UPDATE sync_queue SET status = 'pending' WHERE seq = ?", seq);
}

export async function retryFailedOps(): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "UPDATE sync_queue SET status = 'pending', attempts = 0 WHERE status = 'failed'",
  );
}

export interface QueueSummary {
  pending: number;
  syncing: number;
  failed: number;
  total: number;
}

export async function queueSummary(inspectionId?: string): Promise<QueueSummary> {
  const db = await getDb();
  const where = inspectionId ? 'WHERE inspection_id = ?' : '';
  const params = inspectionId ? [inspectionId] : [];
  const rows = await db.getAllAsync<{ status: string; n: number }>(
    `SELECT status, COUNT(*) n FROM sync_queue ${where} GROUP BY status`,
    ...params,
  );
  const s: QueueSummary = { pending: 0, syncing: 0, failed: 0, total: 0 };
  for (const r of rows) {
    if (r.status === 'pending') s.pending = r.n;
    else if (r.status === 'syncing') s.syncing = r.n;
    else if (r.status === 'failed') s.failed = r.n;
    if (r.status !== 'done') s.total += r.n;
  }
  return s;
}

export async function opsForInspection(inspectionId: string): Promise<QueueOp[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    'SELECT * FROM sync_queue WHERE inspection_id = ? ORDER BY seq ASC',
    inspectionId,
  );
  return rows.map(mapOp);
}
