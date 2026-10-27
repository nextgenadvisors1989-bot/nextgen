/**
 * GET /api/employer/audits — the audits scheduled against the session's company,
 * with the establishment's own statistics. The employer id is forced from the
 * session, so the register can never show another company's calendar.
 */
import { requireEmployerApi } from '@/lib/auth/api-guards';
import { handleRouteError, ok, parseSearchParams } from '@/lib/utils/api-response';
import { assignmentStats, listAssignments } from '@/services/audit-assignment.service';
import { assignmentListQuerySchema } from '@/lib/validations/audit-assignment.validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const user = await requireEmployerApi(['audit_assignment.read']);
    const employerId = Number(user.employerId ?? 0);
    const params = Object.fromEntries(parseSearchParams(request).entries());
    const filters = assignmentListQuerySchema.parse({ ...params, employer_id: employerId });

    const { data, pagination } = await listAssignments({ ...filters, employerId });
    const stats = await assignmentStats(employerId);
    return ok(data, { pagination, extra: { stats } });
  } catch (error) {
    return handleRouteError(error, { route: '/api/employer/audits', method: 'GET' });
  }
}
