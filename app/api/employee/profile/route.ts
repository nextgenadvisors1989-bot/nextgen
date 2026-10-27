/**
 * GET   /api/employee/profile — the signed-in employee's own record, its wage
 *       structure, its personal-file statistics and the checklist the
 *       establishment keeps about it.
 * PATCH /api/employee/profile — the employee's own correction.
 *
 * The employee id always comes from the session (`getScoping`), never from the
 * request: the panel is one person's file and there is no way to name another.
 */
import { requireEmployeeApi } from '@/lib/auth/api-guards';
import { getScoping } from '@/lib/auth/auth';
import { clientIp, fail, handleRouteError, ok, userAgent } from '@/lib/utils/api-response';
import { getMyProfile, updateMyProfile } from '@/services/employee.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await requireEmployeeApi(['employee.read']);
    const { employeeId } = await getScoping(user.id);
    if (!employeeId) return fail('No employee record is linked to this login', 404, { code: 'NOT_FOUND' });

    const profile = await getMyProfile(employeeId);
    if (!profile) return fail('Your employee record could not be found', 404, { code: 'NOT_FOUND' });

    return ok({
      employee: profile.employee,
      stats: profile.stats,
      salaryStructure: profile.salaryStructure,
      checklist: profile.checklist,
      collections: [],
    });
  } catch (error) {
    return handleRouteError(error, { route: '/api/employee/profile', method: 'GET' });
  }
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => ({}));
  try {
    const user = await requireEmployeeApi(['employee.update']);
    const { employeeId } = await getScoping(user.id);
    if (!employeeId) return fail('No employee record is linked to this login', 404, { code: 'NOT_FOUND' });

    const result = await updateMyProfile(employeeId, body, {
      user, ip: clientIp(request), userAgent: userAgent(request),
    });
    if (!result) return fail('Your employee record could not be found', 404, { code: 'NOT_FOUND' });

    return ok(
      { employee: result.employee, changedFields: result.changedFields },
      { message: result.changedFields.length ? 'Your details were updated' : 'Nothing to change' }
    );
  } catch (error) {
    return handleRouteError(error, { route: '/api/employee/profile', method: 'PATCH', body });
  }
}
