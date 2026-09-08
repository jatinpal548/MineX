/**
 * Mine Operations: equipment health + latest environmental readings.
 *
 * Reads the existing `equipment` and `environmental_readings` tables through the
 * RLS-scoped SSR client. Reference/seed data only - no operational data is
 * fabricated here. If a mine has no rows the page shows an empty state.
 */
import type { EquipmentStatus } from '@coalguard/types';
import { createClient } from '@/lib/supabase/server';
import type { Tone } from '@/lib/status';

export const EQUIPMENT_STATUS_META: Record<EquipmentStatus, { label: string; tone: Tone }> = {
  operational: { label: 'Operational', tone: 'safe' },
  maintenance: { label: 'In maintenance', tone: 'warning' },
  breakdown: { label: 'Breakdown', tone: 'critical' },
  decommissioned: { label: 'Decommissioned', tone: 'neutral' },
};

export interface EquipmentRow {
  id: string;
  assetCode: string;
  name: string;
  category: string | null;
  status: EquipmentStatus;
  lastServiceOn: string | null;
  nextServiceDue: string | null;
  mineName: string | null;
}

export interface EnvReadingRow {
  id: string;
  parameter: string;
  value: number;
  unit: string;
  threshold: number | null;
  isBreach: boolean;
  stationName: string | null;
  recordedAt: string;
  mineName: string | null;
}

export interface MaintenanceRow {
  id: string;
  equipmentName: string | null;
  assetCode: string | null;
  type: string;
  description: string | null;
  status: string;
  scheduledFor: string | null;
  performedAt: string | null;
  downtimeHours: number | null;
  overdue: boolean;
}

export interface EnvParameterSummary {
  parameter: string;
  unit: string;
  latest: number;
  threshold: number | null;
  isBreach: boolean;
  recordedAt: string;
  history: { value: number; recordedAt: string }[];
}

export interface OperationsData {
  equipment: EquipmentRow[];
  equipmentByStatus: { status: EquipmentStatus; label: string; count: number }[];
  readings: EnvReadingRow[];
  envParameters: EnvParameterSummary[];
  maintenance: MaintenanceRow[];
  maintenanceDue: number;
  maintenanceOverdue: number;
  breaches: number;
  hasData: boolean;
}

function rel<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

export async function getOperationsData(opts?: { mineId?: string }): Promise<OperationsData> {
  const supabase = await createClient();
  const mineId = opts?.mineId;

  const eqQ = supabase
    .from('equipment')
    .select(
      `id, asset_code, name, category, status, last_service_on, next_service_due,
       mine:mines!equipment_mine_id_fkey(name)`,
    )
    .order('name', { ascending: true })
    .limit(500);
  const envQ = supabase
    .from('environmental_readings')
    .select(
      `id, parameter, value, unit, threshold, is_breach, station_name, recorded_at,
       mine:mines!environmental_readings_mine_id_fkey(name)`,
    )
    .order('recorded_at', { ascending: false })
    .limit(200);

  const mtQ = supabase
    .from('maintenance_records')
    .select(
      `id, maintenance_type, description, status, scheduled_for, performed_at, downtime_hours,
       equipment:equipment!maintenance_records_equipment_id_fkey(name, asset_code)`,
    )
    .order('scheduled_for', { ascending: true })
    .limit(200);

  const [eq, env, mt] = await Promise.all([
    mineId ? eqQ.eq('mine_id', mineId) : eqQ,
    mineId ? envQ.eq('mine_id', mineId) : envQ,
    mineId ? mtQ.eq('mine_id', mineId) : mtQ,
  ]);

  const equipment: EquipmentRow[] = ((eq.data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    assetCode: r.asset_code as string,
    name: r.name as string,
    category: (r.category as string) ?? null,
    status: r.status as EquipmentStatus,
    lastServiceOn: (r.last_service_on as string) ?? null,
    nextServiceDue: (r.next_service_due as string) ?? null,
    mineName: (rel(r.mine as unknown) as { name?: string } | null)?.name ?? null,
  }));

  const statusCounts = new Map<EquipmentStatus, number>();
  for (const e of equipment) statusCounts.set(e.status, (statusCounts.get(e.status) ?? 0) + 1);
  const equipmentByStatus = (Object.keys(EQUIPMENT_STATUS_META) as EquipmentStatus[])
    .map((status) => ({
      status,
      label: EQUIPMENT_STATUS_META[status].label,
      count: statusCounts.get(status) ?? 0,
    }))
    .filter((s) => s.count > 0);

  const readings: EnvReadingRow[] = ((env.data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    parameter: r.parameter as string,
    value: Number(r.value),
    unit: r.unit as string,
    threshold: r.threshold !== null && r.threshold !== undefined ? Number(r.threshold) : null,
    isBreach: Boolean(r.is_breach),
    stationName: (r.station_name as string) ?? null,
    recordedAt: r.recorded_at as string,
    mineName: (rel(r.mine as unknown) as { name?: string } | null)?.name ?? null,
  }));

  // env parameters: latest reading + short history per parameter
  const paramMap = new Map<string, EnvReadingRow[]>();
  for (const r of readings) {
    if (!paramMap.has(r.parameter)) paramMap.set(r.parameter, []);
    paramMap.get(r.parameter)!.push(r);
  }
  const envParameters: EnvParameterSummary[] = [...paramMap.entries()].map(([parameter, list]) => {
    const sorted = [...list].sort(
      (a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime(),
    );
    const latest = sorted[0]!;
    return {
      parameter,
      unit: latest.unit,
      latest: latest.value,
      threshold: latest.threshold,
      isBreach: latest.isBreach,
      recordedAt: latest.recordedAt,
      history: sorted
        .slice(0, 12)
        .reverse()
        .map((x) => ({ value: x.value, recordedAt: x.recordedAt })),
    };
  });

  const now = Date.now();
  const maintenance: MaintenanceRow[] = ((mt.data ?? []) as Record<string, unknown>[]).map((r) => {
    const e = rel(r.equipment as unknown) as { name?: string; asset_code?: string } | null;
    const status = (r.status as string) ?? 'planned';
    const scheduledFor = (r.scheduled_for as string) ?? null;
    return {
      id: r.id as string,
      equipmentName: e?.name ?? null,
      assetCode: e?.asset_code ?? null,
      type: (r.maintenance_type as string) ?? 'preventive',
      description: (r.description as string) ?? null,
      status,
      scheduledFor,
      performedAt: (r.performed_at as string) ?? null,
      downtimeHours:
        r.downtime_hours !== null && r.downtime_hours !== undefined ? Number(r.downtime_hours) : null,
      overdue:
        status !== 'completed' && scheduledFor !== null && new Date(scheduledFor).getTime() < now,
    };
  });
  const openMaint = maintenance.filter((m) => m.status !== 'completed');

  return {
    equipment,
    equipmentByStatus,
    readings,
    envParameters,
    maintenance,
    maintenanceDue: openMaint.length,
    maintenanceOverdue: openMaint.filter((m) => m.overdue).length,
    breaches: readings.filter((r) => r.isBreach).length,
    hasData: equipment.length > 0 || readings.length > 0 || maintenance.length > 0,
  };
}
