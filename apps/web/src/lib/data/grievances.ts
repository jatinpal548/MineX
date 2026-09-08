/**
 * Grievance handling data. RLS-scoped SSR client. Real table: `grievances`.
 */
import type { GrievanceStatus } from '@coalguard/types';
import { GRIEVANCE_STATUSES } from '@coalguard/types';
import { createClient } from '@/lib/supabase/server';
import type { Tone } from '@/lib/status';
import { one } from './shared';

export const GRIEVANCE_STATUS_META: Record<
  GrievanceStatus,
  { label: string; tone: Tone; open: boolean }
> = {
  open: { label: 'Open', tone: 'high-risk', open: true },
  acknowledged: { label: 'Acknowledged', tone: 'warning', open: true },
  investigating: { label: 'In review', tone: 'info', open: true },
  resolved: { label: 'Resolved', tone: 'safe', open: false },
  closed: { label: 'Closed', tone: 'neutral', open: false },
};

export const GRIEVANCE_STATUS_ORDER = GRIEVANCE_STATUSES;

export interface GrievanceRow {
  id: string;
  title: string;
  category: string | null;
  status: GrievanceStatus;
  isAnonymous: boolean;
  raisedBy: string;
  assignedTo: string | null;
  mineName: string | null;
  createdAt: string;
  resolvedAt: string | null;
  ageDays: number;
}

export interface GrievanceData {
  rows: GrievanceRow[];
  counts: Record<GrievanceStatus, number>;
  open: number;
  resolvedThisSet: number;
  avgResolutionDays: number | null;
}

function raisedByLabel(r: Record<string, unknown>): string {
  if (r.is_anonymous) return 'Anonymous';
  const w = one(r.worker as unknown) as { full_name?: string } | null;
  const p = one(r.raiser as unknown) as { full_name?: string } | null;
  return w?.full_name ?? p?.full_name ?? 'Worker';
}

export async function getGrievanceData(opts?: {
  mineId?: string;
  status?: GrievanceStatus;
}): Promise<GrievanceData> {
  const supabase = await createClient();

  let q = supabase
    .from('grievances')
    .select(
      `id, title, category, status, is_anonymous, created_at, resolved_at,
       mine:mines!grievances_mine_id_fkey(name),
       worker:workers!grievances_raised_by_worker_id_fkey(full_name),
       raiser:profiles!grievances_raised_by_profile_id_fkey(full_name),
       assignee:profiles!grievances_assigned_to_fkey(full_name)`,
    )
    .order('created_at', { ascending: false })
    .limit(300);
  if (opts?.mineId) q = q.eq('mine_id', opts.mineId);
  if (opts?.status) q = q.eq('status', opts.status);

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const now = Date.now();
  const rows: GrievanceRow[] = ((data ?? []) as Record<string, unknown>[]).map((r) => {
    const created = new Date(r.created_at as string).getTime();
    return {
      id: r.id as string,
      title: r.title as string,
      category: (r.category as string) ?? null,
      status: r.status as GrievanceStatus,
      isAnonymous: Boolean(r.is_anonymous),
      raisedBy: raisedByLabel(r),
      assignedTo: (one(r.assignee as unknown) as { full_name?: string } | null)?.full_name ?? null,
      mineName: (one(r.mine as unknown) as { name?: string } | null)?.name ?? null,
      createdAt: r.created_at as string,
      resolvedAt: (r.resolved_at as string) ?? null,
      ageDays: Math.max(0, Math.round((now - created) / 86_400_000)),
    };
  });

  const counts = GRIEVANCE_STATUS_ORDER.reduce(
    (acc, s) => {
      acc[s] = rows.filter((r) => r.status === s).length;
      return acc;
    },
    {} as Record<GrievanceStatus, number>,
  );

  const resolvedRows = rows.filter((r) => r.resolvedAt);
  const avg =
    resolvedRows.length > 0
      ? Math.round(
          resolvedRows.reduce(
            (s, r) =>
              s +
              (new Date(r.resolvedAt as string).getTime() - new Date(r.createdAt).getTime()) /
                86_400_000,
            0,
          ) / resolvedRows.length,
        )
      : null;

  return {
    rows,
    counts,
    open: rows.filter((r) => GRIEVANCE_STATUS_META[r.status].open).length,
    resolvedThisSet: resolvedRows.length,
    avgResolutionDays: avg,
  };
}

export interface GrievanceDetail {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  status: GrievanceStatus;
  isAnonymous: boolean;
  raisedBy: string;
  assignedTo: string | null;
  mineName: string | null;
  createdAt: string;
  updatedAt: string | null;
  resolvedAt: string | null;
  resolutionNotes: string | null;
  timeline: { label: string; at: string }[];
}

export async function getGrievanceDetail(id: string): Promise<GrievanceDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('grievances')
    .select(
      `id, title, description, category, status, is_anonymous, created_at, updated_at,
       resolved_at, resolution_notes,
       mine:mines!grievances_mine_id_fkey(name),
       worker:workers!grievances_raised_by_worker_id_fkey(full_name),
       raiser:profiles!grievances_raised_by_profile_id_fkey(full_name),
       assignee:profiles!grievances_assigned_to_fkey(full_name)`,
    )
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const r = data as Record<string, unknown>;
  const timeline: { label: string; at: string }[] = [
    { label: 'Grievance submitted', at: r.created_at as string },
  ];
  const assignee = (one(r.assignee as unknown) as { full_name?: string } | null)?.full_name ?? null;
  if (assignee && r.updated_at && r.updated_at !== r.created_at) {
    timeline.push({ label: `Assigned to ${assignee}`, at: r.updated_at as string });
  }
  if (r.resolved_at) timeline.push({ label: 'Marked resolved', at: r.resolved_at as string });
  timeline.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  return {
    id: r.id as string,
    title: r.title as string,
    description: (r.description as string) ?? null,
    category: (r.category as string) ?? null,
    status: r.status as GrievanceStatus,
    isAnonymous: Boolean(r.is_anonymous),
    raisedBy: raisedByLabel(r),
    assignedTo: assignee,
    mineName: (one(r.mine as unknown) as { name?: string } | null)?.name ?? null,
    createdAt: r.created_at as string,
    updatedAt: (r.updated_at as string) ?? null,
    resolvedAt: (r.resolved_at as string) ?? null,
    resolutionNotes: (r.resolution_notes as string) ?? null,
    timeline,
  };
}
