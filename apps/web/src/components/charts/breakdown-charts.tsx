'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  CorrectiveActionStatus,
  ObservationStatus,
  RiskLevel,
} from '@coalguard/types';
import { CA_STATUS_META, OBSERVATION_STATUS_META } from '@/lib/status';
import { CHART, ChartEmpty, ChartPlaceholder, RISK_FILL, chartTooltipStyle, useMounted } from './chart-kit';

const HEIGHT = 220;

function BaseBars({
  data,
  emptyLabel,
  colorFor,
}: {
  data: { label: string; count: number; key: string }[];
  emptyLabel: string;
  colorFor: (key: string) => string;
}) {
  const mounted = useMounted();
  const total = data.reduce((s, d) => s + d.count, 0);

  if (!mounted) return <ChartPlaceholder height={HEIGHT} />;
  if (total === 0) return <ChartEmpty height={HEIGHT} label={emptyLabel} />;

  return (
    <ResponsiveContainer width="100%" height={HEIGHT}>
      <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
        <CartesianGrid stroke={CHART.grid} vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: CHART.axisText }}
          axisLine={{ stroke: CHART.grid }}
          tickLine={false}
          interval={0}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fontSize: 11, fill: CHART.axisText }}
          axisLine={false}
          tickLine={false}
          width={32}
        />
        <Tooltip {...chartTooltipStyle()} formatter={(v: number) => [v, 'Count']} />
        <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={56}>
          {data.map((d) => (
            <Cell key={d.key} fill={colorFor(d.key)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function RiskDistributionChart({
  data,
}: {
  data: { risk: RiskLevel; label: string; count: number }[];
}) {
  return (
    <BaseBars
      data={data.map((d) => ({ key: d.risk, label: d.label, count: d.count }))}
      emptyLabel="No observations recorded yet."
      colorFor={(key) => RISK_FILL[key as RiskLevel] ?? CHART.bar}
    />
  );
}

export function ObservationStatusChart({
  data,
}: {
  data: { status: ObservationStatus; count: number }[];
}) {
  const rows = data.map((d) => ({
    key: d.status,
    label: OBSERVATION_STATUS_META[d.status]?.label ?? d.status,
    count: d.count,
  }));
  return (
    <BaseBars data={rows} emptyLabel="No observations recorded yet." colorFor={() => CHART.bar} />
  );
}

export function CorrectiveActionStatusChart({
  data,
}: {
  data: { status: CorrectiveActionStatus; count: number }[];
}) {
  const rows = data.map((d) => ({
    key: d.status,
    label: CA_STATUS_META[d.status]?.label ?? d.status,
    count: d.count,
  }));
  return (
    <BaseBars
      data={rows}
      emptyLabel="No corrective actions raised yet."
      colorFor={() => CHART.bar}
    />
  );
}
