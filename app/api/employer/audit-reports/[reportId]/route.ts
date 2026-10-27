/**
 * GET /api/employer/audit-reports/:reportId — one report about the company.
 * A report filed against another establishment is a 404.
 */
import { requireEmployerApi } from '@/lib/auth/api-guards';
import { fail, handleRouteError, notFound, ok } from '@/lib/utils/api-response';
import { getReportDetail } from '@/services/audit-report.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ reportId: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const user = await requireEmployerApi(['audit_report.read']);
    const { reportId } = await params;
    const id = Number(reportId);
    if (!Number.isInteger(id) || id <= 0) return fail('Invalid report id', 400);

    const detail = await getReportDetail(id);
    if (!detail) return notFound('Report');
    const report = detail.report as unknown as Record<string, unknown>;
    if (Number(report?.employer_id ?? 0) !== Number(user.employerId ?? 0)) return notFound('Report');

    return ok(detail);
  } catch (error) {
    return handleRouteError(error, { route: '/api/employer/audit-reports/:id', method: 'GET' });
  }
}
