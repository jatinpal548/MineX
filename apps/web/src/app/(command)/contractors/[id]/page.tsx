import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getContractorDetail, CONTRACTOR_RISK_META } from '@/lib/data/contractors';
import { Panel, DefinitionRow } from '@/components/ui/panel';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { TableShell, Th, Td, Tr } from '@/components/ui/data-table';
import { formatDate } from '@/lib/format';

export const metadata: Metadata = { title: 'Contractor' };
export const dynamic = 'force-dynamic';

const MED_META = {
  valid: { label: 'Valid', tone: 'safe' as const },
  expiring: { label: 'Expiring', tone: 'warning' as const },
  expired: { label: 'Expired', tone: 'critical' as const },
  unknown: { label: 'Not on file', tone: 'neutral' as const },
};

export default async function ContractorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const c = await getContractorDetail(id).catch(() => null);
  if (!c) notFound();

  return (
    <div className="space-y-6">
      <Link
        href="/contractors"
        className="inline-flex items-center gap-1.5 text-sm text-secondary hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={2} />
        Contractors
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
        <div className="min-w-0">
          <p className="cg-label">{c.registrationNo}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-primary">{c.name}</h1>
          <p className="mt-1 text-sm text-secondary">
            {c.mineName ?? 'Unknown mine'}
            {c.scopeOfWork ? ` · ${c.scopeOfWork}` : ''}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Badge tone={CONTRACTOR_RISK_META[c.risk].tone}>
            {CONTRACTOR_RISK_META[c.risk].label}
          </Badge>
          <Badge tone={c.isActive ? 'safe' : 'neutral'}>{c.isActive ? 'Active' : 'Inactive'}</Badge>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Panel title="Workforce" bodyClassName="p-0">
            {c.workers.length === 0 ? (
              <div className="p-5">
                <EmptyState title="No workers on roll" message="No contractor workers recorded." compact />
              </div>
            ) : (
              <TableShell>
                <thead>
                  <tr>
                    <Th>Worker</Th>
                    <Th>Induction</Th>
                    <Th>Medical validity</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {c.workers.map((w) => (
                    <Tr key={w.id}>
                      <Td>
                        <span className="font-medium text-primary">{w.fullName}</span>
                        <span className="mt-0.5 block text-xs text-secondary">
                          {w.designation ?? '—'}
                        </span>
                      </Td>
                      <Td>
                        <Badge tone={w.inductionDone ? 'safe' : 'critical'}>
                          {w.inductionDone ? `Done ${w.inductionDate ? formatDate(w.inductionDate) : ''}` : 'Pending'}
                        </Badge>
                      </Td>
                      <Td>
                        <Badge tone={MED_META[w.medicalState].tone}>
                          {MED_META[w.medicalState].label}
                        </Badge>
                        {w.medicalValidUntil ? (
                          <span className="mt-0.5 block text-xs text-secondary">
                            to {formatDate(w.medicalValidUntil)}
                          </span>
                        ) : null}
                      </Td>
                      <Td className="text-secondary">{w.isActive ? 'Active' : 'Inactive'}</Td>
                    </Tr>
                  ))}
                </tbody>
              </TableShell>
            )}
          </Panel>

          <Panel title="Compliance & risk">
            <dl>
              <DefinitionRow label="Overall status">
                <Badge tone={CONTRACTOR_RISK_META[c.risk].tone}>
                  {CONTRACTOR_RISK_META[c.risk].label}
                </Badge>
              </DefinitionRow>
              <DefinitionRow label="Induction gaps">
                {c.inductionGaps > 0 ? (
                  <span className="text-critical-600">{c.inductionGaps} worker(s) pending</span>
                ) : (
                  'None'
                )}
              </DefinitionRow>
              <DefinitionRow label="Medical issues">
                {c.medicalIssues > 0 ? (
                  <span className="text-warning-600">{c.medicalIssues} expiring / expired</span>
                ) : (
                  'None'
                )}
              </DefinitionRow>
              <DefinitionRow label="Contract state">
                {c.contractState === 'open'
                  ? 'Ongoing'
                  : c.contractState.charAt(0).toUpperCase() + c.contractState.slice(1)}
              </DefinitionRow>
            </dl>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Contract">
            <dl>
              <DefinitionRow label="Registration">{c.registrationNo}</DefinitionRow>
              <DefinitionRow label="Contact">{c.contactPerson ?? '—'}</DefinitionRow>
              <DefinitionRow label="Phone">{c.phone ?? '—'}</DefinitionRow>
              <DefinitionRow label="Scope">{c.scopeOfWork ?? '—'}</DefinitionRow>
              <DefinitionRow label="Start">{formatDate(c.contractStart)}</DefinitionRow>
              <DefinitionRow label="End">{formatDate(c.contractEnd)}</DefinitionRow>
              <DefinitionRow label="Workers on roll">{c.workerCount}</DefinitionRow>
            </dl>
          </Panel>
        </div>
      </div>
    </div>
  );
}
