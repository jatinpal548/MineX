/** Corrective actions: list + detail. Read-only for M3A. RLS-scoped SSR client. */
import type {
  CorrectiveActionPriority,
  CorrectiveActionStatus,
  ObservationStatus,
  RiskLevel,
} from '@coalguard/types';
import { createClient } from '@/lib/supabase/server';
import { PAGE_SIZE, one, paged, rangeFor, type Paged } from './shared';
import { CA_PENDING_STATUSES } from '@/lib/status';

export interface CorrectiveActionListRow {
  id: string;
  title: string;
  status: CorrectiveActionStatus;
  priority: CorrectiveActionPriority;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
  assignedAt: string | null;
  verifiedAt: string | null;
  mineName: string | null;
  mineCode: string | null;
  observation: { id: string; title: string; risk: RiskLevel } | null;
  assigneeName: string | null;
  overdue: boolean;
}

export interface CorrectiveActionListParams {
  search?: string;
  status?: CorrectiveActionStatus;
  priority?: CorrectiveActionPriority;
  mineId?: string;
  due?: 'overdue' | 'upcoming' | 'none';
  page?: number;
}

function isOverdue(dueDate: string | null, status: CorrectiveActionStatus): boolean {
  if (!dueDate) return false;
  if (status === 'verified' || status === 'closed') return false;
  return new Date(dueDate).getTime() < Date.now();
}

export async function listCorrectiveActions(
  params: CorrectiveActionListParams,
): Promise<Paged<CorrectiveActionListRow>> {
  const supabase = await createClient();
  const page = params.page && params.page > 0 ? params.page : 1;
  const [lo, hi] = rangeFor(page, PAGE_SIZE);

  let q = supabase
    .from('corrective_actions')
    .select(
      `id, title, status, priority, due_date, created_at, updated_at, assigned_at, verified_at,
       mine:mines!corrective_actions_mine_id_fkey(name, code),
       observation:observations!corrective_actions_observation_id_fkey(id, title, risk),
       assignee:profiles!corrective_actions_assigned_to_fkey(full_name)`,
      { count: 'exact' },
    )
    .order('updated_at', { ascending: false })
    .range(lo, hi);

  if (params.search) q = q.ilike('title', `%${params.search}%`);
  if (params.status) q = q.eq('status', params.status);
  if (params.priority) q = q.eq('priority', params.priority);
  if (params.mineId) q = q.eq('mine_id', params.mineId);

  const todayIso = new Date().toISOString().slice(0, 10);
  if (params.due === 'overdue') q = q.lt('due_date', todayIso).in('status', CA_PENDING_STATUSES);
  if (params.due === 'upcoming') q = q.gte('due_date', todayIso);
  if (params.due === 'none') q = q.is('due_date', null);

  const { data, count, error } = await q;
  if (error) throw new Error(error.message);

  const rows: CorrectiveActionListRow[] = ((data ?? []) as Record<string, unknown>[]).map((r) => {
    const mine = one(r.mine as unknown) as { name?: string; code?: string } | null;
    const obs = one(r.observation as unknown) as
      | { id: string; title: string; risk: RiskLevel }
      | null;
    const assignee = one(r.assignee as unknown) as { full_name?: string } | null;
    const status = r.status as CorrectiveActionStatus;
    const dueDate = (r.due_date as string) ?? null;
    return {
      id: r.id as string,
      title: r.title as string,
      status,
      priority: r.priority as CorrectiveActionPriority,
      dueDate,
      createdAt: r.created_at as string,
      updatedAt: (r.updated_at as string) ?? (r.created_at as string),
      assignedAt: (r.assigned_at as string) ?? null,
      verifiedAt: (r.verified_at as string) ?? null,
      mineName: mine?.name ?? null,
      mineCode: mine?.code ?? null,
      observation: obs ? { id: obs.id, title: obs.title, risk: obs.risk } : null,
      assigneeName: assignee?.full_name ?? null,
      overdue: isOverdue(dueDate, status),
    };
  });

  return paged(rows, count ?? 0, page, PAGE_SIZE);
}

/* ------------------------------- detail ------------------------------- */

