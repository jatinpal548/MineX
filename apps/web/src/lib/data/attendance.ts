/**
 * Worker attendance data. RLS-scoped SSR client.
 * Real tables: `attendance` joined to `workers`. No biometric capture.
 */
import type { AttendanceStatus } from '@coalguard/types';
import { createClient } from '@/lib/supabase/server';
import type { Tone } from '@/lib/status';
import { one } from './shared';

export const ATTENDANCE_STATUS_META: Record<AttendanceStatus, { label: string; tone: Tone }> = {
  present: { label: 'Present', tone: 'safe' },
  half_day: { label: 'Half day', tone: 'warning' },
  leave: { label: 'Leave', tone: 'info' },
  absent: { label: 'Absent', tone: 'critical' },
};

export interface AttendanceEntry {
  id: string;
  workerName: string;
  workerCode: string | null;
  designation: string | null;
  status: AttendanceStatus;
  shift: string | null;
  hoursWorked: number | null;
}

export interface AttendanceDay {
  date: string;
  present: number;
  halfDay: number;
  leave: number;
  absent: number;
  total: number;
  attendancePct: number;
}

export interface AttendanceData {
  dates: string[];
  selectedDate: string | null;
  day: AttendanceDay | null;
  entries: AttendanceEntry[];
  trend: AttendanceDay[];
  mineWorkerTotal: number;
}

function summarise(date: string, rows: { status: AttendanceStatus }[], workerTotal: number): AttendanceDay {
  const present = rows.filter((r) => r.status === 'present').length;
  const halfDay = rows.filter((r) => r.status === 'half_day').length;
  const leave = rows.filter((r) => r.status === 'leave').length;
  const absent = rows.filter((r) => r.status === 'absent').length;
  const total = Math.max(rows.length, workerTotal);
  const effective = present + halfDay * 0.5;
  return {
    date,
    present,
    halfDay,
    leave,
    absent,
    total,
    attendancePct: total > 0 ? Math.round((effective / total) * 100) : 0,
  };
}

export async function getAttendanceData(opts?: {
  mineId?: string;
  date?: string;
}): Promise<AttendanceData> {
  const supabase = await createClient();

  let base = supabase
    .from('attendance')
    .select(
      `id, work_date, status, shift, hours_worked,
       worker:workers!attendance_worker_id_fkey(full_name, employee_code, designation)`,
    )
    .order('work_date', { ascending: false })
    .limit(2000);
  if (opts?.mineId) base = base.eq('mine_id', opts.mineId);

  let wq = supabase.from('workers').select('id', { count: 'exact', head: true }).eq('is_active', true);
  if (opts?.mineId) wq = wq.eq('mine_id', opts.mineId);

  const [{ data, error }, workerRes] = await Promise.all([base, wq]);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Record<string, unknown>[];
  const mineWorkerTotal = workerRes.count ?? 0;

  const byDate = new Map<string, Record<string, unknown>[]>();
  for (const r of rows) {
    const d = r.work_date as string;
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d)!.push(r);
  }
  const dates = [...byDate.keys()].sort((a, b) => b.localeCompare(a));
  const selectedDate =
    opts?.date && byDate.has(opts.date) ? opts.date : (dates[0] ?? null);

  const trend = dates
    .slice(0, 10)
    .map((d) =>
      summarise(
        d,
        (byDate.get(d) ?? []).map((r) => ({ status: r.status as AttendanceStatus })),
        mineWorkerTotal,
      ),
    )
    .reverse();

  let day: AttendanceDay | null = null;
  let entries: AttendanceEntry[] = [];
  if (selectedDate) {
    const dayRows = byDate.get(selectedDate) ?? [];
    day = summarise(
      selectedDate,
      dayRows.map((r) => ({ status: r.status as AttendanceStatus })),
      mineWorkerTotal,
    );
    entries = dayRows
      .map((r) => {
        const w = one(r.worker as unknown) as
          | { full_name?: string; employee_code?: string; designation?: string }
          | null;
        return {
          id: r.id as string,
          workerName: w?.full_name ?? 'Worker',
          workerCode: w?.employee_code ?? null,
          designation: w?.designation ?? null,
          status: r.status as AttendanceStatus,
          shift: (r.shift as string) ?? null,
          hoursWorked: r.hours_worked !== null && r.hours_worked !== undefined ? Number(r.hours_worked) : null,
        };
      })
      .sort((a, b) => a.workerName.localeCompare(b.workerName));
  }

  return { dates, selectedDate, day, entries, trend, mineWorkerTotal };
}
