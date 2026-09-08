'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import type { CircleMarker as LeafletCircleMarker } from 'leaflet';
import { Map as MapIcon, MapPinOff } from 'lucide-react';
import type { RiskMapPoint } from '@/lib/data/risk-map';
import type { MineRiskMapProps } from './mine-risk-map';
import 'leaflet/dist/leaflet.css';

const RISK_COLOR: Record<RiskMapPoint['risk'], string> = {
  critical: '#dc2626', // red
  high: '#ea580c', // orange
  medium: '#d97706', // amber
  low: '#16a34a', // green
};

type Props = MineRiskMapProps;

/** Pans to / opens the focused marker once the map is ready. */
function FocusController({
  points,
  focusId,
  markerRefs,
}: {
  points: RiskMapPoint[];
  focusId?: string;
  markerRefs: React.MutableRefObject<Record<string, LeafletCircleMarker | null>>;
}) {
  const map = useMap();
  useEffect(() => {
    if (!focusId) return;
    const p = points.find((x) => x.id === focusId);
    if (!p) return;
    map.flyTo([p.lat, p.lng], Math.max(map.getZoom(), 16), { duration: 0.6 });
    const t = setTimeout(() => markerRefs.current[focusId]?.openPopup(), 700);
    return () => clearTimeout(t);
  }, [focusId, points, map, markerRefs]);
  return null;
}

export default function MineRiskMapLeaflet({
  center,
  points,
  height = 420,
  zoom = 14,
  compact = false,
  focusId,
}: Props) {
  const [mounted, setMounted] = useState(false);
  // a fresh instance key per mount so Leaflet never re-inits an existing container
  const instanceKey = useRef(`map-${Math.random().toString(36).slice(2)}`).current;
  const [tileFailures, setTileFailures] = useState(0);
  const markerRefs = useRef<Record<string, LeafletCircleMarker | null>>({});

  // react-leaflet touches `window`; only render the map after hydration.
  useEffect(() => setMounted(true), []);

  const failed = tileFailures >= 6;

  const bounds = useMemo(() => {
    if (points.length === 0) return null;
    const lats = points.map((p) => p.lat);
    const lngs = points.map((p) => p.lng);
    return [
      [Math.min(...lats), Math.min(...lngs)],
      [Math.max(...lats), Math.max(...lngs)],
    ] as [[number, number], [number, number]];
  }, [points]);

  if (failed) {
    return (
      <div className="rounded-lg border border-border bg-surface">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm text-secondary">
          <MapPinOff className="h-4 w-4" strokeWidth={2} />
          Map unavailable — external tiles could not be loaded. Geo-tagged findings:
        </div>
        <GeoList points={points} />
      </div>
    );
  }

  return (
    <div
      className="relative h-full overflow-hidden rounded-lg border border-border bg-graphite-900"
      style={{ height, minHeight: height }}
    >
      {mounted ? (
        <MapContainer
          key={instanceKey}
          center={[center.lat, center.lng]}
          zoom={zoom}
          scrollWheelZoom
          zoomControl
          dragging
          doubleClickZoom
          bounds={bounds ?? undefined}
          boundsOptions={{ padding: [40, 40], maxZoom: 16 }}
          style={{ height: '100%', width: '100%', background: '#111827' }}
        >
          <TileLayer
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            maxZoom={19}
            eventHandlers={{ tileerror: () => setTileFailures((n) => n + 1) }}
            // tint the light OSM tiles toward the command-centre dark theme
            className="cg-dark-tiles"
          />

          {points.map((p) => (
            <CircleMarker
              key={p.id}
              center={[p.lat, p.lng]}
              radius={compact ? 7 : 9}
              pathOptions={{
                color: '#ffffff',
                weight: 2,
                fillColor: RISK_COLOR[p.risk],
                fillOpacity: 1,
              }}
              ref={(m) => {
                markerRefs.current[p.id] = m;
              }}
            >
              <Popup>
                <div className="min-w-[200px] space-y-1">
                  <p
                    className="text-[11px] font-semibold uppercase tracking-wide"
                    style={{ color: RISK_COLOR[p.risk] }}
                  >
                    {p.risk} risk
                  </p>
                  <p className="text-sm font-medium text-graphite-900">{p.title}</p>
                  <dl className="space-y-0.5 text-xs text-graphite-600">
                    <div className="flex justify-between gap-2">
                      <dt>Category</dt>
                      <dd className="text-graphite-900">{p.category ?? '—'}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt>Mine</dt>
                      <dd className="text-graphite-900">{p.mineName ?? '—'}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt>Raised</dt>
                      <dd className="text-graphite-900">
                        {new Date(p.createdAt).toLocaleString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </dd>
                    </div>
                  </dl>
                  <Link
                    href={`/observations/${p.id}`}
                    className="mt-1 inline-block text-xs font-medium text-accent-600 hover:underline"
                  >
                    View Observation
                  </Link>
                </div>
              </Popup>
            </CircleMarker>
          ))}

          <FocusController points={points} focusId={focusId} markerRefs={markerRefs} />
        </MapContainer>
      ) : (
        <div className="flex h-full items-center justify-center text-sm text-paper-300">
          Loading map…
        </div>
      )}

      {/* legend */}
      <div className="pointer-events-none absolute bottom-2 left-2 z-[500] flex flex-wrap gap-x-3 gap-y-1 rounded-md bg-graphite-950/80 px-2.5 py-1.5 text-[11px] text-paper-100 backdrop-blur">
        {(['critical', 'high', 'medium', 'low'] as const).map((r) => (
          <span key={r} className="inline-flex items-center gap-1">
            <span
              className="h-2.5 w-2.5 rounded-full border border-white/60"
              style={{ backgroundColor: RISK_COLOR[r] }}
            />
            {r.charAt(0).toUpperCase() + r.slice(1)}
          </span>
        ))}
      </div>

      {compact ? (
        <Link
          href="/risk-map"
          className="absolute right-2 top-2 z-[500] inline-flex items-center gap-1 rounded-md bg-graphite-950/80 px-2 py-1 text-[11px] font-medium text-paper-100 backdrop-blur hover:bg-graphite-900"
        >
          <MapIcon className="h-3 w-3" strokeWidth={2} />
          Open full Risk Map
        </Link>
      ) : null}
    </div>
  );
}

function GeoList({ points }: { points: RiskMapPoint[] }) {
  if (points.length === 0) {
    return <p className="px-4 py-6 text-sm text-secondary">No geo-tagged findings in scope.</p>;
  }
  return (
    <ul className="divide-y divide-border">
      {points.map((p) => (
        <li key={p.id} className="flex items-start justify-between gap-3 px-4 py-2.5">
          <div className="min-w-0">
            <Link
              href={`/observations/${p.id}`}
              className="block truncate text-sm font-medium text-primary hover:text-accent-600 hover:underline"
            >
              {p.title}
            </Link>
            <span className="text-xs text-secondary">
              {p.category ?? 'Observation'} · {p.lat.toFixed(4)}, {p.lng.toFixed(4)}
            </span>
          </div>
          <span
            className="mt-0.5 shrink-0 rounded-sm px-1.5 py-0.5 text-[11px] font-medium text-white"
            style={{ backgroundColor: RISK_COLOR[p.risk] }}
          >
            {p.risk}
          </span>
        </li>
      ))}
    </ul>
  );
}
