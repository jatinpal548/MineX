import type { Metadata } from 'next';
import { TriangleAlert } from 'lucide-react';
import type { ObservationStatus, RiskLevel } from '@coalguard/types';
import { getCommandContext } from '@/lib/data/context';
import { listObservations } from '@/lib/data/observations';
import {
  OBSERVATION_STATUS_META,
  OBSERVATION_STATUS_ORDER,
  RISK_META,
  RISK_ORDER,
} from '@/lib/status';
import { PageHeader } from '@/components/ui/page-header';
import { FilterBar } from '@/components/ui/filter-bar';
import { ParamSelect } from '@/components/ui/param-select';
import { Pagination } from '@/components/ui/pagination';
import { EmptyState } from '@/components/ui/empty-state';
import { TableShell, Th, Td, Tr, CellLink } from '@/components/ui/data-table';
import { ObservationStatusTag, RiskTag } from '@/components/ui/status-badge';
import { formatDate } from '@/lib/format';

export const metadata: Metadata = { title: 'Observations' };
export const dynamic = 'force-dynamic';

const str = (v: string | string[] | undefined) => (typeof v === 'string' && v ? v : undefined);

export default async function ObservationsPage({
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

  const result = await listObservations({
    search: str(sp.q),
    status: OBSERVATION_STATUS_ORDER.includes(statusParam as ObservationStatus)
      ? (statusParam as ObservationStatus)
      : undefined,
    risk: RISK_ORDER.includes(riskParam as RiskLevel) ? (riskParam as RiskLevel) : undefined,
    mineId: activeMine,
    page,
  });

  return (
    <div className="space-y-5">
      <PageHeader
        kicker="Field operations"
        title="Observations"
        description="Findings raised by inspectors in the field."
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterBar
          searchPlaceholder="Search by title…"
          selects={[
            {
              key: 'risk',
              label: 'Risk',
              options: RISK_ORDER.map((r) => ({ value: r, label: RISK_META[r].label })),
            },
            {
              key: 'status',
              label: 'Status',
              options: OBSERVATION_STATUS_ORDER.map((s) => ({
                value: s,
                label: OBSERVATION_STATUS_META[s].label,
              })),
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
          icon={TriangleAlert}
          title="No observations found"
          message={
            str(sp.q) || statusParam || riskParam
              ? 'No observations match the current filters.'
              : 'No active observations.'
          }
        />
      ) : (
        <>
          <TableShell>
            <thead>
              <tr>
                <Th>Observation</Th>
                <Th>Risk</Th>
                <Th>Inspection</Th>
                <Th>Mine</Th>
                <Th>Inspector</Th>
                <Th>Status</Th>
                <Th>Created</Th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((r) => (
                <Tr key={r.id}>
                  <Td>
                    <CellLink href={`/observations/${r.id}`}>{r.title}</CellLink>
                    <span className="mt-0.5 block text-xs text-secondary">
                      {r.category ?? 'Uncategorised'}
                      {r.evidenceCount > 0 ? ` · ${r.evidenceCount} photo(s)` : ''}
                    </span>
                  </Td>
                  <Td>
                    <RiskTag risk={r.risk} />
                  </Td>
                  <Td className="text-secondary">
                    {r.inspection ? (
                      <CellLink href={`/inspections/${r.inspection.id}`}>
                        {r.inspection.title}
                      </CellLink>
                    ) : (
                      '--'
                    )}
                  </Td>
                  <Td className="text-secondary">{r.mineName ?? '--'}</Td>
                  <Td className="text-secondary">{r.inspectorName ?? '--'}</Td>
                  <Td>
                    <ObservationStatusTag status={r.status} />
                  </Td>
                  <Td className="whitespace-nowrap text-secondary">{formatDate(r.createdAt)}</Td>
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
