/**
 * GET /api/auditor/reports
 * The auditor's own report register: everything they have drafted, submitted,
 * had returned or had approved — with the counters shown on the page header.
 */
import { requireAuditorApi } from '@/lib/auth/api-guards';
import { handleRouteError, ok, parseSearchParams } from '@/lib/utils/api-response';
import { identityFor, myReports, myReportStats } from '@/services/auditor-workspace.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const user = await requireAuditorApi(['audit_report.read']);
    const me = await identityFor(user.id);
    const params = parseSearchParams(request);

    const [rows, stats] = await Promise.all([
      myReports(me.id, {
        search: params.get('search') ?? undefined,
        status: params.get('status') ?? undefined,
      }),
      myReportStats(me.id),
    ]);

    return ok(rows, { extra: { stats, auditor: me } });
  } catch (error) {
    return handleRouteError(error, { route: '/api/auditor/reports', method: 'GET' });
  }
}
