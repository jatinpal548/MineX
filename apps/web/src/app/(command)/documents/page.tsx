import type { Metadata } from 'next';
import { FileText, ScanText, Upload } from 'lucide-react';
import { getCommandContext } from '@/lib/data/context';
import { listComplianceDocuments } from '@/lib/data/documents';
import { PageHeader } from '@/components/ui/page-header';
import { Panel } from '@/components/ui/panel';
import { ParamSelect } from '@/components/ui/param-select';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { TableShell, Th, Td, Tr } from '@/components/ui/data-table';
import { formatDate } from '@/lib/format';

export const metadata: Metadata = { title: 'Documents' };
export const dynamic = 'force-dynamic';

const str = (v: string | string[] | undefined) => (typeof v === 'string' && v ? v : undefined);

const PIPELINE = [
  { n: 1, t: 'Upload', d: 'Attach a scanned statutory document (permit, return, notice) to a mine and requirement.' },
  { n: 2, t: 'OCR extraction', d: 'Text is extracted locally on the device — no document leaves the operator’s environment.' },
  { n: 3, t: 'Field detection', d: 'Requirement title, category, deadline, responsible officer and priority are proposed from the text.' },
  { n: 4, t: 'Review & save', d: 'The officer confirms or corrects the fields before a compliance record is created.' },
];

export default async function DocumentsPage({
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

  const docs = await listComplianceDocuments({ mineId: activeMine });

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Governance"
        title="Document Digitization"
        description="OCR-based digitization of statutory compliance documents into the compliance register."
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

      <Panel title="How digitization works">
        <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {PIPELINE.map((s) => (
            <li key={s.n} className="rounded-md border border-border p-3">
              <div className="flex items-center gap-2">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-surface-muted text-xs font-semibold text-primary">
                  {s.n}
                </span>
                <p className="text-sm font-semibold text-primary">{s.t}</p>
              </div>
              <p className="mt-1.5 text-xs text-secondary">{s.d}</p>
            </li>
          ))}
        </ol>
        <div className="mt-4 flex items-center gap-2 rounded-md border border-dashed border-border bg-surface-muted/40 p-3 text-sm text-secondary">
          <ScanText className="h-4 w-4 shrink-0" strokeWidth={2} />
          <span>
            OCR extraction runs as <span className="font-medium text-primary">local processing</span>{' '}
            in the field deployment. Uploaded documents and extracted text are stored on the{' '}
            <code className="text-primary">compliance_documents</code> table and linked to the
            compliance register. No third-party OCR service is used.
          </span>
        </div>
      </Panel>

      <Panel
        title="Compliance documents"
        description="Digitised statutory documents in scope"
        actions={
          <span className="inline-flex items-center gap-1.5 text-xs text-secondary">
            <Upload className="h-3.5 w-3.5" strokeWidth={2} />
            Capture from MineX Field or a connected scanner
          </span>
        }
        bodyClassName="p-0"
      >
        {docs.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={FileText}
              title="No documents digitised yet"
              message="Statutory documents captured and OCR-processed in the field will be listed here, with their extracted text linked to the matching compliance requirement."
            />
          </div>
        ) : (
          <TableShell>
            <thead>
              <tr>
                <Th>Document</Th>
                <Th>Requirement</Th>
                <Th>Doc date</Th>
                <Th>OCR</Th>
                <Th>Added</Th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <Tr key={d.id}>
                  <Td>
                    <span className="font-medium text-primary">{d.title}</span>
                    {d.ocrPreview ? (
                      <span className="mt-0.5 block max-w-md truncate text-xs text-secondary">
                        {d.ocrPreview}
                      </span>
                    ) : null}
                  </Td>
                  <Td className="text-secondary">{d.requirementCode ?? '—'}</Td>
                  <Td className="text-secondary">{d.docDate ? formatDate(d.docDate) : '—'}</Td>
                  <Td>
                    <Badge tone={d.hasOcr ? 'safe' : 'neutral'}>
                      {d.hasOcr ? 'Extracted' : 'Pending'}
                    </Badge>
                  </Td>
                  <Td className="text-secondary">{formatDate(d.createdAt)}</Td>
                </Tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Panel>
    </div>
  );
}
