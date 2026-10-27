/**
 * POST /api/admin/audit-assignments/bulk
 * Creates the same audit against several employer units in one action — the
 * "start this year's safety audit cycle for all my units" flow.
 *
 * Body: { template: { …assignment fields… }, targets: [{ employer_id, unit_id, department_id }] }
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, created, handleRouteError, userAgent } from '@/lib/utils/api-response';
import { createBulkAssignments } from '@/services/audit-assignment.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let userId: number | undefined;
  let body: unknown;
  try {
    const user = await requireAdminApi(['audit_assignment.create']);
    userId = user.id;
    body = await request.json();

    const input = body as { template: Record<string, unknown>; targets: { employer_id: number; unit_id?: number | null; department_id?: number | null }[] };
    const result = await createBulkAssignments(input, { user, ip: clientIp(request), userAgent: userAgent(request) });

    return created(
      { created: result.created, warnings: result.warnings },
      `${result.created.length} assignment(s) created successfully`
    );
  } catch (error) {
    return handleRouteError(error, {
      route: '/api/admin/audit-assignments/bulk', method: 'POST', body, userId, ip: clientIp(request) ?? undefined,
    });
  }
}
