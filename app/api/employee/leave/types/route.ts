/**
 * GET /api/employee/leave/types
 *
 * The leave types this employee may apply for — the list the apply form shows,
 * with the paid flag, the yearly entitlement and whether a document is needed.
 */
import { requireEmployeeApi } from '@/lib/auth/api-guards';
import { handleRouteError, ok } from '@/lib/utils/api-response';
import { listLeaveTypes } from '@/services/payroll.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await requireEmployeeApi(['leave.read']);
    const types = await listLeaveTypes(user.employerId ?? null);
    return ok(types);
  } catch (error) {
    return handleRouteError(error, { route: '/api/employee/leave/types', method: 'GET' });
  }
}
