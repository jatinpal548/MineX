'use client';

import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { cn } from '@/lib/cn';
import { CHART, ChartEmpty, ChartPlaceholder, chartTooltipStyle, useMounted } from './chart-kit';

type Range = 7 | 30 | 90;
const RANGES: Range[] = [7, 30, 90];
const HEIGHT = 240;

/** Local-calendar-day key ("YYYY-MM-DD"). Buckets AND inspection timestamps are
 *  keyed identically in the viewer's timezone, so "today" always has a bucket
 *  and an inspection lands in the day it actually occurred. Previously the
 *  buckets were built from a local midnight but keyed via toISOString() (UTC),
 *  so in any timezone ahead of UTC (e.g. IST) the last bucket was *yesterday*
 *  and today's inspections were silently dropped -> "0 in the last 30 days". */
function dayKey(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

function bucket(dates: string[], days: Range) {
  const counts = new Map<string, number>();
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0); // local midnight today
  cursor.setDate(cursor.getDate() - (days - 1)); // local midnight, (days-1) days ago
  for (let i = 0; i < days; i += 1) {
    counts.set(dayKey(cursor.getTime()), 0);
    cursor.setDate(cursor.getDate() + 1); // DST-safe day increment
  }

  for (const d of dates) {
    const t = new Date(d).getTime();
    if (Number.isNaN(t)) continue;
    const key = dayKey(t);
    if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const step = days <= 7 ? 1 : days <= 30 ? 5 : 15;
  return [...counts.entries()].map(([date, count], i) => ({
    date,
    label:
      i % step === 0
        ? new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
          })
        : '',
    count,
  }));
}

export function InspectionTrendChart({ data }: { data: { date: string }[] }) {
  const mounted = useMounted();
  const [range, setRange] = useState<Range>(30);
  const series = useMemo(() => bucket(data.map((d) => d.date), range), [data, range]);
  const totalInRange = series.reduce((s, p) => s + p.count, 0);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-secondary">
          <span className="font-semibold text-primary tabular-nums">{totalInRange}</span> in the last{' '}
          {range} days
        </p>
        <div className="flex rounded-md border border-border p-0.5">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={cn(
                'rounded px-2 py-1 text-xs font-medium transition-colors',
                r === range ? 'bg-graphite-800 text-white' : 'text-secondary hover:text-primary',
              )}
            >
              {r}d
            </button>
          ))}
        </div>
      </div>

      {!mounted ? (
        <ChartPlaceholder height={HEIGHT} />
      ) : totalInRange === 0 ? (
        <ChartEmpty height={HEIGHT} label="No inspections in this period." />
      ) : (
        <ResponsiveContainer width="100%" height={HEIGHT}>
          <AreaChart data={series} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
            <defs>
              <linearGradient id="cg-trend" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHART.area} stopOpacity={0.25} />
                <stop offset="100%" stopColor={CHART.area} stopOpacity={0} />
              </linearGradient>
            </defs>
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
            <Tooltip
              {...chartTooltipStyle()}
              labelFormatter={(_, p) => {
                const d = p?.[0]?.payload?.date as string | undefined;
                return d
                  ? new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })
                  : '';
              }}
              formatter={(v: number) => [v, 'Inspections']}
            />
            <Area
              type="monotone"
              dataKey="count"
              stroke={CHART.area}
              strokeWidth={2}
              fill="url(#cg-trend)"
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
