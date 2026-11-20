import type { Metadata } from 'next';
import { HardHat, ShieldAlert, Users } from 'lucide-react';
import { loadScopedCommandPage } from '@/lib/data/context';
import { listContractors, contractorKpis, CONTRACTOR_RISK_META } from '@/lib/data/contractors';
import { PageHeader } from '@/components/ui/page-header';
import { KpiCard } from '@/components/ui/kpi-card';
import { Panel } from '@/components/ui/panel';
import { ParamSelect } from '@/components/ui/param-select';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { TableShell, Th, Td, Tr, CellLink } from '@/components/ui/data-table';
import { formatDate } from '@/lib/format';

export const metadata: Metadata = { title: 'Contractors' };
export const dynamic = 'force-dynamic';

const str = (v: string | string[] | undefined) => (typeof v === 'string' && v ? v : undefined);

const CONTRACT_TONE = {
  active: 'safe',
  expiring: 'warning',
  expired: 'critical',
  open: 'neutral',
} as const;

export default async function ContractorsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;

  const loaded = await loadScopedCommandPage(str(sp.mine), (mineId) =>
    listContractors({ mineId }),
  );
  if (!loaded) return null;
  const { context, data: rows } = loaded;
  const kpis = contractorKpis(rows);

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="People"
        title="Contractor Management"
        description="Registered contractors, their workforce and induction / medical compliance status."
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

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Contractors" value={kpis.total} icon={HardHat} hint={`${kpis.active} active`} />
        <KpiCard label="Contract Workforce" value={kpis.totalWorkers} icon={Users} />
        <KpiCard
          label="At-Risk Contractors"
          value={kpis.atRisk}
          icon={ShieldAlert}
          tone={kpis.atRisk > 0 ? 'critical' : 'safe'}
          hint="High or critical status"
        />
        <KpiCard
          label="Induction / Medical Gaps"
          value={kpis.inductionGaps + kpis.medicalIssues}
          icon={ShieldAlert}
          tone={kpis.inductionGaps + kpis.medicalIssues > 0 ? 'warning' : 'safe'}
          hint={`${kpis.inductionGaps} induction · ${kpis.medicalIssues} medical`}
        />
      </section>

      <Panel title="Contractor Register" bodyClassName="p-0">
        {rows.length === 0 ? (
          <div className="p-5">
            <EmptyState icon={HardHat} title="No contractors" message="No contractors are registered for this scope." />
          </div>
        ) : (
          <TableShell>
            <thead>
              <tr>
                <Th>Contractor</Th>
                <Th>Mine</Th>
                <Th>Workforce</Th>
                <Th>Contract</Th>
                <Th>Compliance status</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <Tr key={c.id}>
                  <Td>
                    <CellLink href={`/contractors/${c.id}`}>{c.name}</CellLink>
                    <span className="mt-0.5 block text-xs text-secondary">
                      {c.registrationNo}
                      {c.scopeOfWork ? ` · ${c.scopeOfWork}` : ''}
                    </span>
                  </Td>
                  <Td className="text-secondary">{c.mineName ?? '—'}</Td>
                  <Td className="text-secondary">
                    {c.activeWorkers} active
                    <span className="mt-0.5 block text-xs text-secondary">{c.workerCount} on roll</span>
                  </Td>
                  <Td>
                    <Badge tone={CONTRACT_TONE[c.contractState]}>
                      {c.contractState === 'open'
                        ? 'Ongoing'
                        : c.contractState.charAt(0).toUpperCase() + c.contractState.slice(1)}
                    </Badge>
                    {c.contractEnd ? (
                      <span className="mt-0.5 block text-xs text-secondary">
                        to {formatDate(c.contractEnd)}
                      </span>
                    ) : null}
                  </Td>
                  <Td>
                    <Badge tone={CONTRACTOR_RISK_META[c.risk].tone}>
                      {CONTRACTOR_RISK_META[c.risk].label}
                    </Badge>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Panel>
    </div>
  );
}
