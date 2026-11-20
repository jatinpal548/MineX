import type { Metadata } from 'next';
import { Wrench } from 'lucide-react';
import type { CorrectiveActionPriority, CorrectiveActionStatus } from '@coalguard/types';
import { CORRECTIVE_ACTION_PRIORITIES } from '@coalguard/types';
import { loadScopedCommandPage } from '@/lib/data/context';
import { listCorrectiveActions } from '@/lib/data/corrective-actions';
import { CA_STATUS_META, CA_STATUS_ORDER } from '@/lib/status';
import { PageHeader } from '@/components/ui/page-header';
import { FilterBar } from '@/components/ui/filter-bar';
import { ParamSelect } from '@/components/ui/param-select';
import { Pagination } from '@/components/ui/pagination';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { TableShell, Th, Td, Tr, CellLink } from '@/components/ui/data-table';
import { CorrectiveActionStatusTag, PriorityTag } from '@/components/ui/status-badge';
import { formatDate } from '@/lib/format';

export const metadata: Metadata = { title: 'Corrective Actions' };
export const dynamic = 'force-dynamic';

const str = (v: string | string[] | undefined) => (typeof v === 'string' && v ? v : undefined);
const DUE_OPTIONS = [
  { value: 'overdue', label: 'Overdue' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'none', label: 'No due date' },
];

export default async function CorrectiveActionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const statusParam = str(sp.status);
  const priorityParam = str(sp.priority);
  const dueParam = str(sp.due);
  const page = Number(str(sp.page) ?? '1') || 1;

  const loaded = await loadScopedCommandPage(str(sp.mine), (mineId) =>
    listCorrectiveActions({
      search: str(sp.q),
      status: CA_STATUS_ORDER.includes(statusParam as CorrectiveActionStatus)
        ? (statusParam as CorrectiveActionStatus)
        : undefined,
      priority: CORRECTIVE_ACTION_PRIORITIES.includes(priorityParam as CorrectiveActionPriority)
        ? (priorityParam as CorrectiveActionPriority)
        : undefined,
      due:
        dueParam === 'overdue' || dueParam === 'upcoming' || dueParam === 'none'
          ? dueParam
          : undefined,
      mineId,
      page,
    }),
  );
  if (!loaded) return null;
  const { context, data: result } = loaded;

  return (
    <div className="space-y-5">
      <PageHeader
        kicker="Governance"
        title="Corrective Actions"
        description="Actions raised against field observations. Review status and ownership."
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterBar
          searchPlaceholder="Search by title…"
          selects={[
            {
              key: 'status',
              label: 'Status',
              options: CA_STATUS_ORDER.map((s) => ({
                value: s,
                label: CA_STATUS_META[s].label,
              })),
            },
            {
              key: 'priority',
              label: 'Priority',
              options: CORRECTIVE_ACTION_PRIORITIES.map((p) => ({
                value: p,
                label: p.charAt(0).toUpperCase() + p.slice(1),
              })),
            },
            { key: 'due', label: 'Due', options: DUE_OPTIONS },
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
          icon={Wrench}
          title="No corrective actions found"
          message={
            str(sp.q) || statusParam || priorityParam || dueParam
              ? 'No corrective actions match the current filters.'
              : 'No corrective actions require attention.'
          }
        />
      ) : (
        <>
          <TableShell>
            <thead>
              <tr>
                <Th>Action</Th>
                <Th>Related observation</Th>
                <Th>Assignee</Th>
                <Th>Due date</Th>
                <Th>Priority</Th>
                <Th>Status</Th>
                <Th>Last updated</Th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((r) => (
                <Tr key={r.id}>
                  <Td>
                    <CellLink href={`/corrective-actions/${r.id}`}>{r.title}</CellLink>
                    {r.mineName ? (
                      <span className="mt-0.5 block text-xs text-secondary">{r.mineName}</span>
                    ) : null}
                  </Td>
                  <Td className="text-secondary">
                    {r.observation ? (
                      <CellLink href={`/observations/${r.observation.id}`}>
                        {r.observation.title}
                      </CellLink>
                    ) : (
                      '--'
                    )}
                  </Td>
                  <Td className="text-secondary">{r.assigneeName ?? 'Unassigned'}</Td>
                  <Td className="whitespace-nowrap">
                    {r.dueDate ? (
                      <span className={r.overdue ? 'font-medium text-critical-600' : 'text-secondary'}>
                        {formatDate(r.dueDate)}
                        {r.overdue ? ' · overdue' : ''}
                      </span>
                    ) : (
                      <span className="text-secondary">--</span>
                    )}
                  </Td>
                  <Td>
                    <PriorityTag priority={r.priority} />
                  </Td>
                  <Td>
                    <CorrectiveActionStatusTag status={r.status} />
                  </Td>
                  <Td className="whitespace-nowrap text-secondary">
                    {formatDate(r.updatedAt)}
                    {r.verifiedAt ? (
                      <Badge tone="safe" className="ml-2">
                        Verified
                      </Badge>
                    ) : null}
                  </Td>
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
