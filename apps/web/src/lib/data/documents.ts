/**
 * Compliance document register. RLS-scoped SSR client.
 * Real table: `compliance_documents` (holds ocr_text once digitised).
 */
import { createClient } from '@/lib/supabase/server';
import { one } from './shared';

export interface ComplianceDocumentRow {
  id: string;
  title: string;
  mimeType: string | null;
  docDate: string | null;
  createdAt: string;
  hasOcr: boolean;
  ocrPreview: string | null;
  requirementCode: string | null;
  mineName: string | null;
}

export async function listComplianceDocuments(opts?: {
  mineId?: string;
}): Promise<ComplianceDocumentRow[]> {
  const supabase = await createClient();
  let q = supabase
    .from('compliance_documents')
    .select(
      `id, title, mime_type, doc_date, created_at, ocr_text,
       requirement:compliance_requirements!compliance_documents_requirement_id_fkey(code),
       mine:mines!compliance_documents_mine_id_fkey(name)`,
    )
    .order('created_at', { ascending: false })
    .limit(200);
  if (opts?.mineId) q = q.eq('mine_id', opts.mineId);

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  return ((data ?? []) as Record<string, unknown>[]).map((r) => {
    const ocr = (r.ocr_text as string) ?? null;
    return {
      id: r.id as string,
      title: r.title as string,
      mimeType: (r.mime_type as string) ?? null,
      docDate: (r.doc_date as string) ?? null,
      createdAt: r.created_at as string,
      hasOcr: Boolean(ocr && ocr.trim().length > 0),
      ocrPreview: ocr ? ocr.slice(0, 240) : null,
      requirementCode:
        (one(r.requirement as unknown) as { code?: string } | null)?.code ?? null,
      mineName: (one(r.mine as unknown) as { name?: string } | null)?.name ?? null,
    };
  });
}
