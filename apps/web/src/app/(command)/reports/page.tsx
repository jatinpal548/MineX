import type { Metadata } from 'next';
import {
  ClipboardCheck,
  Download,
  ShieldCheck,
  TriangleAlert,
  Wrench,
} from 'lucide-react';
import { getCommandContext } from '@/lib/data/context';
import { getReportSummary, REPORT_TYPES } from '@/lib/data/reports';
import { PageHeader } from '@/components/ui/page-header';
import { Panel, DefinitionRow } from '@/components/ui/panel';
import { ParamSelect } from '@/components/ui/param-select';
import { formatDateTime } from '@/lib/format';

export const metadata: Metadata = { title: 'Reports' };
export const dynamic = 'force-dynamic';

const str = (v: string | string[] | undefined) => (typeof v === 'string' && v ? v : undefined);

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const context = await getCommandContext();
  if (!context) return null;

  const mineParam = str(sp.mine);
  const activeMine =
    mineParam && context.mines.some((m) => m.id === mineParam) ? mineParam : undefined;
  const scopeLabel = activeMine
    ? context.mines.find((m) => m.id === activeMine)?.name ?? context.scopeLabel
    : context.scopeLabel;

  const summary = await getReportSummary({ mineId: activeMine, scopeLabel });
  const mineQs = activeMine ? `&mine=${activeMine}` : '';

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Governance"
        title="Reports"
        description="Live management summaries for inspections, risk, corrective actions and compliance. Export any section as CSV for offline review."
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

      <p className="text-xs text-secondary">
        Scope: <span className="text-primary">{summary.scopeLabel}</span> · Generated{' '}
        {formatDateTime(summary.generatedAt)}
      </p>

      <section className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Inspection Summary"
          actions={
            <ClipboardCheck className="h-4 w-4 text-secondary" strokeWidth={1.75} />
          }
        >
          <dl>
            <DefinitionRow label="Total inspections">{summary.inspections.total}</DefinitionRow>
            <DefinitionRow label="Submitted / under review">
              {summary.inspections.submitted}
            </DefinitionRow>
            <DefinitionRow label="In progress">{summary.inspections.inProgress}</DefinitionRow>
            <DefinitionRow label="Closed">{summary.inspections.closed}</DefinitionRow>
            <DefinitionRow label="Most recent">
              {formatDateTime(summary.inspections.latest)}
            </DefinitionRow>
          </dl>
        </Panel>

        <Panel
          title="Risk & Observation Summary"
          actions={<TriangleAlert className="h-4 w-4 text-secondary" strokeWidth={1.75} />}
        >
          <dl>
            <DefinitionRow label="Total observations">{summary.risk.total}</DefinitionRow>
            <DefinitionRow label="Critical">
              <span className="font-medium text-critical-600">{summary.risk.critical}</span>
            </DefinitionRow>
            <DefinitionRow label="High">
              <span className="font-medium text-high-risk-600">{summary.risk.high}</span>
            </DefinitionRow>
            <DefinitionRow label="Medium / Low">
              {summary.risk.medium} / {summary.risk.low}
            </DefinitionRow>
            <DefinitionRow label="Still open">{summary.risk.open}</DefinitionRow>
          </dl>
        </Panel>

        <Panel
          title="Corrective Action Summary"
          actions={<Wrench className="h-4 w-4 text-secondary" strokeWidth={1.75} />}
        >
          <dl>
            <DefinitionRow label="Total corrective actions">
              {summary.correctiveActions.total}
            </DefinitionRow>
            <DefinitionRow label="Pending work / verification">
              {summary.correctiveActions.pending}
            </DefinitionRow>
            <DefinitionRow label="Verified / closed">
              {summary.correctiveActions.verified}
            </DefinitionRow>
            <DefinitionRow label="Overdue">
              <span className="font-medium text-critical-600">
                {summary.correctiveActions.overdue}
              </span>
            </DefinitionRow>
          </dl>
        </Panel>

        <Panel
          title="Compliance Summary"
          actions={<ShieldCheck className="h-4 w-4 text-secondary" strokeWidth={1.75} />}
        >
          <dl>
            <DefinitionRow label="Total requirements">{summary.compliance.total}</DefinitionRow>
            <DefinitionRow label="Compliant">
              <span className="font-medium text-safe-600">{summary.compliance.compliant}</span>
            </DefinitionRow>
            <DefinitionRow label="Due soon (30 days)">{summary.compliance.dueSoon}</DefinitionRow>
            <DefinitionRow label="Overdue / at risk">
              <span className="font-medium text-critical-600">
                {summary.compliance.overdueOrAtRisk}
              </span>
            </DefinitionRow>
          </dl>
        </Panel>
      </section>

      <Panel
        title="Printable compliance report"
        description="A formatted single-page summary for management or regulator review."
      >
        <a
          href={`/reports/print${mineQs.replace('&', '?')}`}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-primary transition-colors hover:bg-surface-muted"
        >
          Open printable report
        </a>
      </Panel>

      <Panel
        title="Export"
        description="CSV exports are scoped to your access and the mine filter above."
      >
        <ul className="divide-y divide-border">
          {REPORT_TYPES.map((t) => (
            <li key={t.value} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
              <span className="text-sm text-primary">{t.label}</span>
              <a
                href={`/reports/export?type=${t.value}${mineQs}`}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-primary transition-colors hover:bg-surface-muted"
              >
                <Download className="h-3.5 w-3.5" strokeWidth={2} />
                CSV
              </a>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
