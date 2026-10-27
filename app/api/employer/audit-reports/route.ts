/**
 * GET /api/employer/audit-reports — the audit reports filed about the session's
 * company. Scoped server-side: an establishment sees the reports about itself and
 * nothing else.
 */
import { requireEmployerApi } from '@/lib/auth/api-guards';
import { handleRouteError, ok, parseSearchParams } from '@/lib/utils/api-response';
import { listReports } from '@/services/audit-report.service';
import { reportListQuerySchema } from '@/lib/validations/audit-report.validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const user = await requireEmployerApi(['audit_report.read']);
    const employerId = Number(user.employerId ?? 0);
    const params = Object.fromEntries(parseSearchParams(request).entries());
    const filters = reportListQuerySchema.parse({ ...params, employer_id: employerId });

    const { data, pagination } = await listReports({ ...filters, employerId });
    return ok(data, { pagination });
  } catch (error) {
    return handleRouteError(error, { route: '/api/employer/audit-reports', method: 'GET' });
  }
}
