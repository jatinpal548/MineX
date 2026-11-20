import type { Metadata } from 'next';
import { MessageSquareWarning, CheckCircle2, Clock } from 'lucide-react';
import type { GrievanceStatus } from '@coalguard/types';
import { loadScopedCommandPage } from '@/lib/data/context';
import {
  getGrievanceData,
  GRIEVANCE_STATUS_META,
  GRIEVANCE_STATUS_ORDER,
} from '@/lib/data/grievances';
import { PageHeader } from '@/components/ui/page-header';
import { KpiCard } from '@/components/ui/kpi-card';
import { Panel } from '@/components/ui/panel';
import { FilterBar } from '@/components/ui/filter-bar';
import { ParamSelect } from '@/components/ui/param-select';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { TableShell, Th, Td, Tr, CellLink } from '@/components/ui/data-table';
import { formatDate } from '@/lib/format';

export const metadata: Metadata = { title: 'Grievances' };
export const dynamic = 'force-dynamic';

const str = (v: string | string[] | undefined) => (typeof v === 'string' && v ? v : undefined);

export default async function GrievancesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const statusParam = str(sp.status);

  const loaded = await loadScopedCommandPage(str(sp.mine), (mineId) =>
    getGrievanceData({
      mineId,
      status: GRIEVANCE_STATUS_ORDER.includes(statusParam as GrievanceStatus)
        ? (statusParam as GrievanceStatus)
        : undefined,
    }),
  );
  if (!loaded) return null;
  const { context, data } = loaded;

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="People"
        title="Grievance Handling"
        description="Worker and contractor grievances with status, ownership and resolution trail."
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
        <KpiCard label="Total Grievances" value={data.rows.length} icon={MessageSquareWarning} />
        <KpiCard
          label="Open"
          value={data.open}
          icon={Clock}
          tone={data.open > 0 ? 'warning' : 'safe'}
          hint="Open / acknowledged / in review"
        />
        <KpiCard
          label="Resolved"
          value={data.resolvedThisSet}
          icon={CheckCircle2}
          tone="safe"
        />
        <KpiCard
          label="Avg Resolution"
          value={data.avgResolutionDays !== null ? `${data.avgResolutionDays}d` : '—'}
          icon={Clock}
          hint="Submitted to resolved"
        />
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <FilterBar
          showSearch={false}
          selects={[
            {
              key: 'status',
              label: 'Status',
              options: GRIEVANCE_STATUS_ORDER.map((s) => ({
                value: s,
                label: GRIEVANCE_STATUS_META[s].label,
              })),
            },
          ]}
        />
      </div>

      <Panel title="Grievance Register" bodyClassName="p-0">
        {data.rows.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={MessageSquareWarning}
              title="No grievances"
              message="No grievances match the current filters for this scope."
            />
          </div>
        ) : (
          <TableShell>
            <thead>
              <tr>
                <Th>Grievance</Th>
                <Th>Category</Th>
                <Th>Raised by</Th>
                <Th>Responsible</Th>
                <Th>Submitted</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((g) => (
                <Tr key={g.id}>
                  <Td>
                    <CellLink href={`/grievances/${g.id}`}>{g.title}</CellLink>
                    <span className="mt-0.5 block text-xs text-secondary">
                      {g.mineName ?? '—'} · {g.ageDays}d old
                    </span>
                  </Td>
                  <Td className="text-secondary">{g.category ?? '—'}</Td>
                  <Td className="text-secondary">{g.raisedBy}</Td>
                  <Td className="text-secondary">{g.assignedTo ?? 'Unassigned'}</Td>
                  <Td className="whitespace-nowrap text-secondary">{formatDate(g.createdAt)}</Td>
                  <Td>
                    <Badge tone={GRIEVANCE_STATUS_META[g.status].tone}>
                      {GRIEVANCE_STATUS_META[g.status].label}
                    </Badge>
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
