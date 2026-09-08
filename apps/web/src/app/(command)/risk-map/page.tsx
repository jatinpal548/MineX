import type { Metadata } from 'next';
import Link from 'next/link';
import { Map as MapIcon, MapPinOff } from 'lucide-react';
import type { RiskLevel } from '@coalguard/types';
import { getCommandContext } from '@/lib/data/context';
import { getRiskMapData } from '@/lib/data/risk-map';
import { PageHeader } from '@/components/ui/page-header';
import { Panel } from '@/components/ui/panel';
import { ParamSelect } from '@/components/ui/param-select';
import { EmptyState } from '@/components/ui/empty-state';
import { KpiCard } from '@/components/ui/kpi-card';
import { MineRiskMap } from '@/components/command/mine-risk-map';
import { RiskTag } from '@/components/ui/status-badge';
import { TableShell, Th, Td, Tr, CellLink } from '@/components/ui/data-table';
import { formatDateTime } from '@/lib/format';

export const metadata: Metadata = { title: 'Mine Risk Map' };
export const dynamic = 'force-dynamic';

const str = (v: string | string[] | undefined) => (typeof v === 'string' && v ? v : undefined);

export default async function RiskMapPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const context = await getCommandContext();
  if (!context) return null;

  const mineParam = str(sp.mine);
  const activeMine =
    mineParam && context.mines.some((m) => m.id === mineParam)
      ? mineParam
      : context.mines.length === 1
        ? context.mines[0]?.id
        : undefined;
  const focus = str(sp.focus);

  const data = await getRiskMapData({ mineId: activeMine, includeResolved: true });
  const counts = (['critical', 'high', 'medium', 'low'] as RiskLevel[]).map((r) => ({
    r,
    n: data.points.filter((p) => p.risk === r).length,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="AI & Analytics"
        title="Mine Risk Map"
        description="Geo-tagged observations plotted by risk severity. Markers use live GPS captured in the field."
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
        {counts.map(({ r, n }) => (
          <KpiCard
            key={r}
            label={`${r.charAt(0).toUpperCase() + r.slice(1)} on map`}
            value={n}
            tone={
              r === 'critical'
                ? 'critical'
                : r === 'high'
                  ? 'high-risk'
                  : r === 'medium'
                    ? 'warning'
                    : 'safe'
            }
          />
        ))}
      </section>

      <Panel
        title={data.mineName ? `${data.mineName} — risk overview` : 'Risk overview'}
        description={`${data.points.length} geo-tagged · ${data.ungeotagged.length} without coordinates`}
      >
        {data.center && data.points.length > 0 ? (
          <MineRiskMap center={data.center} points={data.points} height={460} focusId={focus} />
        ) : (
          <EmptyState
            icon={MapIcon}
            title="No geo-tagged findings"
            message="Observations captured with GPS in MineX Field will appear here."
          />
        )}
      </Panel>

      {data.points.length > 0 ? (
        <Panel title="Geo-tagged findings" bodyClassName="p-0">
          <TableShell>
            <thead>
              <tr>
                <Th>Observation</Th>
                <Th>Risk</Th>
                <Th>Category</Th>
                <Th>Coordinates</Th>
                <Th>Raised</Th>
              </tr>
            </thead>
            <tbody>
              {data.points.map((p) => (
                <Tr key={p.id}>
                  <Td>
                    <CellLink href={`/observations/${p.id}`}>{p.title}</CellLink>
                  </Td>
                  <Td>
                    <RiskTag risk={p.risk} />
                  </Td>
                  <Td className="text-secondary">{p.category ?? '—'}</Td>
                  <Td className="whitespace-nowrap text-secondary">
                    {p.lat.toFixed(5)}, {p.lng.toFixed(5)}
                  </Td>
                  <Td className="whitespace-nowrap text-secondary">{formatDateTime(p.createdAt)}</Td>
                </Tr>
              ))}
            </tbody>
          </TableShell>
        </Panel>
      ) : null}

      {data.ungeotagged.length > 0 ? (
        <Panel
          title="Findings without coordinates"
          description="Raised without GPS — not shown on the map"
        >
          <ul className="divide-y divide-border">
            {data.ungeotagged.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <div className="flex min-w-0 items-center gap-2">
                  <MapPinOff className="h-3.5 w-3.5 shrink-0 text-secondary" strokeWidth={2} />
                  <Link
                    href={`/observations/${p.id}`}
                    className="truncate text-sm text-primary hover:text-accent-600 hover:underline"
                  >
                    {p.title}
                  </Link>
                </div>
                <RiskTag risk={p.risk} />
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}
