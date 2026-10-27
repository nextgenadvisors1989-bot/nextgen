/**
 * POST /api/admin/audit-reports/[reportId]/restore
 * Reopens an archived report as a draft so it can be corrected and resubmitted.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, notFound, ok } from '@/lib/utils/api-response';
import { restoreReport } from '@/services/audit-report.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  const id = Number(reportId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Report');

  try {
    const user = await requireAdminApi(['audit_report.update']);
    const result = await restoreReport(id, { user, ip: clientIp(request) });
    if (!result) return notFound('Report');
    return ok({ report: result.report }, { message: 'Report reopened as a draft' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/audit-reports/[reportId]/restore', method: 'POST' });
  }
}
