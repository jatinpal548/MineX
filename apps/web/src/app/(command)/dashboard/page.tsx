import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Activity,
  CalendarClock,
  ClipboardCheck,
  Gauge,
  Map as MapIcon,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Wind,
  Wrench,
} from 'lucide-react';
import { getCommandContext } from '@/lib/data/context';
import { getDashboardData } from '@/lib/data/dashboard';
import { PageHeader } from '@/components/ui/page-header';
import { KpiCard } from '@/components/ui/kpi-card';
import { Panel } from '@/components/ui/panel';
import { ParamSelect } from '@/components/ui/param-select';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
// Recharts is code-split out of the initial route bundle — see lazy-charts.tsx.
import {
  CorrectiveActionStatusChart,
  InspectionTrendChart,
  ObservationStatusChart,
  RiskDistributionChart,
} from '@/components/charts/lazy-charts';
import { PriorityFindings } from '@/components/command/priority-findings';
import { ActivityTimeline } from '@/components/command/activity-timeline';
import { AiRiskInsights } from '@/components/command/ai-risk-insights';
import { AiRiskIntelligence } from '@/components/command/ai-risk-intelligence';
import { MineRiskMap } from '@/components/command/mine-risk-map';

export const metadata: Metadata = { title: 'Command Center' };
export const dynamic = 'force-dynamic';

type Can = (p: string) => boolean;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const context = await getCommandContext();
  if (!context) return null; // layout already redirects
  // gate in-page links the same way the sidebar is gated (RLS is still the
  // real boundary; this just avoids offering a module the role can't use).
  const perms = new Set(context.user.permissions as string[]);
  const can: Can = (p) => perms.has(p);

  const mineParam = typeof sp.mine === 'string' ? sp.mine : undefined;
  const activeMine =
    mineParam && context.mines.some((m) => m.id === mineParam) ? mineParam : undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Command Center"
        title="Governance & compliance overview"
        description={
          activeMine
            ? context.mines.find((m) => m.id === activeMine)?.name ?? context.scopeLabel
            : context.scopeLabel
        }
        actions={
          context.mines.length > 1 ? (
            <ParamSelect
              paramKey="mine"
              allLabel={context.canSeeAllMines ? 'All mines' : 'All mines in scope'}
              options={context.mines.map((m) => ({ value: m.id, label: `${m.name} (${m.code})` }))}
            />
          ) : null
        }
      />

      {/* Above-the-fold: KPIs + escalation stream first, in their own boundary. */}
      <Suspense fallback={<KpiSkeleton />}>
        <KpiSection mineId={activeMine} can={can} />
      </Suspense>

      {/* Everything below streams in a second boundary so it never blocks the
          KPI paint or first interaction. */}
      <Suspense fallback={<SecondarySkeleton />}>
        <SecondarySections mineId={activeMine} can={can} />
      </Suspense>
    </div>
  );
}

/* ------------------------------- KPI section ------------------------------ */

