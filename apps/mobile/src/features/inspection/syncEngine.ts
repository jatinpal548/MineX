/**
 * Sync engine (Milestone 2B-2).
 *
 * Drains `sync_queue` in insertion order, calling the same Supabase functions
 * the online path uses. Guarantees:
 *   - one drain at a time (module mutex)
 *   - dependency order preserved (queue seq + per-op `depends_on`)
 *   - idempotent replay (every insert is an upsert on a client UUID)
 *   - retry with an attempt cap; a permanently failing op is marked FAILED, it
 *     does not block other inspections
 *   - a network failure stops the drain (resume on reconnect); it never
 *     discards data
 *   - a 401 / expired session sets `auth_expired`, keeps the queue, and stops
 */
import {
  createCorrectiveAction,
  createObservation,
  saveAiAnalysis,
  saveResponses,
  startInspection,
  submitInspection,
  updateObservation,
  AuthExpiredError,
  OfflineError,
} from './repository';
import { uploadPreparedEvidence, uploadPreparedVoiceNote } from './evidence';
import { upsertIncident } from '@/features/incident/repository';
import {
  clearInspectionLocal,
  failOp,
  getRecords,
  markOp,
  nextRunnableOp,
  opsForInspection,
  requeueOp,
  setRecordState,
  SYNC_MAX_ATTEMPTS,
  type QueueOp,
  type SyncOp,
} from './localStore';
import { metaGet, metaSet } from '@/lib/db';
import { getOnline } from '@/lib/connectivity';

/* ----------------------------- op handlers ------------------------- */

type Args = Record<string, unknown>;
type Runner = (a: Args) => Promise<void>;

const as = <T>(v: unknown): T => v as unknown as T;

const HANDLERS: Record<SyncOp, Runner> = {
  async upsert_inspection(a) {
    await startInspection(as(a));
  },
  async upsert_items(a) {
    await saveResponses(a.inspectionId as string, as(a.items));
  },
  async upsert_observation(a) {
    await createObservation(as(a));
  },
  async save_ai_analysis(a) {
    const analysisId = await saveAiAnalysis(as(a));
    const result = a.result as { risk: Parameters<typeof updateObservation>[1]['risk'] };
    await updateObservation(a.observationId as string, {
      risk: result.risk,
      aiAnalysisId: analysisId,
    });
  },
  async upsert_corrective_action(a) {
    await createCorrectiveAction(as(a));
  },
  async upload_evidence(a) {
    await uploadPreparedEvidence(as(a));
  },
  async upload_voice_note(a) {
    await uploadPreparedVoiceNote(as(a));
  },
  async submit_inspection(a) {
    await submitInspection(as(a.draft));
  },
  async upsert_incident(a) {
    await upsertIncident(as(a.draft));
  },
};

/* --------------------------- drain loop ---------------------------- */

let running = false;
const listeners = new Set<() => void>();

export function onSyncChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function notify() {
  listeners.forEach((l) => l());
}

export function isSyncing(): boolean {
  return running;
}

export async function isAuthExpired(): Promise<boolean> {
  return (await metaGet('auth_expired')) === '1';
}
export async function clearAuthExpired(): Promise<void> {
  await metaSet('auth_expired', '0');
}

/** Run the queue. Safe to call often; no-ops if already running / offline. */
export async function runSync(): Promise<void> {
  if (running) return;
  if (!getOnline()) return;
  if ((await metaGet('auth_expired')) === '1') return;

  running = true;
  notify();
  const touched = new Set<string>();

  try {
    // guard: only a handful of ops per drain pass, then re-schedule, so a huge
    // queue can't lock the JS thread.
    for (let i = 0; i < 200; i += 1) {
      if (!getOnline()) break;
      const op: QueueOp | null = await nextRunnableOp();
      if (!op) break;

      await markOp(op.seq, 'syncing');
      await setRecordState(op.kind, op.recordId, 'syncing');
      notify();

      try {
        await HANDLERS[op.op](op.args as Args);
        await markOp(op.seq, 'done');
        await setRecordState(op.kind, op.recordId, 'synced');
        touched.add(op.inspectionId);
      } catch (e) {
        if (e instanceof OfflineError) {
          await requeueOp(op.seq);
          break; // stop; resume when back online
        }
        if (e instanceof AuthExpiredError) {
          await metaSet('auth_expired', '1');
          await requeueOp(op.seq);
          break;
        }
        const msg = e instanceof Error ? e.message : 'Sync failed';
        const terminal = op.attempts + 1 >= SYNC_MAX_ATTEMPTS;
        await failOp(op.seq, msg, terminal);
        await setRecordState(op.kind, op.recordId, terminal ? 'failed' : 'queued');
        // continue to the next op (a bad op must not block another inspection)
      }
      notify();
    }

    // any inspection whose queue is fully done -> hand it back to the server
    for (const inspId of touched) {
      const ops = await opsForInspection(inspId);
      const stillOpen = ops.some((o) => o.status !== 'done');
      if (!stillOpen) {
        const recs = await getRecords(inspId);
        if (recs.every((r) => r.syncState === 'synced')) {
          await clearInspectionLocal(inspId);
        }
      }
    }
  } finally {
    running = false;
    notify();
  }
}
