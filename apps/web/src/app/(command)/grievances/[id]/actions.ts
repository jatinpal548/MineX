'use server';

import { revalidatePath } from 'next/cache';
import type { GrievanceStatus } from '@coalguard/types';
import { hasPermission } from '@coalguard/config';
import { createClient } from '@/lib/supabase/server';
import { getSessionUser } from '@/lib/auth';

export type ActionResult = { ok: true } | { ok: false; error: string };

interface GrievanceRow {
  id: string;
  mine_id: string;
  status: GrievanceStatus;
  assigned_to: string | null;
  title: string;
}

/** Allowed forward transitions. No status is invented - all from the DB enum. */
const NEXT: Record<GrievanceStatus, GrievanceStatus[]> = {
  open: ['acknowledged'],
  acknowledged: ['investigating', 'resolved'],
  investigating: ['resolved'],
  resolved: ['closed'],
  closed: [],
};

async function load(id: string) {
  if (!id || typeof id !== 'string') return { ok: false as const, error: 'invalid_request' };
  const user = await getSessionUser();
  if (!user) return { ok: false as const, error: 'unauthorized' };
  if (!hasPermission(user.roles.map((r) => r.role), 'grievance:manage')) {
    return { ok: false as const, error: 'forbidden' };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('grievances')
    .select('id, mine_id, status, assigned_to, title')
    .eq('id', id)
    .maybeSingle();
  if (error) return { ok: false as const, error: 'server_error' };
  if (!data) return { ok: false as const, error: 'not_found' }; // RLS already enforced scope
  return { ok: true as const, supabase, userId: user.id, g: data as GrievanceRow };
}

async function audit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  args: { actorId: string; id: string; mineId: string; action: string; after: Record<string, unknown> },
) {
  const { error } = await supabase.from('audit_logs').insert({
    actor_id: args.actorId,
    action: args.action,
    entity_type: 'grievance',
    entity_id: args.id,
    mine_id: args.mineId,
    after: args.after,
  });
  if (error) console.warn('[grievance] audit write failed', args.action, error.message);
}

async function transition(
  id: string,
  to: GrievanceStatus,
  patch: Record<string, unknown>,
  note: string | null,
): Promise<ActionResult> {
  const l = await load(id);
  if (!l.ok) return l;
  if (!NEXT[l.g.status].includes(to)) return { ok: false, error: 'invalid_transition' };

  const { error } = await l.supabase
    .from('grievances')
    .update({ status: to, ...patch })
    .eq('id', id)
    .eq('status', l.g.status);
  if (error) return { ok: false, error: 'update_failed' };

  await audit(l.supabase, {
    actorId: l.userId,
    id,
    mineId: l.g.mine_id,
    action: `grievance.${to}`,
    after: note ? { status: to, note } : { status: to },
  });

  // notify the assignee where the governance RPC / notifications infra exists
  if (l.g.assigned_to && l.g.assigned_to !== l.userId) {
    await l.supabase
      .from('notifications')
      .insert({
        recipient_id: l.g.assigned_to,
        title: `Grievance ${to}`,
        body: `"${l.g.title}" was marked ${to}.`,
        priority: to === 'resolved' || to === 'closed' ? 'info' : 'warning',
        category: 'grievance',
        resource_type: 'grievance',
        resource_id: id,
        action_url: `/grievances/${id}`,
      })
      .then(undefined, () => {});
  }

  revalidatePath(`/grievances/${id}`);
  revalidatePath('/grievances');
  return { ok: true };
}

export async function acknowledgeGrievance(id: string): Promise<ActionResult> {
  return transition(id, 'acknowledged', {}, null);
}

export async function startGrievanceReview(id: string): Promise<ActionResult> {
  return transition(id, 'investigating', {}, null);
}

export async function resolveGrievance(id: string, note: string): Promise<ActionResult> {
  const trimmed = (note ?? '').trim();
  if (trimmed.length < 5) return { ok: false, error: 'note_required' };
  return transition(
    id,
    'resolved',
    { resolution_notes: trimmed, resolved_at: new Date().toISOString() },
    trimmed,
  );
}

export async function closeGrievance(id: string, note: string): Promise<ActionResult> {
  return transition(id, 'closed', {}, (note ?? '').trim() || null);
}
