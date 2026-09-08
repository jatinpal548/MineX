/**
 * Corrective actions - mobile data layer.
 *
 * Pure async functions over the RLS-scoped Supabase client (anon key + the
 * signed-in user's JWT). No service role. Reuses the SAME `corrective_actions`,
 * `audit_logs`, `evidence` and `notify_governance` primitives the web
 * governance loop uses - this is not a second architecture.
 */
import type {
  CorrectiveActionPriority,
  CorrectiveActionStatus,
  RiskLevel,
} from '@coalguard/types';
import { supabase } from '@/lib/supabase';
import { OfflineError, AuthExpiredError } from '@/features/inspection/repository';

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
  console.warn('[corrective-actions]', message, cause);
  throw new Error(e?.code ? `${message} (${e.code})` : message);
}

/* -------------------------------- shapes -------------------------------- */

export interface CorrectiveActionRow {
  id: string;
  title: string;
  description: string | null;
  priority: CorrectiveActionPriority;
  status: CorrectiveActionStatus;
  dueDate: string | null;
  createdAt: string;
  assignedAt: string | null;
  submittedAt: string | null;
  assignedToId: string | null;
  assignedToName: string | null;
  assignedById: string | null;
  verifiedByName: string | null;
  mineName: string | null;
  observation: { id: string; title: string; risk: RiskLevel } | null;
  /** derived */
  overdue: boolean;
  daysToDue: number | null;
}

export interface CorrectiveActionSummary {
  open: number;
  overdue: number;
  dueSoon: number;
  awaitingVerification: number;
}

const DAY = 86_400_000;
const OPEN_STATUSES: CorrectiveActionStatus[] = [
  'open',
  'assigned',
  'in_progress',
  'submitted',
  'overdue',
  'rejected',
];

function mapRow(r: Record<string, unknown>): CorrectiveActionRow {
  const one = <T>(v: unknown): T | null => (Array.isArray(v) ? ((v[0] as T) ?? null) : ((v as T) ?? null));
  const assignee = one<{ full_name?: string }>(r.assignee);
  const verifier = one<{ full_name?: string }>(r.verifier);
  const mine = one<{ name?: string }>(r.mine);
  const obs = one<{ id?: string; title?: string; risk?: RiskLevel }>(r.observation);
  const status = r.status as CorrectiveActionStatus;
  const dueDate = (r.due_date as string) ?? null;
  const daysToDue = dueDate ? Math.round((new Date(dueDate).getTime() - Date.now()) / DAY) : null;
  const done = status === 'verified' || status === 'closed';
  return {
    id: r.id as string,
    title: r.title as string,
    description: (r.description as string) ?? null,
    priority: r.priority as CorrectiveActionPriority,
    status,
    dueDate,
    createdAt: r.created_at as string,
    assignedAt: (r.assigned_at as string) ?? null,
    submittedAt: (r.submitted_at as string) ?? null,
    assignedToId: (r.assigned_to as string) ?? null,
    assignedToName: assignee?.full_name ?? null,
    assignedById: (r.assigned_by as string) ?? null,
    verifiedByName: verifier?.full_name ?? null,
    mineName: mine?.name ?? null,
    observation: obs?.id ? { id: obs.id, title: obs.title ?? 'Observation', risk: obs.risk ?? 'medium' } : null,
    overdue: !done && daysToDue !== null && daysToDue < 0,
    daysToDue,
  };
}

const SELECT = `
  id, title, description, priority, status, due_date, created_at, assigned_at, submitted_at,
  assigned_to, assigned_by,
  assignee:profiles!corrective_actions_assigned_to_fkey(full_name),
  verifier:profiles!corrective_actions_verified_by_fkey(full_name),
  mine:mines!corrective_actions_mine_id_fkey(name),
  observation:observations!corrective_actions_observation_id_fkey(id, title, risk)
`;

/** All corrective actions the caller can see (RLS-scoped). */
export async function listCorrectiveActions(opts?: {
  assignedToMe?: string;
}): Promise<CorrectiveActionRow[]> {
  let q = supabase
    .from('corrective_actions')
    .select(SELECT)
    .order('due_date', { ascending: true, nullsFirst: false })
    .limit(200);
  if (opts?.assignedToMe) q = q.eq('assigned_to', opts.assignedToMe);
  const { data, error } = await q;
  if (error) fail('Could not load corrective actions.', error);
  return (data ?? []).map((r) => mapRow(r as Record<string, unknown>));
}

export function summarise(rows: CorrectiveActionRow[]): CorrectiveActionSummary {
  return {
    open: rows.filter((r) => OPEN_STATUSES.includes(r.status)).length,
    overdue: rows.filter((r) => r.overdue).length,
    dueSoon: rows.filter(
      (r) => !r.overdue && r.daysToDue !== null && r.daysToDue >= 0 && r.daysToDue <= 3,
    ).length,
    awaitingVerification: rows.filter((r) => r.status === 'submitted').length,
  };
}

export interface CorrectiveActionDetail extends CorrectiveActionRow {
  closureNotes: string | null;
  rejectionReason: string | null;
  observationDescription: string | null;
  timeline: { key: string; label: string; at: string; note?: string | null }[];
}

