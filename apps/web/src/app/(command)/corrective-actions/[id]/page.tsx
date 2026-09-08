import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getCorrectiveActionDetail } from '@/lib/data/corrective-actions';
import {
  getCorrectiveActionEvidence,
  getEligibleAssignees,
  getGovernanceEvents,
} from '@/lib/data/governance';
import { getSessionUser } from '@/lib/auth';
import { caCapabilities } from '@/lib/data/ca-permissions';
import { Badge } from '@/components/ui/badge';
import { Panel, DefinitionRow } from '@/components/ui/panel';
import { EmptyState } from '@/components/ui/empty-state';
import {
  CorrectiveActionStatusTag,
  ObservationStatusTag,
  PriorityTag,
  RiskTag,
} from '@/components/ui/status-badge';
import { EvidenceGrid } from '@/components/command/evidence-grid';
import { GovernancePanel } from '@/components/command/governance/governance-panel';
import { GovernanceTimeline } from '@/components/command/governance/governance-timeline';
import { formatDate, formatDateTime } from '@/lib/format';

export const metadata: Metadata = { title: 'Corrective Action' };
export const dynamic = 'force-dynamic';

export default async function CorrectiveActionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [ca, user] = await Promise.all([
    getCorrectiveActionDetail(id).catch(() => null),
    getSessionUser(),
  ]);
  if (!ca) notFound();
  if (!user) notFound();

  const caps = caCapabilities(
    user.roles.map((r) => r.role),
    user.id,
    { status: ca.status, assignedTo: ca.assignedTo },
  );

  const [evidence, events, assignees] = await Promise.all([
    getCorrectiveActionEvidence(ca.id, ca.observation?.id ?? null),
    getGovernanceEvents(ca.id),
    caps.canAssign ? getEligibleAssignees(ca.id) : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <Link
        href="/corrective-actions"
        className="inline-flex items-center gap-1.5 text-sm text-secondary hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={2} />
        Corrective Actions
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
        <div className="min-w-0">
          <p className="cg-label">Corrective action</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-primary">{ca.title}</h1>
          <p className="mt-1 text-sm text-secondary">
            {ca.mineName ?? 'Unknown mine'}
            {ca.observation ? ' · ' : ''}
            {ca.observation ? (
              <Link
                href={`/observations/${ca.observation.id}`}
                className="text-accent-600 underline-offset-2 hover:underline"
              >
                {ca.observation.title}
              </Link>
            ) : null}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-2">
            <PriorityTag priority={ca.priority} />
            <CorrectiveActionStatusTag status={ca.status} />
          </div>
          {ca.overdue ? <Badge tone="critical">Overdue</Badge> : null}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Panel title="Description">
            {ca.description ? (
              <p className="whitespace-pre-line text-sm text-primary">{ca.description}</p>
            ) : (
              <p className="text-sm text-secondary">No description was provided.</p>
            )}
            {ca.closureNotes ? (
              <div className="mt-4">
                <p className="cg-label">Closure notes (from owner)</p>
                <p className="mt-1 whitespace-pre-line rounded-md bg-surface-muted p-3 text-sm text-secondary">
                  {ca.closureNotes}
                </p>
              </div>
            ) : null}
            {ca.rejectionReason ? (
              <div className="mt-4">
                <p className="cg-label text-critical-600">Rejection reason</p>
                <p className="mt-1 whitespace-pre-line rounded-md bg-critical-bg p-3 text-sm text-critical-600">
                  {ca.rejectionReason}
                </p>
              </div>
            ) : null}
          </Panel>

          <Panel title="Related Observation">
            {ca.observation ? (
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <Link
                    href={`/observations/${ca.observation.id}`}
                    className="text-sm font-medium text-primary underline-offset-2 hover:text-accent-600 hover:underline"
                  >
                    {ca.observation.title}
                  </Link>
                  <div className="flex shrink-0 gap-2">
                    <RiskTag risk={ca.observation.risk} />
                    <ObservationStatusTag status={ca.observation.status} />
                  </div>
                </div>
                {ca.observation.description ? (
                  <p className="line-clamp-3 text-sm text-secondary">{ca.observation.description}</p>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-secondary">This action is not linked to an observation.</p>
            )}
          </Panel>

          <Panel title="Closure Evidence">
            {evidence.closure.length === 0 ? (
              <EmptyState
                title="No closure evidence"
                message="Evidence attached to this corrective action (from the field app or the Command Center) appears here."
                compact
              />
            ) : (
              <EvidenceGrid items={evidence.closure} />
            )}
          </Panel>

          {evidence.observation.length > 0 ? (
            <Panel title="Evidence from the Observation">
              <EvidenceGrid items={evidence.observation} />
            </Panel>
          ) : null}
        </div>

        <div className="space-y-6">
          <GovernancePanel
            caId={ca.id}
            status={ca.status}
            mineId={ca.mineId ?? ''}
            assignedToName={ca.assigneeName}
            capabilities={caps}
            assignees={assignees}
          />

          <Panel title="Details">
            <dl>
              <DefinitionRow label="Status">
                <CorrectiveActionStatusTag status={ca.status} />
              </DefinitionRow>
              <DefinitionRow label="Priority">
                <PriorityTag priority={ca.priority} />
              </DefinitionRow>
              <DefinitionRow label="Owner">
                {ca.assigneeName ?? 'Unassigned'}
                {ca.assigneeEmail ? (
                  <span className="block text-xs text-secondary">{ca.assigneeEmail}</span>
                ) : null}
              </DefinitionRow>
              <DefinitionRow label="Assigned by">{ca.assignerName ?? '--'}</DefinitionRow>
              <DefinitionRow label="Due date">
                <span className={ca.overdue ? 'font-medium text-critical-600' : undefined}>
                  {formatDate(ca.dueDate)}
                </span>
              </DefinitionRow>
              <DefinitionRow label="Created">{formatDateTime(ca.createdAt)}</DefinitionRow>
              <DefinitionRow label="Last updated">{formatDateTime(ca.updatedAt)}</DefinitionRow>
              <DefinitionRow label="Verification">
                {ca.verifiedAt
                  ? `Verified ${formatDate(ca.verifiedAt)}${ca.verifierName ? ` by ${ca.verifierName}` : ''}`
                  : 'Not verified'}
              </DefinitionRow>
            </dl>
          </Panel>

          <Panel title="Governance Timeline">
            <GovernanceTimeline
              createdAt={ca.createdAt}
              structured={ca.timeline.map((e) => ({ label: e.label, at: e.at }))}
              events={events}
            />
          </Panel>
        </div>
      </div>
    </div>
  );
}
