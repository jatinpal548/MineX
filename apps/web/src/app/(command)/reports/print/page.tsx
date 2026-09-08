import type { Metadata } from 'next';
import { getCommandContext } from '@/lib/data/context';
import { getReportSummary } from '@/lib/data/reports';
import { getRiskIntelligence } from '@/lib/data/risk-intelligence';
import { getComplianceRegister } from '@/lib/data/compliance';
import { PrintButton } from '@/components/command/print-button';
import { formatDate, formatDateTime } from '@/lib/format';

export const metadata: Metadata = { title: 'Compliance Report' };
export const dynamic = 'force-dynamic';

const str = (v: string | string[] | undefined) => (typeof v === 'string' && v ? v : undefined);

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border py-1.5 text-sm last:border-b-0">
      <span className="text-secondary">{label}</span>
      <span className="font-medium text-primary">{value}</span>
    </div>
  );
}

export default async function CompliancePrintReport({
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

  const [summary, intel, register] = await Promise.all([
    getReportSummary({ mineId: activeMine, scopeLabel }),
    getRiskIntelligence({ mineId: activeMine }),
    getComplianceRegister({ mineId: activeMine }),
  ]);

  const criticalHigh = register.rows
    .filter((r) => r.priority === 'critical' || r.priority === 'high')
    .slice(0, 10);

  return (
    <div className="mx-auto max-w-3xl space-y-6 bg-surface p-2 print:p-0">
      <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-secondary">
            MineX · Governance &amp; Compliance
          </p>
          <h1 className="mt-1 text-xl font-semibold text-primary">Compliance &amp; Risk Report</h1>
          <p className="mt-1 text-sm text-secondary">
            {scopeLabel} · generated {formatDateTime(summary.generatedAt)}
          </p>
        </div>
        <PrintButton />
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-secondary">
          Compliance summary
        </h2>
        <Row label="Total statutory requirements" value={summary.compliance.total} />
        <Row label="Compliant" value={summary.compliance.compliant} />
        <Row label="Due within 30 days" value={summary.compliance.dueSoon} />
        <Row label="Overdue / at risk" value={summary.compliance.overdueOrAtRisk} />
        <Row
          label="Compliance rate"
          value={
            summary.compliance.total > 0
              ? `${Math.round((summary.compliance.compliant / summary.compliance.total) * 100)}%`
              : '—'
          }
        />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-secondary">
          Risk summary
        </h2>
        <Row label="Total observations" value={summary.risk.total} />
        <Row label="Critical" value={summary.risk.critical} />
        <Row label="High" value={summary.risk.high} />
        <Row label="Medium / Low" value={`${summary.risk.medium} / ${summary.risk.low}`} />
        <Row label="Still open" value={summary.risk.open} />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-secondary">
          Corrective actions
        </h2>
        <Row label="Total" value={summary.correctiveActions.total} />
        <Row label="Pending work / verification" value={summary.correctiveActions.pending} />
        <Row label="Verified / closed" value={summary.correctiveActions.verified} />
        <Row label="Overdue" value={summary.correctiveActions.overdue} />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-secondary">
          Inspections &amp; environment
        </h2>
        <Row label="Total inspections" value={summary.inspections.total} />
        <Row label="Submitted / under review" value={summary.inspections.submitted} />
        <Row label="In progress" value={summary.inspections.inProgress} />
        <Row label="Most recent" value={formatDateTime(summary.inspections.latest)} />
        <Row label="Environmental threshold breaches" value={intel.envBreaches} />
        <Row label="Equipment down / in maintenance" value={intel.equipmentDown} />
      </section>

      {criticalHigh.length > 0 ? (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-secondary">
            Critical &amp; high-priority requirements
          </h2>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-secondary">
                <th className="py-1.5 pr-3">Code</th>
                <th className="py-1.5 pr-3">Requirement</th>
                <th className="py-1.5 pr-3">Priority</th>
                <th className="py-1.5 pr-3">Status</th>
                <th className="py-1.5">Due</th>
              </tr>
            </thead>
            <tbody>
              {criticalHigh.map((r) => (
                <tr key={r.id} className="border-b border-border">
                  <td className="py-1.5 pr-3 text-secondary">{r.code}</td>
                  <td className="py-1.5 pr-3 text-primary">{r.title}</td>
                  <td className="py-1.5 pr-3 capitalize">{r.priority ?? '—'}</td>
                  <td className="py-1.5 pr-3">{r.status}</td>
                  <td className="py-1.5">{r.dueDate ? formatDate(r.dueDate) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-secondary">
          AI-assisted risk insights (simulated)
        </h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-primary">
          {intel.signals.map((s) => (
            <li key={s.key}>{s.text}</li>
          ))}
        </ul>
      </section>

      <p className="border-t border-border pt-4 text-xs text-secondary">
        Generated by MineX from live operational data. Figures reflect the signed-in user&apos;s
        access scope at {formatDateTime(summary.generatedAt)}. AI insights are deterministic analytics,
        not a trained model.
      </p>
    </div>
  );
}
