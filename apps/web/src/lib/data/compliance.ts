/**
 * Compliance Intelligence data access. RLS-scoped SSR client.
 *
 * Schema note: this milestone deliberately adds NO columns. The statutory
 * register is `compliance_requirements` (reference data, readable by all) joined
 * to `compliance_records` (one row per requirement per mine, mine-scoped RLS).
 *
 * `compliance_records` has no owner / priority / linked-finding columns, so those
 * three demo attributes are carried as a small JSON sidecar in the existing
 * `notes` text column. `parseMeta` reads it defensively - a plain-text note (or
 * null) still works and just yields an empty meta.
 */
import type { ComplianceStatus, RiskLevel } from '@coalguard/types';
import { COMPLIANCE_STATUSES } from '@coalguard/types';
import { createClient } from '@/lib/supabase/server';
import type { Tone } from '@/lib/status';
import { one } from './shared';

/* ------------------------------ meta sidecar ----------------------------- */

export interface ComplianceMeta {
  note: string | null;
  ownerName: string | null;
  ownerRole: string | null;
  priority: RiskLevel | null;
  observationId: string | null;
}

const EMPTY_META: ComplianceMeta = {
  note: null,
  ownerName: null,
  ownerRole: null,
  priority: null,
  observationId: null,
};

export function parseComplianceMeta(notes: string | null | undefined): ComplianceMeta {
  if (!notes) return EMPTY_META;
  const trimmed = notes.trim();
  if (!trimmed.startsWith('{')) return { ...EMPTY_META, note: trimmed };
  try {
    const o = JSON.parse(trimmed) as Record<string, unknown>;
    const priority = o.priority;
    return {
      note: typeof o.note === 'string' ? o.note : null,
      ownerName: typeof o.ownerName === 'string' ? o.ownerName : null,
      ownerRole: typeof o.ownerRole === 'string' ? o.ownerRole : null,
      priority:
        priority === 'low' || priority === 'medium' || priority === 'high' || priority === 'critical'
          ? priority
          : null,
      observationId: typeof o.observationId === 'string' ? o.observationId : null,
    };
  } catch {
    return { ...EMPTY_META, note: trimmed };
  }
}

/* --------------------------- display metadata --------------------------- */

export const COMPLIANCE_STATUS_META: Record<
  ComplianceStatus,
  { label: string; tone: Tone; open: boolean }
> = {
  compliant: { label: 'Compliant', tone: 'safe', open: false },
  at_risk: { label: 'At risk', tone: 'high-risk', open: true },
  non_compliant: { label: 'Non-compliant', tone: 'critical', open: true },
  pending_review: { label: 'Pending review', tone: 'warning', open: true },
};

export const COMPLIANCE_STATUS_ORDER = COMPLIANCE_STATUSES;

export const PRIORITY_META: Record<RiskLevel, { label: string; tone: Tone; rank: number }> = {
  low: { label: 'Low', tone: 'safe', rank: 1 },
  medium: { label: 'Medium', tone: 'warning', rank: 2 },
  high: { label: 'High', tone: 'high-risk', rank: 3 },
  critical: { label: 'Critical', tone: 'critical', rank: 4 },
};

/* -------------------------------- shapes -------------------------------- */

export interface ComplianceRow {
  id: string;
  requirementId: string;
  code: string;
  title: string;
  description: string | null;
  authority: string;
  category: string | null;
  frequency: string | null;
  mineName: string | null;
  status: ComplianceStatus;
  dueDate: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  reviewedAt: string | null;
  ownerName: string | null;
  ownerRole: string | null;
  priority: RiskLevel | null;
  observationId: string | null;
  note: string | null;
  /** derived: days until due (negative = overdue); null when no due date */
  daysToDue: number | null;
  overdue: boolean;
  dueSoon: boolean;
}

export interface ComplianceKpis {
  total: number;
  compliant: number;
  atRisk: number;
  nonCompliant: number;
  pendingReview: number;
  dueSoon: number;
  overdue: number;
}

