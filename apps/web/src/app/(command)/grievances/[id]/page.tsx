import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getSessionUser } from '@/lib/auth';
import { hasPermission } from '@coalguard/config';
import { getGrievanceDetail, GRIEVANCE_STATUS_META } from '@/lib/data/grievances';
import { Panel, DefinitionRow } from '@/components/ui/panel';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Timeline } from '@/components/command/timeline';
import { GrievanceActions } from './grievance-actions';
import { formatDateTime } from '@/lib/format';

export const metadata: Metadata = { title: 'Grievance' };
export const dynamic = 'force-dynamic';

export default async function GrievanceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [g, user] = await Promise.all([
    getGrievanceDetail(id).catch(() => null),
    getSessionUser(),
  ]);
  if (!g) notFound();

  const meta = GRIEVANCE_STATUS_META[g.status];
  const canManage = !!user && hasPermission(user.roles.map((r) => r.role), 'grievance:manage');

  return (
    <div className="space-y-6">
      <Link
        href="/grievances"
        className="inline-flex items-center gap-1.5 text-sm text-secondary hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={2} />
        Grievances
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
        <div className="min-w-0">
          <p className="cg-label">{g.category ?? 'Grievance'}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-primary">{g.title}</h1>
          <p className="mt-1 text-sm text-secondary">
            {g.mineName ?? 'Unknown mine'} · Raised by {g.raisedBy} · {formatDateTime(g.createdAt)}
          </p>
        </div>
        <Badge tone={meta.tone}>{meta.label}</Badge>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Panel title="Description">
            {g.description ? (
              <p className="whitespace-pre-line text-sm text-primary">{g.description}</p>
            ) : (
              <p className="text-sm text-secondary">No description was provided.</p>
            )}
          </Panel>

          <Panel title="Resolution">
            {g.resolutionNotes ? (
              <p className="whitespace-pre-line text-sm text-primary">{g.resolutionNotes}</p>
            ) : (
              <EmptyState
                title="Not yet resolved"
                message="Resolution notes will appear here once the grievance is closed out."
                compact
              />
            )}
          </Panel>

          <Panel title="Workflow">
            <GrievanceActions id={g.id} status={g.status} canManage={canManage} />
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Details">
            <dl>
              <DefinitionRow label="Status">
                <Badge tone={meta.tone}>{meta.label}</Badge>
              </DefinitionRow>
              <DefinitionRow label="Category">{g.category ?? '—'}</DefinitionRow>
              <DefinitionRow label="Raised by">
                {g.isAnonymous ? 'Anonymous' : g.raisedBy}
              </DefinitionRow>
              <DefinitionRow label="Responsible">{g.assignedTo ?? 'Unassigned'}</DefinitionRow>
              <DefinitionRow label="Submitted">{formatDateTime(g.createdAt)}</DefinitionRow>
              <DefinitionRow label="Resolved">{formatDateTime(g.resolvedAt)}</DefinitionRow>
            </dl>
          </Panel>

          <Panel title="Timeline">
            <Timeline events={g.timeline.map((e) => ({ label: e.label, at: e.at }))} />
          </Panel>
        </div>
      </div>
    </div>
  );
}
