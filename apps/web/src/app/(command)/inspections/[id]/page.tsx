import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import type { InspectionItemResponse } from '@coalguard/types';
import { getInspectionDetail } from '@/lib/data/inspections';
import { Badge } from '@/components/ui/badge';
import { Panel, DefinitionRow } from '@/components/ui/panel';
import { EmptyState } from '@/components/ui/empty-state';
import {
  InspectionStatusTag,
  RiskTag,
  ObservationStatusTag,
  CorrectiveActionStatusTag,
} from '@/components/ui/status-badge';
import { EvidenceGrid } from '@/components/command/evidence-grid';
import { LocationCard } from '@/components/command/location-card';
import { formatDateTime, titleCase } from '@/lib/format';

export const metadata: Metadata = { title: 'Inspection' };
export const dynamic = 'force-dynamic';

const RESPONSE_META: Record<InspectionItemResponse, { label: string; cls: string }> = {
  ok: { label: 'OK', cls: 'bg-safe-bg text-safe-600' },
  not_ok: { label: 'NOT OK', cls: 'bg-critical-bg text-critical-600' },
  na: { label: 'N/A', cls: 'bg-surface-muted text-secondary' },
};

export default async function InspectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const insp = await getInspectionDetail(id).catch(() => null);
  if (!insp) notFound();

  const sections = [...new Set(insp.items.map((i) => i.section))];

  return (
    <div className="space-y-6">
      <Link
        href="/inspections"
        className="inline-flex items-center gap-1.5 text-sm text-secondary hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={2} />
        Inspections
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
        <div className="min-w-0">
          <p className="cg-label">{titleCase(insp.inspectionType)}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-primary">{insp.title}</h1>
          <p className="mt-1 text-sm text-secondary">
            {insp.mineName ?? 'Unknown mine'}
            {insp.orgPath ? ` · ${insp.orgPath}` : ''}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <InspectionStatusTag status={insp.status} />
          {insp.overallRisk ? <RiskTag risk={insp.overallRisk} /> : null}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Panel title="Checklist" description={`${insp.progress.answered} of ${insp.progress.total} answered`}>
            {insp.items.length === 0 ? (
              <p className="text-sm text-secondary">This inspection has no checklist items.</p>
            ) : (
              <div className="space-y-5">
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge tone="safe">{insp.progress.ok} OK</Badge>
                  <Badge tone="critical">{insp.progress.notOk} Not OK</Badge>
                  <Badge tone="neutral">{insp.progress.na} N/A</Badge>
                </div>
                {sections.map((section) => (
                  <div key={section}>
                    <p className="cg-label mb-2">{section}</p>
                    <ul className="divide-y divide-border rounded-md border border-border">
                      {insp.items
                        .filter((i) => i.section === section)
                        .map((item) => (
                          <li key={item.id} className="flex items-start justify-between gap-3 p-3">
                            <div className="min-w-0">
                              <p className="text-sm text-primary">{item.prompt}</p>
                              {item.notes ? (
                                <p className="mt-1 text-xs text-secondary">{item.notes}</p>
                              ) : null}
                            </div>
                            <span
                              className={`shrink-0 rounded-sm px-2 py-0.5 text-xs font-semibold ${
                                item.response
                                  ? RESPONSE_META[item.response].cls
                                  : 'bg-surface-muted text-secondary'
                              }`}
                            >
                              {item.response ? RESPONSE_META[item.response].label : 'Not answered'}
                            </span>
                          </li>
                        ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title={`Observations (${insp.observations.length})`}>
            {insp.observations.length === 0 ? (
              <EmptyState title="No observations" message="Nothing was flagged on this inspection." compact />
            ) : (
              <ul className="space-y-3">
                {insp.observations.map((o) => (
                  <li key={o.id} className="rounded-md border border-border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <Link
                        href={`/observations/${o.id}`}
                        className="text-sm font-medium text-primary underline-offset-2 hover:text-accent-600 hover:underline"
                      >
                        {o.title}
                      </Link>
                      <RiskTag risk={o.risk} />
                    </div>
                    {o.description ? (
                      <p className="mt-1 line-clamp-2 text-sm text-secondary">{o.description}</p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-secondary">
                      <ObservationStatusTag status={o.status} />
                      {o.correctiveAction ? (
                        <CorrectiveActionStatusTag status={o.correctiveAction.status} />
                      ) : null}
                      {o.evidenceCount > 0 ? <span>· {o.evidenceCount} photo(s)</span> : null}
                      {o.inspectorName ? <span>· {o.inspectorName}</span> : null}
                      <span>· {formatDateTime(o.createdAt)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Evidence">
            <EvidenceGrid items={insp.evidence} />
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Summary">
            <dl>
              <DefinitionRow label="Status">
                <InspectionStatusTag status={insp.status} />
              </DefinitionRow>
              <DefinitionRow label="Overall risk">
                {insp.overallRisk ? <RiskTag risk={insp.overallRisk} /> : 'Not set'}
              </DefinitionRow>
              <DefinitionRow label="Checklist">
                {insp.progress.ok} OK / {insp.progress.notOk} Not OK / {insp.progress.na} N/A
              </DefinitionRow>
              <DefinitionRow label="Template">{insp.templateName ?? '--'}</DefinitionRow>
              <DefinitionRow label="Inspector">{insp.inspector?.name ?? '--'}</DefinitionRow>
              <DefinitionRow label="Scheduled">{formatDateTime(insp.scheduledFor)}</DefinitionRow>
              <DefinitionRow label="Started">{formatDateTime(insp.startedAt)}</DefinitionRow>
              <DefinitionRow label="Submitted">{formatDateTime(insp.submittedAt)}</DefinitionRow>
              <DefinitionRow label="Closed">{formatDateTime(insp.closedAt)}</DefinitionRow>
            </dl>
            {insp.summary ? (
              <p className="mt-3 rounded-md bg-surface-muted p-3 text-sm text-secondary">
                {insp.summary}
              </p>
            ) : null}
          </Panel>

          <Panel title="Location">
            <LocationCard coords={insp.coords} />
          </Panel>
        </div>
      </div>
    </div>
  );
}
