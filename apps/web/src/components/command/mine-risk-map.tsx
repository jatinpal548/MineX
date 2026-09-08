'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import type { RiskMapPoint } from '@/lib/data/risk-map';

export interface MineRiskMapProps {
  center: { lat: number; lng: number };
  points: RiskMapPoint[];
  /** container height in px */
  height?: number;
  zoom?: number;
  /** compact = dashboard preview (adds an "Open full map" overlay link) */
  compact?: boolean;
  focusId?: string;
  /**
   * Defer loading the Leaflet bundle until the map scrolls into view. Used on
   * the dashboard, where the map sits ~2 screens down and must not compete with
   * the critical render path. The full /risk-map page leaves this off.
   */
  lazy?: boolean;
}

/**
 * Leaflet touches `window` at module load and pulls in ~140 kB, so the real map
 * is loaded client-only via next/dynamic (ssr:false).
 */
const LeafletMap = dynamic(() => import('./mine-risk-map-leaflet'), {
  ssr: false,
  loading: () => <MapPlaceholder />,
});

function MapPlaceholder() {
  return (
    <div className="flex h-full min-h-[180px] w-full items-center justify-center rounded-lg border border-border bg-graphite-900 text-sm text-paper-300">
      Loading Mine Risk Map…
    </div>
  );
}

export function MineRiskMap(props: MineRiskMapProps) {
  const { lazy = false, height = 420 } = props;
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(!lazy);

  useEffect(() => {
    if (show) return;
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setShow(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShow(true);
          io.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [show]);

  return (
    <div ref={ref} style={{ height }}>
      {show ? <LeafletMap {...props} /> : <MapPlaceholder />}
    </div>
  );
}
