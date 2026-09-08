/**
 * Reports: live management summaries + CSV row builders.
 *
 * Every figure is a real tally from the RLS-scoped Supabase client. Nothing is
 * cached or fabricated. The same query helpers back both the on-screen summary
 * and the CSV export route.
 */
import type {
  CorrectiveActionStatus,
  ObservationStatus,
  RiskLevel,
} from '@coalguard/types';
import { createClient } from '@/lib/supabase/server';
import { CA_PENDING_STATUSES } from '@/lib/status';
import { getComplianceRegister } from './compliance';

export type ReportType = 'inspections' | 'observations' | 'corrective-actions' | 'compliance';

export const REPORT_TYPES: { value: ReportType; label: string }[] = [
  { value: 'inspections', label: 'Inspection summary' },
  { value: 'observations', label: 'Risk & observation summary' },
  { value: 'corrective-actions', label: 'Corrective action summary' },
  { value: 'compliance', label: 'Compliance summary' },
];

export interface ReportSummary {
  scopeLabel: string;
  generatedAt: string;
  inspections: {
    total: number;
    submitted: number;
    inProgress: number;
    closed: number;
    latest: string | null;
  };
  risk: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    open: number;
  };
  correctiveActions: {
    total: number;
    pending: number;
    verified: number;
    overdue: number;
  };
  compliance: {
    total: number;
    compliant: number;
    dueSoon: number;
    overdueOrAtRisk: number;
  };
}

function countBy<T extends string>(rows: { [k: string]: unknown }[], key: string): Record<T, number> {
  const out = {} as Record<T, number>;
  for (const r of rows) {
    const v = r[key] as T;
    out[v] = (out[v] ?? 0) + 1;
  }
  return out;
}

export async function getReportSummary(opts: {
  mineId?: string;
  scopeLabel: string;
}): Promise<ReportSummary> {
  const supabase = await createClient();
  const mineId = opts.mineId;

  const inspQ = supabase
    .from('inspections')
    .select('status, created_at, submitted_at')
    .order('created_at', { ascending: false })
    .limit(2000);
  const obsQ = supabase.from('observations').select('risk, status').limit(5000);
  const caQ = supabase.from('corrective_actions').select('status, due_date').limit(5000);

  const [insp, obs, ca, compliance] = await Promise.all([
    mineId ? inspQ.eq('mine_id', mineId) : inspQ,
    mineId ? obsQ.eq('mine_id', mineId) : obsQ,
    mineId ? caQ.eq('mine_id', mineId) : caQ,
    getComplianceRegister({ mineId }),
  ]);

  const inspRows = (insp.data ?? []) as { status: string; created_at: string; submitted_at: string | null }[];
  const obsRows = (obs.data ?? []) as { risk: RiskLevel; status: ObservationStatus }[];
  const caRows = (ca.data ?? []) as { status: CorrectiveActionStatus; due_date: string | null }[];

  const inspByStatus = countBy(inspRows, 'status');
  const riskByBand = countBy<RiskLevel>(obsRows, 'risk');
  const openObs = obsRows.filter((o) =>
    ['open', 'action_required', 'in_progress'].includes(o.status),
  ).length;
  const caPending = caRows.filter((c) => CA_PENDING_STATUSES.includes(c.status)).length;
  const caVerified = caRows.filter((c) => c.status === 'verified' || c.status === 'closed').length;
  const caOverdue = caRows.filter(
    (c) =>
      c.due_date !== null &&
      c.status !== 'verified' &&
      c.status !== 'closed' &&
      new Date(c.due_date).getTime() < Date.now(),
  ).length;

  return {
    scopeLabel: opts.scopeLabel,
    generatedAt: new Date().toISOString(),
    inspections: {
      total: inspRows.length,
      submitted: (inspByStatus.submitted ?? 0) + (inspByStatus.under_review ?? 0),
      inProgress: inspByStatus.in_progress ?? 0,
      closed: inspByStatus.closed ?? 0,
      latest: inspRows[0]?.submitted_at ?? inspRows[0]?.created_at ?? null,
    },
    risk: {
      total: obsRows.length,
      critical: riskByBand.critical ?? 0,
      high: riskByBand.high ?? 0,
      medium: riskByBand.medium ?? 0,
      low: riskByBand.low ?? 0,
      open: openObs,
    },
    correctiveActions: {
      total: caRows.length,
      pending: caPending,
      verified: caVerified,
      overdue: caOverdue,
    },
    compliance: {
      total: compliance.kpis.total,
      compliant: compliance.kpis.compliant,
      dueSoon: compliance.kpis.dueSoon,
      overdueOrAtRisk:
        compliance.kpis.overdue + compliance.kpis.atRisk + compliance.kpis.nonCompliant,
    },
  };
}

/* ------------------------------ CSV export ------------------------------ */

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: (string | number | null)[][]): string {
  const lines = [headers.map(csvEscape).join(',')];
  for (const r of rows) lines.push(r.map(csvEscape).join(','));
  return lines.join('\r\n');
}