async function KpiSection({ mineId, can }: { mineId?: string; can: Can }) {
  const { kpis, intel } = await getDashboardData({ mineId });
  const esc = intel.escalation;

  const escChips: { label: string; value: number; tone: string }[] = [
    { label: 'Critical', value: esc.critical, tone: 'text-critical-600' },
    { label: 'Overdue', value: esc.overdue, tone: 'text-critical-600' },
    { label: 'Due Soon', value: esc.dueSoon, tone: 'text-warning-600' },
    { label: 'Awaiting Verification', value: esc.awaitingVerification, tone: 'text-info-600' },
  ];
  const complianceRate =
    kpis.compliance.total > 0
      ? Math.round((kpis.compliance.compliant / kpis.compliance.total) * 100)
      : 0;

  return (
    <>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard
          label="Compliance Rate"
          value={kpis.compliance.total === 0 ? '—' : `${complianceRate}%`}
          icon={ShieldCheck}
          tone={complianceRate >= 80 ? 'safe' : complianceRate >= 50 ? 'warning' : 'critical'}
          hint={`${kpis.compliance.compliant}/${kpis.compliance.total} requirements`}
        />
        <KpiCard
          label="Open Critical Risks"
          value={esc.critical}
          icon={ShieldAlert}
          tone={esc.critical > 0 ? 'critical' : 'safe'}
          hint="Unresolved critical observations"
        />
        <KpiCard
          label="Overdue Corrective Actions"
          value={esc.overdue}
          icon={Wrench}
          tone={esc.overdue > 0 ? 'critical' : 'safe'}
          hint={`${kpis.pendingCorrectiveActions} pending in total`}
        />
        <KpiCard
          label="Inspections"
          value={kpis.totalInspections}
          icon={ClipboardCheck}
          hint="All time, in scope"
        />
        <KpiCard
          label="Environmental Breaches"
          value={intel.envBreaches}
          icon={Wind}
          tone={intel.envBreaches > 0 ? 'critical' : 'safe'}
          hint="Readings above threshold"
        />
      </section>

      <section className="cg-card flex flex-wrap items-center gap-x-8 gap-y-3 p-4">
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-primary">
          <Siren className="h-4 w-4 text-critical-600" strokeWidth={2} />
          Escalation
        </span>
        {escChips.map((c) => (
          <span key={c.label} className="flex items-baseline gap-2">
            <span
              className={`text-2xl font-semibold tabular-nums ${c.value > 0 ? c.tone : 'text-secondary'}`}
            >
              {c.value}
            </span>
            <span className="text-xs text-secondary">{c.label}</span>
          </span>
        ))}
        <Link
          href={can('corrective_action:read') ? '/corrective-actions' : '/observations'}
          className="ml-auto text-xs text-accent-600 hover:underline"
        >
          {can('corrective_action:read') ? 'Manage corrective actions' : 'View observations'}
        </Link>
      </section>
    </>
  );
}

/* --------------------------- Secondary sections -------------------------- */

