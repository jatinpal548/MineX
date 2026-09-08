import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, MapPin, Sparkles } from 'lucide-react';
import { getObservationDetail } from '@/lib/data/observations';
import { Panel, DefinitionRow } from '@/components/ui/panel';
import { EmptyState } from '@/components/ui/empty-state';
import {
  CorrectiveActionStatusTag,
  ObservationStatusTag,
  PriorityTag,
  RiskTag,
} from '@/components/ui/status-badge';
import { EvidenceGrid } from '@/components/command/evidence-grid';
import { LocationCard } from '@/components/command/location-card';
import { Timeline } from '@/components/command/timeline';
import { formatDate, formatDateTime } from '@/lib/format';

export const metadata: Metadata = { title: 'Observation' };
export const dynamic = 'force-dynamic';

export default async function ObservationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const obs = await getObservationDetail(id).catch(() => null);
  if (!obs) notFound();

  const ai = obs.aiAnalysis;
  const ca = obs.correctiveAction;

  return (
    <div className="space-y-6">
      <Link
        href="/observations"
        className="inline-flex items-center gap-1.5 text-sm text-secondary hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={2} />
        Observations
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
        <div className="min-w-0">
          <p className="cg-label">{obs.category ?? 'Observation'}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-primary">{obs.title}</h1>
          <p className="mt-1 text-sm text-secondary">
            {obs.mineName ?? 'Unknown mine'}
            {obs.inspector ? ` · ${obs.inspector.name}` : ''} · {formatDateTime(obs.createdAt)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <RiskTag risk={obs.risk} />
          <ObservationStatusTag status={obs.status} />
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Panel title="Description">
            {obs.description ? (
              <p className="whitespace-pre-line text-sm text-primary">{obs.description}</p>
            ) : (
              <p className="text-sm text-secondary">No description was provided.</p>
            )}
          </Panel>

          <Panel title="Evidence">
            <EvidenceGrid items={obs.evidence} />
          </Panel>

          <Panel
            title="AI Risk Analysis"
            description={ai ? `${ai.provider ?? 'model'} · ${ai.analysisType}` : undefined}
          >
            {ai ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  {ai.risk ? <RiskTag risk={ai.risk} /> : null}
                  {typeof ai.confidence === 'number' ? (
                    <span className="text-xs text-secondary">
                      Confidence {Math.round(ai.confidence * 100)}%
                    </span>
                  ) : null}
                  {ai.model ? <span className="text-xs text-secondary">· {ai.model}</span> : null}
                  {ai.simulated ? (
                    <span className="rounded-sm bg-surface-muted px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-secondary">
                      Simulated analysis
                    </span>
                  ) : null}
                </div>
                {ai.summary ? (
                  <div>
                    <p className="cg-label">Reasoning</p>
                    <p className="mt-1 text-sm text-primary">{ai.summary}</p>
                  </div>
                ) : null}
                {ai.consequence ? (
                  <div>
                    <p className="cg-label">Likely consequence</p>
                    <p className="mt-1 text-sm text-primary">{ai.consequence}</p>
                  </div>
                ) : null}
                {ai.recommendedAction ? (
                  <div>
                    <p className="cg-label">Recommended action</p>
                    <p className="mt-1 text-sm text-primary">{ai.recommendedAction}</p>
                  </div>
                ) : null}
                {ai.recommendations.length > 0 ? (
                  <div>
                    <p className="cg-label">Immediate steps</p>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-secondary">
                      {ai.recommendations.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : (
              <EmptyState
                icon={Sparkles}
                title="AI analysis not available"
                message="No AI analysis record is linked to this observation, or it is outside your read scope."
                compact
              />
            )}
          </Panel>

          <Panel title="Corrective Action">
            {ca ? (
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <Link
                    href={`/corrective-actions/${ca.id}`}
                    className="text-sm font-medium text-primary underline-offset-2 hover:text-accent-600 hover:underline"
                  >
                    {ca.title}
                  </Link>
                  <div className="flex shrink-0 gap-2">
                    <PriorityTag priority={ca.priority} />
                    <CorrectiveActionStatusTag status={ca.status} />
                  </div>
                </div>
                <dl>
                  <DefinitionRow label="Assignee">{ca.assigneeName ?? 'Unassigned'}</DefinitionRow>
                  <DefinitionRow label="Due date">{formatDate(ca.dueDate)}</DefinitionRow>
                  <DefinitionRow label="Created">{formatDate(ca.createdAt)}</DefinitionRow>
                  <DefinitionRow label="Verification">
                    {ca.verifiedAt
                      ? `Verified ${formatDate(ca.verifiedAt)}${ca.verifierName ? ` by ${ca.verifierName}` : ''}`
                      : 'Not verified'}
                  </DefinitionRow>
                </dl>
              </div>
            ) : (
              <EmptyState
                title="No corrective action"
                message="No corrective action has been raised for this observation yet."
                compact
              />
            )}
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Details">
            <dl>
              <DefinitionRow label="Risk">
                <RiskTag risk={obs.risk} />
              </DefinitionRow>
              <DefinitionRow label="Status">
                <ObservationStatusTag status={obs.status} />
              </DefinitionRow>
              <DefinitionRow label="Inspector">{obs.inspector?.name ?? '--'}</DefinitionRow>
              <DefinitionRow label="Mine">
                {obs.mineName ?? '--'}
                {obs.mineCode ? ` (${obs.mineCode})` : ''}
              </DefinitionRow>
              <DefinitionRow label="Inspection">
                {obs.inspection ? (
                  <Link
                    href={`/inspections/${obs.inspection.id}`}
                    className="text-accent-600 underline-offset-2 hover:underline"
                  >
                    {obs.inspection.title}
                  </Link>
                ) : (
                  '--'
                )}
              </DefinitionRow>
              <DefinitionRow label="Occurred">{formatDateTime(obs.occurredAt)}</DefinitionRow>
              <DefinitionRow label="Created">{formatDateTime(obs.createdAt)}</DefinitionRow>
            </dl>
          </Panel>

          <Panel title="Location">
            <LocationCard coords={obs.coords} />
            {obs.coords ? (
              <Link
                href={`/risk-map?focus=${obs.id}`}
                className="mt-3 inline-flex items-center gap-1.5 text-sm text-accent-600 hover:underline"
              >
                <MapPin className="h-3.5 w-3.5" strokeWidth={2} />
                View on Mine Risk Map
              </Link>
            ) : null}
          </Panel>

          <Panel title="Timeline">
            <Timeline events={obs.timeline.map((e) => ({ label: e.label, at: e.at }))} />
          </Panel>
        </div>
      </div>
    </div>
  );
}