export async function buildReportCsv(
  type: ReportType,
  mineId?: string,
): Promise<{ filename: string; csv: string }> {
  const supabase = await createClient();
  const scoped = <T extends { eq: (c: string, v: string) => T }>(q: T) =>
    mineId ? q.eq('mine_id', mineId) : q;
  const stamp = new Date().toISOString().slice(0, 10);

  if (type === 'inspections') {
    const { data } = await scoped(
      supabase
        .from('inspections')
        .select(
          `title, inspection_type, status, overall_risk, scheduled_for, submitted_at, created_at,
           mine:mines!inspections_mine_id_fkey(name),
           inspector:profiles!inspections_inspector_id_fkey(full_name)`,
        )
        .order('created_at', { ascending: false })
        .limit(5000),
    );
    const rows = ((data ?? []) as Record<string, unknown>[]).map((r) => {
      const mine = (Array.isArray(r.mine) ? r.mine[0] : r.mine) as { name?: string } | null;
      const insp = (Array.isArray(r.inspector) ? r.inspector[0] : r.inspector) as
        | { full_name?: string }
        | null;
      return [
        r.title as string,
        r.inspection_type as string,
        r.status as string,
        (r.overall_risk as string) ?? '',
        (r.scheduled_for as string) ?? '',
        (r.submitted_at as string) ?? '',
        r.created_at as string,
        mine?.name ?? '',
        insp?.full_name ?? '',
      ];
    });
    return {
      filename: `minex-inspections-${stamp}.csv`,
      csv: toCsv(
        ['Title', 'Type', 'Status', 'Overall risk', 'Scheduled for', 'Submitted at', 'Created at', 'Mine', 'Inspector'],
        rows,
      ),
    };
  }

  if (type === 'observations') {
    const { data } = await scoped(
      supabase
        .from('observations')
        .select(
          `title, category, risk, status, occurred_at, created_at,
           mine:mines!observations_mine_id_fkey(name),
           raised_by_profile:profiles!observations_raised_by_fkey(full_name)`,
        )
        .order('created_at', { ascending: false })
        .limit(5000),
    );
    const rows = ((data ?? []) as Record<string, unknown>[]).map((r) => {
      const mine = (Array.isArray(r.mine) ? r.mine[0] : r.mine) as { name?: string } | null;
      const who = (Array.isArray(r.raised_by_profile) ? r.raised_by_profile[0] : r.raised_by_profile) as
        | { full_name?: string }
        | null;
      return [
        r.title as string,
        (r.category as string) ?? '',
        r.risk as string,
        r.status as string,
        (r.occurred_at as string) ?? '',
        r.created_at as string,
        mine?.name ?? '',
        who?.full_name ?? '',
      ];
    });
    return {
      filename: `minex-observations-${stamp}.csv`,
      csv: toCsv(
        ['Title', 'Category', 'Risk', 'Status', 'Occurred at', 'Created at', 'Mine', 'Raised by'],
        rows,
      ),
    };
  }

  if (type === 'corrective-actions') {
    const { data } = await scoped(
      supabase
        .from('corrective_actions')
        .select(
          `title, priority, status, due_date, assigned_at, submitted_at, verified_at, created_at,
           mine:mines!corrective_actions_mine_id_fkey(name),
           assignee:profiles!corrective_actions_assigned_to_fkey(full_name),
           observation:observations!corrective_actions_observation_id_fkey(title, risk)`,
        )
        .order('created_at', { ascending: false })
        .limit(5000),
    );
    const rows = ((data ?? []) as Record<string, unknown>[]).map((r) => {
      const mine = (Array.isArray(r.mine) ? r.mine[0] : r.mine) as { name?: string } | null;
      const who = (Array.isArray(r.assignee) ? r.assignee[0] : r.assignee) as
        | { full_name?: string }
        | null;
      const obs = (Array.isArray(r.observation) ? r.observation[0] : r.observation) as
        | { title?: string; risk?: string }
        | null;
      return [
        r.title as string,
        r.priority as string,
        r.status as string,
        (r.due_date as string) ?? '',
        (r.assigned_at as string) ?? '',
        (r.submitted_at as string) ?? '',
        (r.verified_at as string) ?? '',
        r.created_at as string,
        mine?.name ?? '',
        who?.full_name ?? '',
        obs?.title ?? '',
        obs?.risk ?? '',
      ];
    });
    return {
      filename: `minex-corrective-actions-${stamp}.csv`,
      csv: toCsv(
        [
          'Title',
          'Priority',
          'Status',
          'Due date',
          'Assigned at',
          'Submitted at',
          'Verified at',
          'Created at',
          'Mine',
          'Assignee',
          'Linked observation',
          'Observation risk',
        ],
        rows,
      ),
    };
  }

  // compliance
  const register = await getComplianceRegister({ mineId });
  const rows = register.rows.map((r) => [
    r.code,
    r.title,
    r.authority,
    r.category ?? '',
    r.priority ?? '',
    r.status,
    r.dueDate ?? '',
    r.overdue ? 'yes' : 'no',
    r.ownerName ?? '',
    r.ownerRole ?? '',
    r.mineName ?? '',
  ]);
  return {
    filename: `minex-compliance-${stamp}.csv`,
    csv: toCsv(
      ['Code', 'Requirement', 'Authority', 'Category', 'Priority', 'Status', 'Due date', 'Overdue', 'Responsible', 'Role', 'Mine'],
      rows,
    ),
  };
}