export type ComplianceDomain = 'Safety' | 'Environment' | 'Labour' | 'Production';

export interface ComplianceDomainCoverage {
  domain: ComplianceDomain;
  total: number;
  compliant: number;
  atRisk: number;
}

export interface ComplianceRegister {
  rows: ComplianceRow[];
  kpis: ComplianceKpis;
  statusDistribution: { status: ComplianceStatus; label: string; count: number }[];
  owners: { name: string; role: string | null; total: number; open: number }[];
  upcoming: ComplianceRow[];
  coverage: ComplianceDomainCoverage[];
}

const DOMAIN_ORDER: ComplianceDomain[] = ['Safety', 'Environment', 'Labour', 'Production'];

export function domainOf(category: string | null): ComplianceDomain {
  const c = (category ?? '').toLowerCase();
  if (c.includes('environment') || c.includes('env') || c.includes('water') || c.includes('air'))
    return 'Environment';
  if (c.includes('labour') || c.includes('labor') || c.includes('hr') || c.includes('worker'))
    return 'Labour';
  if (c.includes('production') || c.includes('operations') || c.includes('dispatch'))
    return 'Production';
  return 'Safety';
}

const DUE_SOON_DAYS = 30;

function dayDiff(due: string | null): number | null {
  if (!due) return null;
  const d = new Date(due);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

function mapRow(r: Record<string, unknown>): ComplianceRow {
  const req = one(r.requirement as unknown) as Record<string, unknown> | null;
  const mine = one(r.mine as unknown) as { name?: string } | null;
  const meta = parseComplianceMeta(r.notes as string | null);
  const status = r.status as ComplianceStatus;
  const dueDate = (r.due_date as string) ?? null;
  const daysToDue = dayDiff(dueDate);
  const isOpen = COMPLIANCE_STATUS_META[status]?.open ?? false;
  return {
    id: r.id as string,
    requirementId: r.requirement_id as string,
    code: (req?.code as string) ?? '--',
    title: (req?.title as string) ?? 'Requirement',
    description: (req?.description as string) ?? null,
    authority: (req?.authority as string) ?? 'DGMS',
    category: (req?.category as string) ?? null,
    frequency: (req?.frequency as string) ?? null,
    mineName: mine?.name ?? null,
    status,
    dueDate,
    periodStart: (r.period_start as string) ?? null,
    periodEnd: (r.period_end as string) ?? null,
    reviewedAt: (r.reviewed_at as string) ?? null,
    ownerName: meta.ownerName,
    ownerRole: meta.ownerRole,
    priority: meta.priority,
    observationId: meta.observationId,
    note: meta.note,
    daysToDue,
    overdue: isOpen && daysToDue !== null && daysToDue < 0,
    dueSoon: isOpen && daysToDue !== null && daysToDue >= 0 && daysToDue <= DUE_SOON_DAYS,
  };
}

export interface ComplianceListParams {
  mineId?: string;
  status?: ComplianceStatus;
  priority?: RiskLevel;
  category?: string;
  authority?: string;
}

export async function getComplianceRegister(
  params: ComplianceListParams = {},
): Promise<ComplianceRegister> {
  const supabase = await createClient();

  let q = supabase
    .from('compliance_records')
    .select(
      `id, requirement_id, mine_id, status, due_date, period_start, period_end, reviewed_at, notes,
       requirement:compliance_requirements!compliance_records_requirement_id_fkey(code, title, description, authority, category, frequency),
       mine:mines!compliance_records_mine_id_fkey(name)`,
    )
    .limit(500);
  if (params.mineId) q = q.eq('mine_id', params.mineId);
  if (params.status) q = q.eq('status', params.status);

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  let rows = ((data ?? []) as Record<string, unknown>[]).map(mapRow);

  if (params.priority) rows = rows.filter((r) => r.priority === params.priority);
  if (params.category) rows = rows.filter((r) => r.category === params.category);
  if (params.authority) rows = rows.filter((r) => r.authority === params.authority);

  rows.sort(
    (a, b) =>
      (PRIORITY_META[b.priority ?? 'low'].rank ?? 0) -
        (PRIORITY_META[a.priority ?? 'low'].rank ?? 0) ||
      (a.daysToDue ?? 9e9) - (b.daysToDue ?? 9e9),
  );

  const kpis: ComplianceKpis = {
    total: rows.length,
    compliant: rows.filter((r) => r.status === 'compliant').length,
    atRisk: rows.filter((r) => r.status === 'at_risk').length,
    nonCompliant: rows.filter((r) => r.status === 'non_compliant').length,
    pendingReview: rows.filter((r) => r.status === 'pending_review').length,
    dueSoon: rows.filter((r) => r.dueSoon).length,
    overdue: rows.filter((r) => r.overdue).length,
  };

  const statusDistribution = COMPLIANCE_STATUS_ORDER.map((status) => ({
    status,
    label: COMPLIANCE_STATUS_META[status].label,
    count: rows.filter((r) => r.status === status).length,
  }));

  const ownerMap = new Map<string, { name: string; role: string | null; total: number; open: number }>();
  for (const r of rows) {
    if (!r.ownerName) continue;
    const cur = ownerMap.get(r.ownerName) ?? {
      name: r.ownerName,
      role: r.ownerRole,
      total: 0,
      open: 0,
    };
    cur.total += 1;
    if (COMPLIANCE_STATUS_META[r.status].open) cur.open += 1;
    ownerMap.set(r.ownerName, cur);
  }
  const owners = [...ownerMap.values()].sort((a, b) => b.open - a.open || b.total - a.total);

  const upcoming = rows
    .filter((r) => r.dueDate && COMPLIANCE_STATUS_META[r.status].open)
    .sort((a, b) => (a.daysToDue ?? 9e9) - (b.daysToDue ?? 9e9))
    .slice(0, 6);

  const coverage: ComplianceDomainCoverage[] = DOMAIN_ORDER.map((domain) => {
    const dr = rows.filter((r) => domainOf(r.category) === domain);
    return {
      domain,
      total: dr.length,
      compliant: dr.filter((r) => r.status === 'compliant').length,
      atRisk: dr.filter((r) => COMPLIANCE_STATUS_META[r.status].open).length,
    };
  });

  return { rows, kpis, statusDistribution, owners, upcoming, coverage };
}

/* -------------------------------- detail -------------------------------- */

export interface ComplianceDetail extends ComplianceRow {
  linkedObservation:
    | { id: string; title: string; risk: RiskLevel; status: string; evidenceCount: number }
    | null;
}

export async function getComplianceDetail(id: string): Promise<ComplianceDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('compliance_records')
    .select(
      `id, requirement_id, mine_id, status, due_date, period_start, period_end, reviewed_at, notes,
       requirement:compliance_requirements!compliance_records_requirement_id_fkey(code, title, description, authority, category, frequency, reference_url),
       mine:mines!compliance_records_mine_id_fkey(name)`,
    )
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const row = mapRow(data as Record<string, unknown>);
  let linkedObservation: ComplianceDetail['linkedObservation'] = null;

  if (row.observationId) {
    const { data: obs } = await supabase
      .from('observations')
      .select('id, title, risk, status, evidence(count)')
      .eq('id', row.observationId)
      .maybeSingle();
    if (obs) {
      const ev = one((obs as Record<string, unknown>).evidence as unknown) as
        | { count?: number }
        | null;
      linkedObservation = {
        id: obs.id as string,
        title: obs.title as string,
        risk: obs.risk as RiskLevel,
        status: obs.status as string,
        evidenceCount: ev?.count ?? 0,
      };
    }
  }

  return { ...row, linkedObservation };
}

/** Compact roll-up for the Overview dashboard. */
export async function getComplianceSnapshot(opts?: { mineId?: string }): Promise<ComplianceKpis> {
  const { kpis } = await getComplianceRegister({ mineId: opts?.mineId });
  return kpis;
}