async function SecondarySections({ mineId, can }: { mineId?: string; can: Can }) {
  const data = await getDashboardData({ mineId });
  const { aiInsights, intel, compliance, ops, riskMap } = data;
  const complianceOpen = compliance.atRisk + compliance.nonCompliant + compliance.overdue;
  const operational = ops.operational;

  return (
    <>
      {/* AI intelligence + map */}
      <section className="grid gap-4 lg:grid-cols-5">
        <Panel
          title="AI Risk Intelligence"
          description="Calculated from live observations, compliance and operations data"
          className="lg:col-span-3"
        >
          <AiRiskIntelligence signals={intel.signals} recurring={intel.recurringCategories} />
        </Panel>
        <Panel
          title="Mine Risk Map"
          description="Geo-tagged observations by severity"
          className="lg:col-span-2"
          actions={
            <Link
              href="/risk-map"
              className="inline-flex items-center gap-1 text-xs text-accent-600 hover:underline"
            >
              <MapIcon className="h-3.5 w-3.5" strokeWidth={2} />
              Full map
            </Link>
          }
        >
          {riskMap.center && riskMap.points.length > 0 ? (
            <MineRiskMap center={riskMap.center} points={riskMap.points} height={240} compact lazy />
          ) : (
            <EmptyState icon={MapIcon} title="No geo-tagged findings" compact />
          )}
        </Panel>
      </section>

      {/* compliance snapshot + operational health */}
      <section className="grid gap-4 lg:grid-cols-5">
        <Panel
          title="Compliance Snapshot"
          description="Statutory register for this scope"
          className="lg:col-span-2"
        >
          <div className="grid grid-cols-2 gap-3">
            {[
              { l: 'Requirements', v: compliance.total, c: 'text-primary' },
              { l: 'Compliant', v: compliance.compliant, c: 'text-safe-600' },
              { l: 'Due soon', v: compliance.dueSoon, c: 'text-warning-600' },
              { l: 'Overdue / at risk', v: complianceOpen, c: 'text-critical-600' },
            ].map((x) => (
              <div key={x.l} className="rounded-md border border-border p-3">
                <p className="cg-label">{x.l}</p>
                <p className={`mt-1 text-2xl font-semibold tabular-nums ${x.c}`}>{x.v}</p>
              </div>
            ))}
          </div>
          {can('compliance:read') ? (
            <Link
              href="/compliance"
              className="mt-3 inline-flex items-center gap-1.5 text-sm text-accent-600 hover:underline"
            >
              <CalendarClock className="h-4 w-4" strokeWidth={2} />
              Open compliance register
            </Link>
          ) : null}
        </Panel>

        <Panel
          title="Operational Health"
          description="Equipment and environmental monitoring"
          className="lg:col-span-3"
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { l: 'Equipment', v: ops.equipmentTotal, c: 'text-primary', icon: Gauge },
              { l: 'Operational', v: operational, c: 'text-safe-600', icon: Activity },
              {
                l: 'Down / maint.',
                v: intel.equipmentDown,
                c: intel.equipmentDown > 0 ? 'text-warning-600' : 'text-secondary',
                icon: Wrench,
              },
              {
                l: 'Env. breaches',
                v: ops.breaches,
                c: ops.breaches > 0 ? 'text-critical-600' : 'text-safe-600',
                icon: Wind,
              },
            ].map((x) => (
              <div key={x.l} className="rounded-md border border-border p-3">
                <div className="flex items-center justify-between">
                  <p className="cg-label">{x.l}</p>
                  <x.icon className="h-3.5 w-3.5 text-secondary" strokeWidth={1.75} />
                </div>
                <p className={`mt-1 text-2xl font-semibold tabular-nums ${x.c}`}>{x.v}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-xs">
            {can('equipment:read') ? (
              <Link href="/mine-operations" className="text-accent-600 hover:underline">
                Mine operations
              </Link>
            ) : null}
            {can('attendance:read') ? (
              <Link href="/attendance" className="text-accent-600 hover:underline">
                Attendance
              </Link>
            ) : null}
            {can('grievance:read') ? (
              <Link href="/grievances" className="text-accent-600 hover:underline">
                Grievances
              </Link>
            ) : null}
          </div>
        </Panel>
      </section>

      {/* AI insight cards */}
      <Panel title="AI Risk Insights" description="Per-finding consequence and recommended action">
        <AiRiskInsights insights={aiInsights} />
      </Panel>

      {/* charts */}
      <section className="grid gap-4 lg:grid-cols-2">
        <Panel title="Inspection Trend" description="Inspections created over time">
          <InspectionTrendChart data={data.inspectionTrend} />
        </Panel>
        <Panel title="Risk Distribution" description="Observations by risk band">
          <RiskDistributionChart data={data.riskDistribution} />
        </Panel>
        <Panel title="Observation Status" description="Where observations sit in their lifecycle">
          <ObservationStatusChart data={data.observationStatus} />
        </Panel>
        <Panel title="Corrective Action Status" description="Progress of corrective actions">
          <CorrectiveActionStatusChart data={data.correctiveActionStatus} />
        </Panel>
      </section>

      {/* findings + activity */}
      <section className="grid gap-4 lg:grid-cols-5">
        <Panel
          title="Priority Findings"
          description="Unresolved high-risk observations, most urgent first"
          className="lg:col-span-3"
        >
          <PriorityFindings findings={data.priorityFindings} />
        </Panel>
        <Panel
          title="Recent Field Activity"
          description="Latest events from the field app"
          className="lg:col-span-2"
        >
          <ActivityTimeline items={data.activity} />
        </Panel>
      </section>

      {!data.hasAnyData ? (
        <EmptyState
          title="No field data yet"
          message="Once inspectors submit inspections from MineX Field, the numbers and charts above populate automatically. Use Refresh after a sync."
        />
      ) : null}
    </>
  );
}

/* -------------------------------- skeletons ----------------------------- */

function KpiSkeleton() {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="cg-card p-5">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="mt-4 h-8 w-1/3" />
            <Skeleton className="mt-4 h-3 w-2/3" />
          </div>
        ))}
      </div>
      <div className="cg-card mt-6 flex flex-wrap items-center gap-8 p-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-24" />
        ))}
      </div>
    </>
  );
}

function SecondarySkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="cg-card p-5 lg:col-span-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="mt-4 h-48 w-full" />
        </div>
        <div className="cg-card p-5 lg:col-span-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="mt-4 h-48 w-full" />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="cg-card p-5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="mt-4 h-[220px] w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