export interface CorrectiveActionDetail {
  id: string;
  title: string;
  description: string | null;
  status: CorrectiveActionStatus;
  priority: CorrectiveActionPriority;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
  assignedAt: string | null;
  submittedAt: string | null;
  verifiedAt: string | null;
  closedAt: string | null;
  closureNotes: string | null;
  rejectionReason: string | null;
  overdue: boolean;
  mineId: string | null;
  mineName: string | null;
  mineCode: string | null;
  assignedTo: string | null;
  observation: {
    id: string;
    title: string;
    description: string | null;
    risk: RiskLevel;
    status: ObservationStatus;
  } | null;
  assigneeName: string | null;
  assigneeEmail: string | null;
  assignerName: string | null;
  verifierName: string | null;
  timeline: { key: string; label: string; at: string }[];
}

export async function getCorrectiveActionDetail(
  id: string,
): Promise<CorrectiveActionDetail | null> {
  const supabase = await createClient();

  const { data: ca, error } = await supabase
    .from('corrective_actions')
    .select(
      `id, title, description, status, priority, due_date, created_at, updated_at, assigned_at,
       submitted_at, verified_at, closed_at, closure_notes, rejection_reason, mine_id, assigned_to,
       mine:mines!corrective_actions_mine_id_fkey(name, code),
       observation:observations!corrective_actions_observation_id_fkey(id, title, description, risk, status),
       assignee:profiles!corrective_actions_assigned_to_fkey(full_name, email),
       assigner:profiles!corrective_actions_assigned_by_fkey(full_name),
       verifier:profiles!corrective_actions_verified_by_fkey(full_name)`,
    )
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!ca) return null;

  const mine = one(ca.mine as unknown) as { name?: string; code?: string } | null;
  const obs = one(ca.observation as unknown) as
    | {
        id: string;
        title: string;
        description: string | null;
        risk: RiskLevel;
        status: ObservationStatus;
      }
    | null;
  const assignee = one(ca.assignee as unknown) as { full_name?: string; email?: string } | null;
  const assigner = one(ca.assigner as unknown) as { full_name?: string } | null;
  const verifier = one(ca.verifier as unknown) as { full_name?: string } | null;
  const status = ca.status as CorrectiveActionStatus;
  const dueDate = (ca.due_date as string) ?? null;

  const timeline: { key: string; label: string; at: string }[] = [
    { key: 'created', label: 'Corrective action created', at: ca.created_at as string },
  ];
  if (ca.assigned_at)
    timeline.push({
      key: 'assigned',
      label: `Assigned${assignee?.full_name ? ` to ${assignee.full_name}` : ''}`,
      at: ca.assigned_at as string,
    });
  if (ca.submitted_at)
    timeline.push({ key: 'submitted', label: 'Closure submitted', at: ca.submitted_at as string });
  if (ca.verified_at)
    timeline.push({
      key: 'verified',
      label: `Verified${verifier?.full_name ? ` by ${verifier.full_name}` : ''}`,
      at: ca.verified_at as string,
    });
  if (ca.closed_at)
    timeline.push({ key: 'closed', label: 'Closed', at: ca.closed_at as string });
  timeline.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  return {
    id: ca.id as string,
    title: ca.title as string,
    description: (ca.description as string) ?? null,
    status,
    priority: ca.priority as CorrectiveActionPriority,
    dueDate,
    createdAt: ca.created_at as string,
    updatedAt: (ca.updated_at as string) ?? (ca.created_at as string),
    assignedAt: (ca.assigned_at as string) ?? null,
    submittedAt: (ca.submitted_at as string) ?? null,
    verifiedAt: (ca.verified_at as string) ?? null,
    closedAt: (ca.closed_at as string) ?? null,
    closureNotes: (ca.closure_notes as string) ?? null,
    rejectionReason: (ca.rejection_reason as string) ?? null,
    overdue: isOverdue(dueDate, status),
    mineId: (ca.mine_id as string) ?? null,
    mineName: mine?.name ?? null,
    mineCode: mine?.code ?? null,
    assignedTo: (ca.assigned_to as string) ?? null,
    observation: obs
      ? {
          id: obs.id,
          title: obs.title,
          description: obs.description ?? null,
          risk: obs.risk,
          status: obs.status,
        }
      : null,
    assigneeName: assignee?.full_name ?? null,
    assigneeEmail: assignee?.email ?? null,
    assignerName: assigner?.full_name ?? null,
    verifierName: verifier?.full_name ?? null,
    timeline,
  };
}
