'use client';

import { useEffect, useState } from 'react';
import { palette, status } from '@coalguard/ui/tokens';
import type { RiskLevel } from '@coalguard/types';

export const CHART = {
  grid: palette.graphite[200],
  axis: palette.graphite[400],
  axisText: palette.graphite[500],
  area: palette.graphite[600],
  areaFill: palette.graphite[300],
  bar: palette.graphite[500],
};

export const RISK_FILL: Record<RiskLevel, string> = {
  low: status.safe.solid,
  medium: status.warning.solid,
  high: status.highRisk.solid,
  critical: status.critical.solid,
};

/** recharts' ResponsiveContainer needs the DOM - render a placeholder until mount. */
export function useMounted(): boolean {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}

export function ChartPlaceholder({ height }: { height: number }) {
  return (
    <div
      className="w-full animate-pulse rounded-md bg-surface-muted"
      style={{ height }}
      aria-hidden
    />
  );
}

export function ChartEmpty({ height, label }: { height: number; label: string }) {
  return (
    <div
      className="flex w-full items-center justify-center rounded-md border border-dashed border-border text-sm text-secondary"
      style={{ height }}
    >
      {label}
    </div>
  );
}

export function chartTooltipStyle() {
  return {
    contentStyle: {
      borderRadius: 8,
      border: `1px solid ${palette.graphite[200]}`,
      fontSize: 12,
      boxShadow: '0 12px 32px rgba(11,14,16,0.16)',
    },
    labelStyle: { color: palette.graphite[900], fontWeight: 600 },
    cursor: { fill: 'rgba(18,22,26,0.04)' },
  };
}
