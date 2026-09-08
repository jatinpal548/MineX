import { getSessionUser } from '@/lib/auth';
import { buildReportCsv, type ReportType } from '@/lib/data/reports';

/**
 * GET /reports/export?type=<report>&mine=<mineId>
 *
 * Streams a CSV built from the caller's RLS-scoped Supabase session - the export
 * can never contain rows the user could not already see in the UI.
 */
export const dynamic = 'force-dynamic';

const VALID: ReportType[] = ['inspections', 'observations', 'corrective-actions', 'compliance'];

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const url = new URL(request.url);
  const type = url.searchParams.get('type') as ReportType | null;
  const mine = url.searchParams.get('mine') ?? undefined;
  if (!type || !VALID.includes(type)) {
    return new Response('Unknown report type', { status: 400 });
  }

  try {
    const { filename, csv } = await buildReportCsv(type, mine);
    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return new Response('Report export is temporarily unavailable', { status: 502 });
  }
}