export async function getCorrectiveActionDetail(id: string): Promise<CorrectiveActionDetail | null> {
  const { data, error } = await supabase
    .from('corrective_actions')
    .select(
      `${SELECT}, closure_notes, rejection_reason, verified_at, closed_at,
       observation:observations!corrective_actions_observation_id_fkey(id, title, risk, description)`,
    )
    .eq('id', id)
    .maybeSingle();
  if (error) fail('Could not load the corrective action.', error);
  if (!data) return null;

  const base = mapRow(data as Record<string, unknown>);
  const r = data as Record<string, unknown>;
  const obs = Array.isArray(r.observation) ? r.observation[0] : r.observation;

  const { data: logs } = await supabase
    .from('audit_logs')
    .select('id, action, created_at, after, actor:profiles!audit_logs_actor_id_fkey(full_name)')
    .eq('entity_type', 'corrective_action')
    .eq('entity_id', id)
    .order('created_at', { ascending: true });

  const LABEL: Record<string, string> = {
    'corrective_action.assigned': 'Assigned',
    'corrective_action.progress': 'Progress updated',
    'corrective_action.status': 'Status changed',
    'corrective_action.submitted': 'Submitted for verification',
    'corrective_action.verified': 'Verified & closed',
    'corrective_action.rejected': 'Rejected',
    'corrective_action.note': 'Note added',
  };
  const timeline: CorrectiveActionDetail['timeline'] = [
    { key: 'created', label: 'Created', at: base.createdAt },
    ...((logs ?? []) as Record<string, unknown>[]).map((l, i) => {
      const after = (l.after ?? {}) as { note?: string };
      return {
        key: `log-${i}`,
        label: LABEL[l.action as string] ?? (l.action as string),
        at: l.created_at as string,
        note: after.note ?? null,
      };
    }),
  ];
  if (base.submittedAt && !timeline.some((t) => t.label.startsWith('Submitted')))
    timeline.push({ key: 'submitted', label: 'Submitted for verification', at: base.submittedAt });

  return {
    ...base,
    closureNotes: (r.closure_notes as string) ?? null,
    rejectionReason: (r.rejection_reason as string) ?? null,
    observationDescription: (obs?.description as string) ?? null,
    timeline,
  };
}

/* ------------------------------ transitions ---------------------------- */

async function writeAudit(args: {
  caId: string;
  mineId: string | null;
  action: string;
  note?: string | null;
  actorId: string;
}): Promise<void> {
  // audit is best-effort - a failed insert must not block the workflow
  await supabase
    .from('audit_logs')
    .insert({
      actor_id: args.actorId,
      action: args.action,
      entity_type: 'corrective_action',
      entity_id: args.caId,
      mine_id: args.mineId,
      after: args.note ? { note: args.note } : {},
    })
    .then(undefined, () => {});
}

async function notify(caId: string, recipient: string | null, kind: string): Promise<void> {
  if (!recipient) return;
  await supabase.rpc('notify_governance', { p_ca_id: caId, p_recipient: recipient, p_kind: kind }).then(
    undefined,
    () => {},
  );
}

/** assignee: assigned -> in_progress */
export async function startCorrectiveAction(row: CorrectiveActionRow, actorId: string): Promise<void> {
  const { error } = await supabase
    .from('corrective_actions')
    .update({ status: 'in_progress' })
    .eq('id', row.id)
    .in('status', ['assigned', 'rejected', 'overdue']);
  if (error) fail('Could not start the corrective action.', error);
  await writeAudit({ caId: row.id, mineId: null, action: 'corrective_action.status', actorId, note: 'Started' });
}

/** assignee: add a progress note (appended to closure_notes + audit trail) */
export async function addCorrectiveActionNote(
  row: CorrectiveActionRow,
  note: string,
  actorId: string,
): Promise<void> {
  const stamp = new Date().toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  const { data: cur } = await supabase
    .from('corrective_actions')
    .select('closure_notes')
    .eq('id', row.id)
    .maybeSingle();
  const prev = (cur?.closure_notes as string) ?? '';
  const next = `${prev ? prev + '\n' : ''}[${stamp}] ${note.trim()}`;
  const { error } = await supabase
    .from('corrective_actions')
    .update({ closure_notes: next })
    .eq('id', row.id);
  if (error) fail('Could not save the note.', error);
  await writeAudit({ caId: row.id, mineId: null, action: 'corrective_action.note', actorId, note: note.trim() });
}

/** assignee: submit for verification */
export async function submitCorrectiveAction(
  row: CorrectiveActionRow,
  closureNotes: string,
  actorId: string,
): Promise<void> {
  const { error } = await supabase
    .from('corrective_actions')
    .update({
      status: 'submitted',
      submitted_at: new Date().toISOString(),
      closure_notes: closureNotes.trim() || null,
    })
    .eq('id', row.id)
    .in('status', ['assigned', 'in_progress', 'rejected', 'overdue']);
  if (error) fail('Could not submit the corrective action.', error);
  await writeAudit({
    caId: row.id,
    mineId: null,
    action: 'corrective_action.submitted',
    actorId,
    note: closureNotes.trim() || null,
  });
  await notify(row.id, row.assignedById, 'submitted');
}

/** manager: verify & close */
export async function verifyCorrectiveAction(row: CorrectiveActionRow, actorId: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('corrective_actions')
    .update({ status: 'verified', verified_by: actorId, verified_at: now, closed_at: now })
    .eq('id', row.id)
    .eq('status', 'submitted');
  if (error) fail('Could not verify the corrective action.', error);
  await writeAudit({ caId: row.id, mineId: null, action: 'corrective_action.verified', actorId });
  await notify(row.id, row.assignedToId, 'verified');
}

/** manager: reject back to the assignee */
export async function rejectCorrectiveAction(
  row: CorrectiveActionRow,
  reason: string,
  actorId: string,
): Promise<void> {
  const { error } = await supabase
    .from('corrective_actions')
    .update({ status: 'rejected', rejection_reason: reason.trim() || null })
    .eq('id', row.id)
    .eq('status', 'submitted');
  if (error) fail('Could not reject the corrective action.', error);
  await writeAudit({
    caId: row.id,
    mineId: null,
    action: 'corrective_action.rejected',
    actorId,
    note: reason.trim() || null,
  });
  await notify(row.id, row.assignedToId, 'rejected');
}
