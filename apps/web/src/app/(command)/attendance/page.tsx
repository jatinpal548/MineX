import type { Metadata } from 'next';
import { CalendarDays, UserCheck, UserX, Users } from 'lucide-react';
import { loadScopedCommandPage } from '@/lib/data/context';
import { getAttendanceData, ATTENDANCE_STATUS_META } from '@/lib/data/attendance';
import { PageHeader } from '@/components/ui/page-header';
import { KpiCard } from '@/components/ui/kpi-card';
import { Panel } from '@/components/ui/panel';
import { ParamSelect } from '@/components/ui/param-select';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { TableShell, Th, Td, Tr } from '@/components/ui/data-table';
import { formatDate } from '@/lib/format';

export const metadata: Metadata = { title: 'Attendance' };
export const dynamic = 'force-dynamic';

const str = (v: string | string[] | undefined) => (typeof v === 'string' && v ? v : undefined);

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;

  const loaded = await loadScopedCommandPage(str(sp.mine), (mineId) =>
    getAttendanceData({ mineId, date: str(sp.date) }),
  );
  if (!loaded) return null;
  const { context, data } = loaded;
  const { day, entries, trend } = data;
  const maxTrend = Math.max(1, ...trend.map((t) => t.total));

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="People"
        title="Worker Attendance"
        description="Daily attendance for the departmental workforce. Recorded through MineX, not biometric hardware."
        actions={
          <div className="flex items-center gap-2">
            {data.dates.length > 0 ? (
              <ParamSelect
                paramKey="date"
                allLabel="Latest day"
                options={data.dates.map((d) => ({ value: d, label: formatDate(d) }))}
              />
            ) : null}
            {context.mines.length > 1 ? (
              <ParamSelect
                paramKey="mine"
                allLabel={context.canSeeAllMines ? 'All mines' : 'All mines in scope'}
                options={context.mines.map((m) => ({ value: m.id, label: `${m.name} (${m.code})` }))}
              />
            ) : null}
          </div>
        }
      />

      {!day ? (
        <EmptyState
          icon={CalendarDays}
          title="No attendance recorded"
          message="Attendance entries for this scope will appear here once recorded."
        />
      ) : (
        <>
          <p className="text-xs text-secondary">
            Showing <span className="text-primary">{formatDate(day.date)}</span> · {data.mineWorkerTotal}{' '}
            active workers on roll
          </p>

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Attendance Rate"
              value={`${day.attendancePct}%`}
              icon={UserCheck}
              tone={day.attendancePct >= 90 ? 'safe' : day.attendancePct >= 75 ? 'warning' : 'critical'}
              hint="Present + half-day weighted"
            />
            <KpiCard label="Present" value={day.present} icon={Users} tone="safe" />
            <KpiCard
              label="Half Day / Leave"
              value={day.halfDay + day.leave}
              icon={CalendarDays}
              tone={day.halfDay + day.leave > 0 ? 'warning' : 'neutral'}
              hint={`${day.halfDay} half-day · ${day.leave} leave`}
            />
            <KpiCard
              label="Absent"
              value={day.absent}
              icon={UserX}
              tone={day.absent > 0 ? 'critical' : 'safe'}
            />
          </section>

          <div className="grid gap-4 lg:grid-cols-3">
            <Panel title="Attendance Trend" description="Recent recorded days" className="lg:col-span-1">
              <ul className="space-y-2.5">
                {trend.map((t) => (
                  <li key={t.date}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-secondary">{formatDate(t.date)}</span>
                      <span className="tabular-nums text-primary">{t.attendancePct}%</span>
                    </div>
                    <div className="mt-1 flex h-2 overflow-hidden rounded-full bg-surface-muted">
                      <div className="h-full bg-safe-600" style={{ width: `${(t.present / maxTrend) * 100}%` }} />
                      <div className="h-full bg-warning-600" style={{ width: `${(t.halfDay / maxTrend) * 100}%` }} />
                      <div className="h-full bg-info-600" style={{ width: `${(t.leave / maxTrend) * 100}%` }} />
                      <div className="h-full bg-critical-600" style={{ width: `${(t.absent / maxTrend) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel title={`Roster — ${formatDate(day.date)}`} className="lg:col-span-2" bodyClassName="p-0">
              {entries.length === 0 ? (
                <div className="p-5">
                  <EmptyState title="No entries for this day" compact />
                </div>
              ) : (
                <TableShell>
                  <thead>
                    <tr>
                      <Th>Worker</Th>
                      <Th>Shift</Th>
                      <Th>Hours</Th>
                      <Th>Status</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e) => (
                      <Tr key={e.id}>
                        <Td>
                          <span className="font-medium text-primary">{e.workerName}</span>
                          <span className="mt-0.5 block text-xs text-secondary">
                            {e.workerCode ?? ''}
                            {e.designation ? ` · ${e.designation}` : ''}
                          </span>
                        </Td>
                        <Td className="text-secondary">{e.shift ?? '—'}</Td>
                        <Td className="tabular-nums text-secondary">
                          {e.hoursWorked !== null ? e.hoursWorked : '—'}
                        </Td>
                        <Td>
                          <Badge tone={ATTENDANCE_STATUS_META[e.status].tone}>
                            {ATTENDANCE_STATUS_META[e.status].label}
                          </Badge>
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </TableShell>
              )}
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
