'use server';

import { revalidatePath } from 'next/cache';
import type { CorrectiveActionStatus, UserRole } from '@coalguard/types';
import { createClient } from '@/lib/supabase/server';
import { getSessionUser } from '@/lib/auth';
import { hasPermission } from '@coalguard/config';
import { getInspectionAssignees } from '@/lib/data/governance';
import { OBSERVATION_OPEN_STATUSES } from '@/lib/status';
import { one } from '@/lib/data/shared';
import { caCapabilities, allowedStatusTargets } from '@/lib/data/ca-permissions';

export type ActionResult = { ok: true } | { ok: false; error: string };

interface CaRow {
  id: string;
  mine_id: string;
  status: CorrectiveActionStatus;
  assigned_to: string | null;
  assigned_by: string | null;
  due_date: string | null;
  observation_id: string | null;
  title: string;
}

type Loaded =
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>>; userId: string; roles: UserRole[]; ca: CaRow }
  | { ok: false; error: string };

async function loadCa(caId: string): Promise<Loaded> {
  if (!caId || typeof caId !== 'string') return { ok: false, error: 'invalid_request' };
  const user = await getSessionUser();
  if (!user) return { ok: false, error: 'unauthorized' };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('corrective_actions')
    .select('id, mine_id, status, assigned_to, assigned_by, due_date, observation_id, title')
    .eq('id', caId)
    .maybeSingle();

  if (error) return { ok: false, error: 'server_error' };
  if (!data) return { ok: false, error: 'not_found' }; // RLS already enforced mine scope
  return {
    ok: true,
    supabase,
    userId: user.id,
    roles: user.roles.map((r) => r.role),
    ca: data as CaRow,
  };
}

async function writeAudit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  args: { actorId: string; caId: string; mineId: string; action: string; after: Record<string, unknown> },
): Promise<void> {
  const { error } = await supabase.from('audit_logs').insert({
    actor_id: args.actorId,
    action: args.action,
    entity_type: 'corrective_action',
    entity_id: args.caId,
    mine_id: args.mineId,
    after: args.after,
  });
  if (error) console.warn('[governance] audit write failed', args.action, error.message);
}

async function notify(
  supabase: Awaited<ReturnType<typeof createClient>>,
  caId: string,
  recipient: string | null,
  kind: 'assigned' | 'submitted' | 'verified' | 'rejected',
): Promise<void> {
  if (!recipient) return;
  const { error } = await supabase.rpc('notify_governance', {
    p_ca_id: caId,
    p_recipient: recipient,
    p_kind: kind,
  });
  if (error) console.warn('[governance] notify failed', kind, error.message);
}

function revalidate(caId: string, observationId: string | null): void {
  revalidatePath(`/corrective-actions/${caId}`);
  revalidatePath('/corrective-actions');
  revalidatePath('/dashboard');
  revalidatePath('/notifications');
  if (observationId) revalidatePath(`/observations/${observationId}`);
}

const isoDate = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

/* ------------------------------- assign ------------------------------ */

type Assignment = {
  caId: string;
  assigneeId: string;
  dueDate: string;
  note?: string;
};

export async function assignCorrectiveAction(input: Assignment): Promise<ActionResult> {
  const loaded = await loadCa(input.caId);
  if (!loaded.ok) return loaded;
  return assignLoadedAction(input, loaded);
}

