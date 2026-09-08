/**
 * Mine Risk Map data: geo-tagged observations for a mine, RLS-scoped.
 *
 * Uses only real `observations.gps_latitude/longitude`. Observations without
 * coordinates are returned separately so the page can still list them under the
 * map (and so the "Map unavailable" fallback has something useful to show).
 */
import type { ObservationStatus, RiskLevel } from '@coalguard/types';
import { createClient } from '@/lib/supabase/server';
import { compareRiskDesc } from '@/lib/status';

export interface RiskMapPoint {
  id: string;
  title: string;
  risk: RiskLevel;
  category: string | null;
  status: ObservationStatus;
  createdAt: string;
  mineName: string | null;
  lat: number;
  lng: number;
}

export interface RiskMapData {
  center: { lat: number; lng: number } | null;
  mineName: string | null;
  points: RiskMapPoint[];
  /** geo-tagged = false: shown as a list only */
  ungeotagged: Omit<RiskMapPoint, 'lat' | 'lng'>[];
}

const ACTIVE: ObservationStatus[] = ['open', 'action_required', 'in_progress'];

export async function getRiskMapData(opts?: {
  mineId?: string;
  includeResolved?: boolean;
}): Promise<RiskMapData> {
  const supabase = await createClient();

  let obsQ = supabase
    .from('observations')
    .select(
      `id, title, risk, category, status, created_at, gps_latitude, gps_longitude,
       mine:mines!observations_mine_id_fkey(name)`,
    )
    .order('created_at', { ascending: false })
    .limit(300);
  if (opts?.mineId) obsQ = obsQ.eq('mine_id', opts.mineId);
  if (!opts?.includeResolved) obsQ = obsQ.in('status', ACTIVE);

  let mineCenter: { lat: number; lng: number } | null = null;
  let mineName: string | null = null;
  const mineQ = opts?.mineId
    ? supabase.from('mines').select('name, latitude, longitude').eq('id', opts.mineId).maybeSingle()
    : Promise.resolve({ data: null });

  const [{ data: obs }, mineRes] = await Promise.all([obsQ, mineQ]);
  const mineRow = (mineRes as { data: { name?: string; latitude?: number; longitude?: number } | null })
    .data;
  if (mineRow && typeof mineRow.latitude === 'number' && typeof mineRow.longitude === 'number') {
    mineCenter = { lat: mineRow.latitude, lng: mineRow.longitude };
    mineName = mineRow.name ?? null;
  }

  const rows = (obs ?? []) as Record<string, unknown>[];
  const points: RiskMapPoint[] = [];
  const ungeotagged: RiskMapData['ungeotagged'] = [];

  for (const r of rows) {
    const mine = (Array.isArray(r.mine) ? r.mine[0] : r.mine) as { name?: string } | null;
    const base = {
      id: r.id as string,
      title: r.title as string,
      risk: r.risk as RiskLevel,
      category: (r.category as string) ?? null,
      status: r.status as ObservationStatus,
      createdAt: r.created_at as string,
      mineName: mine?.name ?? null,
    };
    const lat = r.gps_latitude as number | null;
    const lng = r.gps_longitude as number | null;
    if (typeof lat === 'number' && typeof lng === 'number') {
      points.push({ ...base, lat, lng });
    } else {
      ungeotagged.push(base);
    }
  }

  points.sort((a, b) => compareRiskDesc(a.risk, b.risk));

  // Fall back to the centroid of the points if the mine has no stored coords.
  if (!mineCenter && points.length > 0) {
    mineCenter = {
      lat: points.reduce((s, p) => s + p.lat, 0) / points.length,
      lng: points.reduce((s, p) => s + p.lng, 0) / points.length,
    };
  }
  if (!mineName && points.length > 0) mineName = points[0]?.mineName ?? null;

  return { center: mineCenter, mineName, points, ungeotagged };
}
