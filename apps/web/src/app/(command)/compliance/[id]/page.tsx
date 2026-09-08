import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { getComplianceDetail, COMPLIANCE_STATUS_META, PRIORITY_META } from '@/lib/data/compliance';
import { RISK_META } from '@/lib/status';
import { Panel, DefinitionRow } from '@/components/ui/panel';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDate } from '@/lib/format';

export const metadata: Metadata = { title: 'Compliance requirement' };
export const dynamic = 'force-dynamic';

export default async function ComplianceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const rec = await getComplianceDetail(id).catch(() => null);
  if (!rec) notFound();

  const statusMeta = COMPLIANCE_STATUS_META[rec.status];

  return (
    <div className="space-y-6">
      <Link
        href="/compliance"
        className="inline-flex items-center gap-1.5 text-sm text-secondary hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={2} />
        Compliance
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
        <div className="min-w-0">
          <p className="cg-label">
            {rec.code} · {rec.authority}
            {rec.category ? ` · ${rec.category}` : ''}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-primary">{rec.title}</h1>
          <p className="mt-1 text-sm text-secondary">
            {rec.mineName ?? 'Unknown mine'}
            {rec.frequency ? ` · ${rec.frequency}` : ''}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>
          {rec.priority ? (
            <Badge tone={PRIORITY_META[rec.priority].tone}>
              {PRIORITY_META[rec.priority].label} priority
            </Badge>
          ) : null}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Panel title="Requirement">
            <p className="whitespace-pre-line text-sm text-primary">
              {rec.description ?? 'No description on file for this requirement.'}
            </p>
            {rec.note ? (
              <p className="mt-3 border-t border-border pt-3 text-sm text-secondary">{rec.note}</p>
            ) : null}
          </Panel>

          <Panel title="Linked field finding">
            {rec.linkedObservation ? (
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <Link
                    href={`/observations/${rec.linkedObservation.id}`}
                    className="text-sm font-medium text-primary underline-offset-2 hover:text-accent-600 hover:underline"
                  >
                    {rec.linkedObservation.title}
                  </Link>
                  <Badge tone={RISK_META[rec.linkedObservation.risk].tone}>
                    {RISK_META[rec.linkedObservation.risk].label}
                  </Badge>
                </div>
                <p className="text-sm text-secondary">
                  This statutory obligation is currently at risk because of an open field
                  observation.
                  {rec.linkedObservation.evidenceCount > 0
                    ? ` ${rec.linkedObservation.evidenceCount} evidence item(s) attached.`
                    : ''}
                </p>
                <Link
                  href={`/observations/${rec.linkedObservation.id}`}
                  className="inline-flex items-center gap-1.5 text-sm text-accent-600 hover:underline"
                >
                  Open observation, AI analysis and corrective action
                  <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} />
                </Link>
              </div>
            ) : (
              <EmptyState
                title="No linked finding"
                message="No field observation is currently linked to this requirement."
                compact
              />
            )}
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Status & ownership">
            <dl>
              <DefinitionRow label="Status">
                <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>
              </DefinitionRow>
              <DefinitionRow label="Priority">
                {rec.priority ? PRIORITY_META[rec.priority].label : '--'}
              </DefinitionRow>
              <DefinitionRow label="Due date">
                {rec.overdue ? (
                  <span className="text-critical-600">
                    {formatDate(rec.dueDate)} ({Math.abs(rec.daysToDue ?? 0)}d overdue)
                  </span>
                ) : (
                  formatDate(rec.dueDate)
                )}
              </DefinitionRow>
              <DefinitionRow label="Period">
                {rec.periodStart || rec.periodEnd
                  ? `${formatDate(rec.periodStart)} – ${formatDate(rec.periodEnd)}`
                  : '--'}
              </DefinitionRow>
              <DefinitionRow label="Responsible">{rec.ownerName ?? '--'}</DefinitionRow>
              <DefinitionRow label="Role">{rec.ownerRole ?? '--'}</DefinitionRow>
              <DefinitionRow label="Last reviewed">{formatDate(rec.reviewedAt)}</DefinitionRow>
            </dl>
          </Panel>
        </div>
      </div>
    </div>
  );
}
