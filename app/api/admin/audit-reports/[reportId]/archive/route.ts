/** POST /api/admin/audit-reports/[reportId]/archive — files a report away. */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, notFound, ok } from '@/lib/utils/api-response';
import { archiveReport } from '@/services/audit-report.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  const id = Number(reportId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Report');

  try {
    const user = await requireAdminApi(['audit_report.update']);
    const result = await archiveReport(id, { user, ip: clientIp(request) });
    if (!result) return notFound('Report');
    return ok(
      { report: result.report, changed: result.changed },
      { message: result.changed ? 'Report archived' : 'This report is already archived' }
    );
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/audit-reports/[reportId]/archive', method: 'POST' });
  }
}
