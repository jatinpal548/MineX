import type { Metadata } from 'next';
import Link from 'next/link';
import { CalendarClock, ShieldCheck, ShieldAlert, ShieldX, UserCog } from 'lucide-react';
import type { ComplianceStatus, RiskLevel } from '@coalguard/types';
import { getCommandContext } from '@/lib/data/context';
import {
  getComplianceRegister,
  COMPLIANCE_STATUS_META,
  COMPLIANCE_STATUS_ORDER,
  PRIORITY_META,
} from '@/lib/data/compliance';
import { PageHeader } from '@/components/ui/page-header';
import { KpiCard } from '@/components/ui/kpi-card';
import { Panel } from '@/components/ui/panel';
import { FilterBar } from '@/components/ui/filter-bar';
import { ParamSelect } from '@/components/ui/param-select';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { TableShell, Th, Td, Tr, CellLink } from '@/components/ui/data-table';
import { formatDate } from '@/lib/format';

export const metadata: Metadata = { title: 'Compliance' };
export const dynamic = 'force-dynamic';

const str = (v: string | string[] | undefined) => (typeof v === 'string' && v ? v : undefined);
const PRIORITIES: RiskLevel[] = ['critical', 'high', 'medium', 'low'];

function StatusTag({ status }: { status: ComplianceStatus }) {
  const m = COMPLIANCE_STATUS_META[status];
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

function PriorityTag({ priority }: { priority: RiskLevel | null }) {
  if (!priority) return <span className="text-secondary">--</span>;
  const m = PRIORITY_META[priority];
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

function dueLabel(row: { dueDate: string | null; overdue: boolean; daysToDue: number | null }) {
  if (!row.dueDate) return <span className="text-secondary">--</span>;
  if (row.overdue)
    return (
      <span className="font-medium text-critical-600">
        {formatDate(row.dueDate)} · {Math.abs(row.daysToDue ?? 0)}d overdue
      </span>
    );
  if (row.daysToDue !== null && row.daysToDue <= 30)
    return (
      <span className="font-medium text-warning-600">
        {formatDate(row.dueDate)} · in {row.daysToDue}d
      </span>
    );
  return <span className="text-secondary">{formatDate(row.dueDate)}</span>;
}

export default async function CompliancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const context = await getCommandContext();
  if (!context) return null;

  const mineParam = str(sp.mine);
  const activeMine =
    mineParam && context.mines.some((m) => m.id === mineParam) ? mineParam : undefined;
  const statusParam = str(sp.status);
  const priorityParam = str(sp.priority);
  const categoryParam = str(sp.category);

  const register = await getComplianceRegister({
    mineId: activeMine,
    status: COMPLIANCE_STATUS_ORDER.includes(statusParam as ComplianceStatus)
      ? (statusParam as ComplianceStatus)
      : undefined,
    priority: PRIORITIES.includes(priorityParam as RiskLevel)
      ? (priorityParam as RiskLevel)
      : undefined,
    category: categoryParam,
  });

  const { rows, kpis, statusDistribution, owners, upcoming, coverage } = register;
  const categories = [...new Set(rows.map((r) => r.category).filter(Boolean))] as string[];
  const maxStatus = Math.max(1, ...statusDistribution.map((s) => s.count));

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Governance"
        title="Compliance Intelligence"
        description="Statutory compliance register across DGMS, MoEFCC, CPCB and CGWA obligations, with risk-ranked priorities and deadlines."
        actions={
          context.mines.length > 1 ? (
            <ParamSelect
              paramKey="mine"
              allLabel={context.canSeeAllMines ? 'All mines' : 'All mines in scope'}
              options={context.mines.map((m) => ({ value: m.id, label: `${m.name} (${m.code})` }))}
            />
          ) : null
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total Requirements" value={kpis.total} icon={ShieldCheck} hint="In scope" />
        <KpiCard
          label="Compliant"
          value={kpis.compliant}
          icon={ShieldCheck}
          tone={kpis.compliant > 0 ? 'safe' : 'neutral'}
          hint={kpis.total ? `${Math.round((kpis.compliant / kpis.total) * 100)}% of register` : '--'}
        />
        <KpiCard
          label="Due Soon"
          value={kpis.dueSoon}
          icon={CalendarClock}
          tone={kpis.dueSoon > 0 ? 'warning' : 'neutral'}
          hint="Open, due within 30 days"
        />
        <KpiCard
          label="Overdue / At Risk"
          value={kpis.overdue + kpis.atRisk + kpis.nonCompliant}
          icon={ShieldAlert}
          tone={kpis.overdue + kpis.atRisk + kpis.nonCompliant > 0 ? 'critical' : 'neutral'}
          hint={`${kpis.overdue} overdue · ${kpis.atRisk} at risk · ${kpis.nonCompliant} non-compliant`}
        />
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {coverage.map((d) => (
          <div key={d.domain} className="cg-card p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-primary">{d.domain}</p>
              <span className="text-xs text-secondary">{d.total} req.</span>
            </div>
            <div className="mt-2 flex items-baseline gap-3 text-xs">
              <span className="text-safe-600">{d.compliant} compliant</span>
              <span className={d.atRisk > 0 ? 'text-critical-600' : 'text-secondary'}>
                {d.atRisk} open
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-muted">
              <div
                className="h-full rounded-full bg-safe-600"
                style={{ width: `${d.total > 0 ? (d.compliant / d.total) * 100 : 0}%` }}
              />
            </div>
          </div>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Panel title="Compliance Status Distribution" className="lg:col-span-1">
          <ul className="space-y-3">
            {statusDistribution.map((s) => (
              <li key={s.status}>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-primary">{s.label}</span>
                  <span className="tabular-nums text-secondary">{s.count}</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-muted">
                  <div
                    className={
                      s.status === 'compliant'
                        ? 'h-full rounded-full bg-safe-600'
                        : s.status === 'pending_review'
                          ? 'h-full rounded-full bg-warning-600'
                          : s.status === 'at_risk'
                            ? 'h-full rounded-full bg-high-risk-600'
                            : 'h-full rounded-full bg-critical-600'
                    }
                    style={{ width: `${(s.count / maxStatus) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel
          title="Upcoming Deadlines"
          description="Open obligations, earliest first"
          className="lg:col-span-1"
        >
          {upcoming.length === 0 ? (
            <EmptyState icon={CalendarClock} title="Nothing due" message="No open deadlines." compact />
          ) : (
            <ul className="divide-y divide-border">
              {upcoming.map((r) => (
                <li key={r.id} className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <Link
                      href={`/compliance/${r.id}`}
                      className="block truncate text-sm font-medium text-primary hover:text-accent-600 hover:underline"
                    >
                      {r.title}
                    </Link>
                    <span className="text-xs text-secondary">{r.code}</span>
                  </div>
                  <div className="shrink-0 text-right text-xs">{dueLabel(r)}</div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="Responsible Officers"
          description="Ownership across the register"
          className="lg:col-span-1"
        >
          {owners.length === 0 ? (
            <EmptyState icon={UserCog} title="No owners assigned" compact />
          ) : (
            <ul className="divide-y divide-border">
              {owners.map((o) => (
                <li key={o.name} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-primary">{o.name}</p>
                    {o.role ? <p className="text-xs text-secondary">{o.role}</p> : null}
                  </div>
                  <div className="shrink-0 text-right text-xs text-secondary">
                    <span className="font-medium text-primary">{o.open}</span> open / {o.total}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterBar
          showSearch={false}
          selects={[
            {
              key: 'status',
              label: 'Status',
              options: COMPLIANCE_STATUS_ORDER.map((s) => ({
                value: s,
                label: COMPLIANCE_STATUS_META[s].label,
              })),
            },
            {
              key: 'priority',
              label: 'Priority',
              options: PRIORITIES.map((p) => ({ value: p, label: PRIORITY_META[p].label })),
            },
            {
              key: 'category',
              label: 'Category',
              options: categories.map((c) => ({ value: c, label: c })),
            },
          ]}
        />
      </div>

      <Panel title="Compliance Register" bodyClassName="p-0">
        {rows.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={ShieldX}
              title="No compliance records"
              message="No compliance records match the current filters for this scope."
            />
          </div>
        ) : (
          <TableShell>
            <thead>
              <tr>
                <Th>Requirement</Th>
                <Th>Authority</Th>
                <Th>Priority</Th>
                <Th>Status</Th>
                <Th>Due</Th>
                <Th>Responsible</Th>
                <Th>Linked finding</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Tr key={r.id}>
                  <Td>
                    <CellLink href={`/compliance/${r.id}`}>{r.title}</CellLink>
                    <span className="mt-0.5 block text-xs text-secondary">
                      {r.code}
                      {r.category ? ` · ${r.category}` : ''}
                      {r.frequency ? ` · ${r.frequency}` : ''}
                    </span>
                  </Td>
                  <Td className="text-secondary">{r.authority}</Td>
                  <Td>
                    <PriorityTag priority={r.priority} />
                  </Td>
                  <Td>
                    <StatusTag status={r.status} />
                  </Td>
                  <Td className="whitespace-nowrap">{dueLabel(r)}</Td>
                  <Td className="text-secondary">
                    {r.ownerName ?? '--'}
                    {r.ownerRole ? (
                      <span className="mt-0.5 block text-xs text-secondary">{r.ownerRole}</span>
                    ) : null}
                  </Td>
                  <Td>
                    {r.observationId ? (
                      <CellLink href={`/observations/${r.observationId}`}>View observation</CellLink>
                    ) : (
                      <span className="text-secondary">--</span>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Panel>
    </div>
  );
}