async function assignLoadedAction(
  input: Assignment,
  loaded: Extract<Loaded, { ok: true }>,
): Promise<ActionResult> {
  const { supabase, userId, roles, ca } = loaded;

  const caps = caCapabilities(roles, userId, {
    status: ca.status,
    assignedTo: ca.assigned_to,
  });
  if (!caps.canAssign) return { ok: false, error: 'forbidden' };
  if (!input.assigneeId) return { ok: false, error: 'assignee_required' };
  if (!input.dueDate || !isoDate(input.dueDate)) return { ok: false, error: 'due_date_invalid' };
  if (ca.status === 'assigned' && ca.assigned_to === input.assigneeId && ca.due_date === input.dueDate && !input.note) {
    return { ok: true };
  }

  // assignee must be valid for THIS action's mine (RPC is scope-checked)
  const { data: eligible, error: eErr } = await supabase.rpc('eligible_ca_assignees', {
    p_ca_id: ca.id,
  });
  if (eErr) return { ok: false, error: 'server_error' };
  const ok = ((eligible ?? []) as { id: string }[]).some((r) => r.id === input.assigneeId);
  if (!ok) return { ok: false, error: 'assignee_ineligible' };

  let update = supabase
    .from('corrective_actions')
    .update({
      assigned_to: input.assigneeId,
      assigned_by: userId,
      assigned_at: new Date().toISOString(),
      due_date: input.dueDate,
      status: 'assigned',
    })
    .eq('id', ca.id)
    .eq('status', ca.status);
  update = ca.assigned_to ? update.eq('assigned_to', ca.assigned_to) : update.is('assigned_to', null);
  const { data, error } = await update.select('id').maybeSingle();
  if (error || !data) return { ok: false, error: 'update_failed' };

  await Promise.all([
    writeAudit(supabase, {
      actorId: userId,
      caId: ca.id,
      mineId: ca.mine_id,
      action: 'corrective_action.assigned',
      after: { assignee: input.assigneeId, due_date: input.dueDate, note: input.note?.trim() || null },
    }),
    notify(supabase, ca.id, input.assigneeId, 'assigned'),
  ]);
  revalidate(ca.id, ca.observation_id);
  return { ok: true };
}

export async function assignInspectionIssue(input: {
  inspectionId: string;
  observationId: string;
  assigneeId: string;
  dueDate: string;
}): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: 'unauthorized' };
  const roles = user.roles.map((r) => r.role);
  if (!hasPermission(roles, 'corrective_action:assign')) {
    return { ok: false, error: 'forbidden' };
  }
  if (typeof input.dueDate !== 'string' || !isoDate(input.dueDate)) {
    return { ok: false, error: 'due_date_invalid' };
  }
  const supabase = await createClient();
  const { data: observation, error } = await supabase.from('observations')
    .select(`id, mine_id, title, description, risk, status,
      inspection:inspections!observations_inspection_id_fkey!inner(mine_id),
      corrective_actions(id, mine_id, status, assigned_to, assigned_by, due_date, observation_id, title, created_at)`)
    .eq('id', input.observationId)
    .eq('inspection_id', input.inspectionId)
    .order('created_at', { referencedTable: 'corrective_actions', ascending: false })
    .limit(1, { referencedTable: 'corrective_actions' })
    .maybeSingle();
  if (error || !observation || one(observation.inspection)?.mine_id !== observation.mine_id) {
    return { ok: false, error: 'not_found' };
  }

  const existing = observation.corrective_actions[0];
  if (existing) {
    if (existing.mine_id !== observation.mine_id) return { ok: false, error: 'forbidden' };
    const result = await assignLoadedAction({ ...input, caId: existing.id }, {
      ok: true, supabase, userId: user.id, roles, ca: existing as CaRow,
    });
    if (result.ok) revalidatePath(`/inspections/${input.inspectionId}`);
    return result;
  }
  if (!OBSERVATION_OPEN_STATUSES.includes(observation.status)) {
    return { ok: false, error: 'forbidden' };
  }
  const assignees = await getInspectionAssignees(input.inspectionId);
  if (!assignees) return { ok: false, error: 'server_error' };
  if (!assignees.some((person) => person.id === input.assigneeId)) {
    return { ok: false, error: 'assignee_ineligible' };
  }

  // The observation ID makes concurrent first drops target the same new row.
  const caId = observation.id;
  const { error: insertError } = await supabase.from('corrective_actions').insert({
    id: caId,
    observation_id: observation.id,
    inspection_id: input.inspectionId,
    mine_id: observation.mine_id,
    title: observation.title,
    description: observation.description,
    priority: observation.risk ?? 'medium',
    assigned_to: input.assigneeId,
    assigned_by: user.id,
    assigned_at: new Date().toISOString(),
    due_date: input.dueDate,
    status: 'assigned',
  });
  if (insertError) return { ok: false, error: 'update_failed' };

  await Promise.all([
    writeAudit(supabase, {
      actorId: user.id,
      caId,
      mineId: observation.mine_id,
      action: 'corrective_action.assigned',
      after: { assignee: input.assigneeId, due_date: input.dueDate },
    }),
    notify(supabase, caId, input.assigneeId, 'assigned'),
  ]);
  revalidate(caId, observation.id);
  revalidatePath(`/inspections/${input.inspectionId}`);
  return { ok: true };
}

