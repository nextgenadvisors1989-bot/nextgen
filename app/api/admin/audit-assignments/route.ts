/**
 * GET  /api/admin/audit-assignments — register with filters, sorting, pagination
 *      (search, status, type, priority, employer, unit, auditor, verifier,
 *      overdue-only and date window).
 * POST /api/admin/audit-assignments — creates the assignment: allocates
 *      `AUD/<year>/<000001>`, puts it on the calendar, and notifies the auditor,
 *      verifier, employer portal users and administrators.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, created, handleRouteError, ok, parseSearchParams, userAgent } from '@/lib/utils/api-response';
import { assignmentListQuerySchema } from '@/lib/validations/audit-assignment.validation';
import { assignmentStats, createAssignment, listAssignments } from '@/services/audit-assignment.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireAdminApi(['audit_assignment.read']);
    const filters = assignmentListQuerySchema.parse(parseSearchParams(request));
    const [result, stats] = await Promise.all([listAssignments(filters), assignmentStats()]);

    return ok(result.data, { pagination: result.pagination, extra: { stats } });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/audit-assignments', method: 'GET' });
  }
}

export async function POST(request: Request) {
  let userId: number | undefined;
  let body: unknown;
  try {
    const user = await requireAdminApi(['audit_assignment.create']);
    userId = user.id;
    body = await request.json();

    const result = await createAssignment(body, { user, ip: clientIp(request), userAgent: userAgent(request) });

    return created(
      {
        assignmentId: result.assignmentId,
        assignmentNumber: result.assignmentNumber,
        calendarEventId: result.calendarEventId,
        capacity: result.capacity,
        warnings: result.warnings,
      },
      `Assignment ${result.assignmentNumber} created successfully`
    );
  } catch (error) {
    return handleRouteError(error, {
      route: '/api/admin/audit-assignments', method: 'POST', body, userId, ip: clientIp(request) ?? undefined,
    });
  }
}
