/**
 * /api/employer/leave/types
 *
 * GET  — the leave types this company offers, with their paid flag, yearly
 *        entitlement, document requirement and encashability.
 * POST — adds a leave type for this company.
 */
import { requireEmployerApi } from '@/lib/auth/api-guards';
import { clientIp, created, handleRouteError, ok, parseSearchParams, userAgent } from '@/lib/utils/api-response';
import { createLeaveType, listLeaveTypes } from '@/services/payroll.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const user = await requireEmployerApi(['leave.read']);
    const employerId = Number(parseSearchParams(request).get('employer_id')) || Number(user.employerId ?? 0) || null;
    const types = await listLeaveTypes(employerId);
    return ok(types);
  } catch (error) {
    return handleRouteError(error, { route: '/api/employer/leave/types', method: 'GET' });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireEmployerApi(['leave.create']);
    const employerId = Number(user.employerId ?? 0);
    const result = await createLeaveType(await request.json(), {
      user, ip: clientIp(request), userAgent: userAgent(request),
    }, employerId);
    return created(result, 'Leave type added');
  } catch (error) {
    return handleRouteError(error, { route: '/api/employer/leave/types', method: 'POST' });
  }
}