/* --------------------------- update status -------------------------- */

export async function updateCorrectiveActionStatus(input: {
  caId: string;
  toStatus: CorrectiveActionStatus;
  note?: string;
}): Promise<ActionResult> {
  const loaded = await loadCa(input.caId);
  if (!loaded.ok) return loaded;
  const { supabase, userId, roles, ca } = loaded;

  const caps = caCapabilities(roles, userId, {
    status: ca.status,
    assignedTo: ca.assigned_to,
  });
  if (!caps.canManageStatus) return { ok: false, error: 'forbidden' };
  if (!allowedStatusTargets(ca.status).includes(input.toStatus)) {
    return { ok: false, error: 'invalid_transition' };
  }

  const { error } = await supabase
    .from('corrective_actions')
    .update({ status: input.toStatus })
    .eq('id', ca.id);
  if (error) return { ok: false, error: 'update_failed' };

  await writeAudit(supabase, {
    actorId: userId,
    caId: ca.id,
    mineId: ca.mine_id,
    action: 'corrective_action.progress',
    after: { from: ca.status, to: input.toStatus, note: input.note?.trim() || null },
  });
  revalidate(ca.id, ca.observation_id);
  return { ok: true };
}

/* --------------------------- add progress note --------------------- */

export async function addProgressNote(input: {
  caId: string;
  note: string;
}): Promise<ActionResult> {
  const loaded = await loadCa(input.caId);
  if (!loaded.ok) return loaded;
  const { supabase, userId, roles, ca } = loaded;

  const caps = caCapabilities(roles, userId, {
    status: ca.status,
    assignedTo: ca.assigned_to,
  });
  if (!(caps.isAssignee || caps.canAssign || caps.canVerify)) return { ok: false, error: 'forbidden' };
  if (caps.isTerminal) return { ok: false, error: 'already_closed' };
  const note = input.note?.trim();
  if (!note) return { ok: false, error: 'note_required' };

  await writeAudit(supabase, {
    actorId: userId,
    caId: ca.id,
    mineId: ca.mine_id,
    action: 'corrective_action.progress',
    after: { note },
  });
  revalidate(ca.id, ca.observation_id);
  return { ok: true };
}

/* ------------------------------- submit ---------------------------- */

export async function submitCorrectiveAction(input: {
  caId: string;
  closureNotes: string;
}): Promise<ActionResult> {
  const loaded = await loadCa(input.caId);
  if (!loaded.ok) return loaded;
  const { supabase, userId, roles, ca } = loaded;

  const caps = caCapabilities(roles, userId, {
    status: ca.status,
    assignedTo: ca.assigned_to,
  });
  if (!caps.canSubmit) return { ok: false, error: 'not_assignee_or_wrong_state' };
  const notes = input.closureNotes?.trim();
  if (!notes) return { ok: false, error: 'closure_notes_required' };

  const { error } = await supabase
    .from('corrective_actions')
    .update({
      status: 'submitted',
      submitted_at: new Date().toISOString(),
      closure_notes: notes,
    })
    .eq('id', ca.id);
  if (error) return { ok: false, error: 'update_failed' };

  await writeAudit(supabase, {
    actorId: userId,
    caId: ca.id,
    mineId: ca.mine_id,
    action: 'corrective_action.submitted',
    after: { note: notes },
  });
  await notify(supabase, ca.id, ca.assigned_by, 'submitted');
  revalidate(ca.id, ca.observation_id);
  return { ok: true };
}

