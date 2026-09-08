import type { Metadata } from 'next';
import { Activity, Gauge, Mountain, Package, Wind, Wrench } from 'lucide-react';
import { getCommandContext } from '@/lib/data/context';
import { getOperationsData, EQUIPMENT_STATUS_META } from '@/lib/data/operations';
import { PageHeader } from '@/components/ui/page-header';
import { KpiCard } from '@/components/ui/kpi-card';
import { Panel } from '@/components/ui/panel';
import { ParamSelect } from '@/components/ui/param-select';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { TableShell, Th, Td, Tr } from '@/components/ui/data-table';
import { formatDate, formatDateTime } from '@/lib/format';

export const metadata: Metadata = { title: 'Mine Operations' };
export const dynamic = 'force-dynamic';

const str = (v: string | string[] | undefined) => (typeof v === 'string' && v ? v : undefined);

export default async function MineOperationsPage({
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

  const data = await getOperationsData({ mineId: activeMine });
  const operational = data.equipment.filter((e) => e.status === 'operational').length;
  const downForMaintenance = data.equipment.filter(
    (e) => e.status === 'maintenance' || e.status === 'breakdown',
  ).length;

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Operations"
        title="Mine Operations"
        description="Equipment health, maintenance, boundary environmental monitoring and operational reporting."
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

      {!data.hasData ? (
        <EmptyState
          icon={Mountain}
          title="No operations data in scope"
          message="No equipment or environmental readings are recorded for the selected mine yet."
        />
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Equipment Tracked" value={data.equipment.length} icon={Gauge} />
            <KpiCard
              label="Operational"
              value={operational}
              icon={Activity}
              tone={operational > 0 ? 'safe' : 'neutral'}
            />
            <KpiCard
              label="Maintenance Due"
              value={data.maintenanceDue}
              icon={Wrench}
              tone={data.maintenanceOverdue > 0 ? 'critical' : data.maintenanceDue > 0 ? 'warning' : 'safe'}
              hint={`${data.maintenanceOverdue} overdue · ${downForMaintenance} unit(s) down`}
            />
            <KpiCard
              label="Environmental Breaches"
              value={data.breaches}
              icon={Wind}
              tone={data.breaches > 0 ? 'critical' : 'safe'}
              hint="Latest readings above threshold"
            />
          </section>

          <Panel title="Equipment Status" bodyClassName="p-0">
            {data.equipment.length === 0 ? (
              <div className="p-5">
                <EmptyState icon={Gauge} title="No equipment" compact />
              </div>
            ) : (
              <TableShell>
                <thead>
                  <tr>
                    <Th>Asset</Th>
                    <Th>Category</Th>
                    <Th>Status</Th>
                    <Th>Mine</Th>
                    <Th>Next service</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.equipment.map((e) => (
                    <Tr key={e.id}>
                      <Td>
                        <span className="font-medium text-primary">{e.name}</span>
                        <span className="mt-0.5 block text-xs text-secondary">{e.assetCode}</span>
                      </Td>
                      <Td className="text-secondary">{e.category ?? '—'}</Td>
                      <Td>
                        <Badge tone={EQUIPMENT_STATUS_META[e.status].tone}>
                          {EQUIPMENT_STATUS_META[e.status].label}
                        </Badge>
                      </Td>
                      <Td className="text-secondary">{e.mineName ?? '—'}</Td>
                      <Td className="text-secondary">
                        {e.nextServiceDue ? formatDate(e.nextServiceDue) : 'Not scheduled'}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </TableShell>
            )}
          </Panel>

          <Panel title="Maintenance" description="Scheduled, in progress and completed jobs" bodyClassName="p-0">
            {data.maintenance.length === 0 ? (
              <div className="p-5">
                <EmptyState icon={Wrench} title="No maintenance records" compact />
              </div>
            ) : (
              <TableShell>
                <thead>
                  <tr>
                    <Th>Asset</Th>
                    <Th>Type</Th>
                    <Th>Scheduled</Th>
                    <Th>Status</Th>
                    <Th>Downtime</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.maintenance.map((m) => (
                    <Tr key={m.id}>
                      <Td>
                        <span className="font-medium text-primary">{m.equipmentName ?? '—'}</span>
                        <span className="mt-0.5 block text-xs text-secondary">
                          {m.assetCode ?? ''}
                          {m.description ? ` · ${m.description}` : ''}
                        </span>
                      </Td>
                      <Td className="capitalize text-secondary">{m.type}</Td>
                      <Td className="whitespace-nowrap">
                        {m.overdue ? (
                          <span className="font-medium text-critical-600">
                            {formatDate(m.scheduledFor)} · overdue
                          </span>
                        ) : (
                          <span className="text-secondary">{formatDate(m.scheduledFor)}</span>
                        )}
                      </Td>
                      <Td>
                        <Badge
                          tone={
                            m.status === 'completed'
                              ? 'safe'
                              : m.status === 'in_progress'
                                ? 'info'
                                : m.overdue
                                  ? 'critical'
                                  : 'warning'
                          }
                        >
                          {m.status === 'in_progress'
                            ? 'In progress'
                            : m.status.charAt(0).toUpperCase() + m.status.slice(1)}
                        </Badge>
                      </Td>
                      <Td className="tabular-nums text-secondary">
                        {m.downtimeHours !== null ? `${m.downtimeHours} h` : '—'}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </TableShell>
            )}
          </Panel>

          <section className="grid gap-4 lg:grid-cols-2">
            <Panel title="Environmental Readings" description="Latest boundary-station values with trend">
              {data.envParameters.length === 0 ? (
                <EmptyState icon={Wind} title="No readings" compact />
              ) : (
                <ul className="space-y-4">
                  {data.envParameters.map((p) => {
                    const max = Math.max(...p.history.map((h) => h.value), p.threshold ?? 0, 1);
                    return (
                      <li key={p.parameter}>
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium text-primary">{p.parameter}</span>
                          <span className="tabular-nums">
                            <span className={p.isBreach ? 'text-critical-600' : 'text-primary'}>
                              {p.latest} {p.unit}
                            </span>
                            {p.threshold !== null ? (
                              <span className="text-secondary"> / {p.threshold}</span>
                            ) : null}
                          </span>
                        </div>
                        <div className="mt-1.5 flex h-8 items-end gap-0.5">
                          {p.history.map((h, i) => (
                            <div
                              key={i}
                              className={`flex-1 rounded-sm ${
                                p.threshold !== null && h.value > p.threshold
                                  ? 'bg-critical-600'
                                  : 'bg-graphite-400'
                              }`}
                              style={{ height: `${Math.max(6, (h.value / max) * 100)}%` }}
                              title={`${h.value} ${p.unit} · ${formatDateTime(h.recordedAt)}`}
                            />
                          ))}
                        </div>
                        <p className="mt-1 text-xs text-secondary">
                          Last recorded {formatDateTime(p.recordedAt)}
                          {p.isBreach ? ' · above threshold' : ''}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>

            <Panel title="Production Reporting" description="Coal production, OB removal and dispatch">
              <EmptyState
                icon={Package}
                title="Ready for data integration"
                message="Production, overburden-removal and dispatch figures will appear here once the mine's production system feeds MineX. The monthly production return is tracked on the Compliance page."
                compact
              />
            </Panel>
          </section>
        </>
      )}
    </div>
  );
}
