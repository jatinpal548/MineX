'use client';

/**
 * Code-split boundary for the dashboard charts.
 *
 * Recharts (+ its d3 deps) is ~90 kB and its mount does real main-thread work
 * (ResponsiveContainer ResizeObserver + SVG scale maths, ×4 on the dashboard).
 * Importing the chart components statically put all of that in the initial
 * /dashboard route bundle, inflating parse + hydrate time and pushing LCP out.
 *
 * Loading them through next/dynamic moves Recharts into its own chunk that is
 * fetched AFTER the core dashboard is interactive. Each chart shows the same
 * pulse placeholder it already used pre-mount, so there is no visual change —
 * the charts simply appear a beat after the KPIs and cards.
 */
import dynamic from 'next/dynamic';
import { ChartPlaceholder } from './chart-kit';

const TREND_HEIGHT = 240;
const BAR_HEIGHT = 220;

export const InspectionTrendChart = dynamic(
  () => import('./inspection-trend-chart').then((m) => m.InspectionTrendChart),
  { ssr: false, loading: () => <ChartPlaceholder height={TREND_HEIGHT} /> },
);

export const RiskDistributionChart = dynamic(
  () => import('./breakdown-charts').then((m) => m.RiskDistributionChart),
  { ssr: false, loading: () => <ChartPlaceholder height={BAR_HEIGHT} /> },
);

export const ObservationStatusChart = dynamic(
  () => import('./breakdown-charts').then((m) => m.ObservationStatusChart),
  { ssr: false, loading: () => <ChartPlaceholder height={BAR_HEIGHT} /> },
);

export const CorrectiveActionStatusChart = dynamic(
  () => import('./breakdown-charts').then((m) => m.CorrectiveActionStatusChart),
  { ssr: false, loading: () => <ChartPlaceholder height={BAR_HEIGHT} /> },
);
