import type { Metadata } from 'next';
import { ClipboardList } from 'lucide-react';
import type { InspectionStatus, RiskLevel } from '@coalguard/types';
import { getCommandContext } from '@/lib/data/context';
import { listInspections } from '@/lib/data/inspections';
import { INSPECTION_STATUS_META, INSPECTION_STATUS_ORDER, RISK_META, RISK_ORDER } from '@/lib/status';
import { PageHeader } from '@/components/ui/page-header';
import { FilterBar } from '@/components/ui/filter-bar';
import { ParamSelect } from '@/components/ui/param-select';
import { Pagination } from '@/components/ui/pagination';
import { EmptyState } from '@/components/ui/empty-state';
import { TableShell, Th, Td, Tr, CellLink } from '@/components/ui/data-table';
import { InspectionStatusTag, RiskTag } from '@/components/ui/status-badge';
import { formatDate } from '@/lib/format';

export const metadata: Metadata = { title: 'Inspections' };
export const dynamic = 'force-dynamic';

const str = (v: string | string[] | undefined) => (typeof v === 'string' && v ? v : undefined);

export default async function InspectionsPage({
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
  const riskParam = str(sp.risk);
  const page = Number(str(sp.page) ?? '1') || 1;

  const result = await listInspections({
    search: str(sp.q),
    status: INSPECTION_STATUS_ORDER.includes(statusParam as InspectionStatus)
      ? (statusParam as InspectionStatus)
      : undefined,
    risk: RISK_ORDER.includes(riskParam as RiskLevel) ? (riskParam as RiskLevel) : undefined,
    mineId: activeMine,
    page,
  });

  return (
    <div className="space-y-5">
      <PageHeader
        kicker="Field operations"
        title="Inspections"
        description="Every inspection submitted from the field, newest first."
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterBar
          searchPlaceholder="Search by title…"
          selects={[
            {
              key: 'status',
              label: 'Status',
              options: INSPECTION_STATUS_ORDER.map((s) => ({
                value: s,
                label: INSPECTION_STATUS_META[s].label,
              })),
            },
            {
              key: 'risk',
              label: 'Risk',
              options: RISK_ORDER.map((r) => ({ value: r, label: RISK_META[r].label })),
            },
          ]}
        />
        {context.mines.length > 1 ? (
          <ParamSelect
            paramKey="mine"
            allLabel="All mines in scope"
            options={context.mines.map((m) => ({ value: m.id, label: `${m.name} (${m.code})` }))}
          />
        ) : null}
      </div>

      {result.rows.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No inspections found"
          message={
            str(sp.q) || statusParam || riskParam
              ? 'No inspections match the current filters.'
              : 'No inspections have been recorded yet.'
          }
        />
      ) : (
        <>
          <TableShell>
            <thead>
              <tr>
                <Th>Inspection</Th>
                <Th>Template</Th>
                <Th>Inspector</Th>
                <Th>Mine</Th>
                <Th>Status</Th>
                <Th>Risk</Th>
                <Th>Started</Th>
                <Th>Completed</Th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((r) => (
                <Tr key={r.id}>
                  <Td>
                    <CellLink href={`/inspections/${r.id}`}>{r.title}</CellLink>
                    <span className="mt-0.5 block text-xs text-secondary">
                      {r.observationCount} observation{r.observationCount === 1 ? '' : 's'}
                    </span>
                  </Td>
                  <Td className="text-secondary">{r.templateName ?? '--'}</Td>
                  <Td className="text-secondary">{r.inspectorName ?? '--'}</Td>
                  <Td className="text-secondary">{r.mineName ?? '--'}</Td>
                  <Td>
                    <InspectionStatusTag status={r.status} />
                  </Td>
                  <Td>{r.overallRisk ? <RiskTag risk={r.overallRisk} /> : <span className="text-secondary">--</span>}</Td>
                  <Td className="whitespace-nowrap text-secondary">{formatDate(r.startedAt)}</Td>
                  <Td className="whitespace-nowrap text-secondary">{formatDate(r.submittedAt)}</Td>
                </Tr>
              ))}
            </tbody>
          </TableShell>
          <Pagination
            page={result.page}
            pageCount={result.pageCount}
            total={result.total}
            pageSize={result.pageSize}
          />
        </>
      )}
    </div>
  );
}
