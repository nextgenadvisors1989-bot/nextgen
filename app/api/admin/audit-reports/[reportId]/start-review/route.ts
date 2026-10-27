/**
 * POST /api/admin/audit-reports/[reportId]/start-review
 * Moves a Submitted report to Under Review and marks the verifier assignment
 * in_review. Idempotent — opening the review screen twice is harmless.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, notFound, ok } from '@/lib/utils/api-response';
import { startReview } from '@/services/audit-report.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  const id = Number(reportId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Report');

  try {
    const user = await requireAdminApi(['audit_report.verify']);
    const result = await startReview(id, { user, ip: clientIp(request) });
    if (!result) return notFound('Report');

    return ok(
      { report: result.report, changed: result.changed },
      { message: result.changed ? 'Verification started' : 'This report is already under review' }
    );
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/audit-reports/[reportId]/start-review', method: 'POST' });
  }
}