/* ------------------------------- verify ---------------------------- */

export async function verifyCorrectiveAction(input: {
  caId: string;
  note?: string;
}): Promise<ActionResult> {
  const loaded = await loadCa(input.caId);
  if (!loaded.ok) return loaded;
  const { supabase, userId, roles, ca } = loaded;

  const caps = caCapabilities(roles, userId, {
    status: ca.status,
    assignedTo: ca.assigned_to,
  });
  if (!caps.canVerify) return { ok: false, error: 'forbidden_or_wrong_state' };

  const now = new Date().toISOString();
  const { error } = await supabase
    .from('corrective_actions')
    .update({ status: 'verified', verified_by: userId, verified_at: now, closed_at: now })
    .eq('id', ca.id)
    .eq('status', 'submitted'); // guard against a concurrent transition
  if (error) return { ok: false, error: 'update_failed' };

  await writeAudit(supabase, {
    actorId: userId,
    caId: ca.id,
    mineId: ca.mine_id,
    action: 'corrective_action.verified',
    after: { note: input.note?.trim() || null },
  });
  await notify(supabase, ca.id, ca.assigned_to, 'verified');
  revalidate(ca.id, ca.observation_id);
  return { ok: true };
}

/* ------------------------------- reject ---------------------------- */

export async function rejectCorrectiveAction(input: {
  caId: string;
  reason: string;
}): Promise<ActionResult> {
  const loaded = await loadCa(input.caId);
  if (!loaded.ok) return loaded;
  const { supabase, userId, roles, ca } = loaded;

  const caps = caCapabilities(roles, userId, {
    status: ca.status,
    assignedTo: ca.assigned_to,
  });
  if (!caps.canVerify) return { ok: false, error: 'forbidden_or_wrong_state' };
  const reason = input.reason?.trim();
  if (!reason) return { ok: false, error: 'reason_required' };

  const { error } = await supabase
    .from('corrective_actions')
    .update({ status: 'rejected', rejection_reason: reason })
    .eq('id', ca.id)
    .eq('status', 'submitted');
  if (error) return { ok: false, error: 'update_failed' };

  await writeAudit(supabase, {
    actorId: userId,
    caId: ca.id,
    mineId: ca.mine_id,
    action: 'corrective_action.rejected',
    after: { reason },
  });
  await notify(supabase, ca.id, ca.assigned_to, 'rejected');
  revalidate(ca.id, ca.observation_id);
  return { ok: true };
}

/* ----------------------- attach closure evidence ------------------ */

export async function attachClosureEvidence(input: {
  caId: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number | null;
}): Promise<ActionResult> {
  const loaded = await loadCa(input.caId);
  if (!loaded.ok) return loaded;
  const { supabase, userId, roles, ca } = loaded;

  const caps = caCapabilities(roles, userId, {
    status: ca.status,
    assignedTo: ca.assigned_to,
  });
  if (!caps.canAddEvidence) return { ok: false, error: 'forbidden' };
  if (!input.storagePath || !input.storagePath.startsWith(`${ca.mine_id}/`)) {
    return { ok: false, error: 'invalid_path' };
  }

  const isImage = (input.mimeType || '').startsWith('image/');
  const { error } = await supabase.from('evidence').insert({
    evidence_type: isImage ? 'photo' : 'document',
    storage_path: input.storagePath,
    file_name: input.fileName || null,
    mime_type: input.mimeType || null,
    file_size_bytes: input.sizeBytes,
    is_simulated: false,
    uploaded_by: userId,
    mine_id: ca.mine_id,
    corrective_action_id: ca.id,
    observation_id: ca.observation_id,
  });
  if (error) return { ok: false, error: 'evidence_insert_failed' };

  await writeAudit(supabase, {
    actorId: userId,
    caId: ca.id,
    mineId: ca.mine_id,
    action: 'corrective_action.evidence_added',
    after: { file_name: input.fileName },
  });
  revalidate(ca.id, ca.observation_id);
  return { ok: true };
}
