/**
 * POST /api/admin/employees/[employeeId]/restore
 * Reopens an archived employee and re-activates their self-service login so a
 * mis-click never costs the HR team a record.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, notFound, ok } from '@/lib/utils/api-response';
import { restoreEmployee } from '@/services/employee.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ employeeId: string }> }) {
  const { employeeId } = await params;
  const id = Number(employeeId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Employee');

  try {
    const user = await requireAdminApi(['employee.update']);
    const result = await restoreEmployee(id, { user, ip: clientIp(request) });
    if (!result) return notFound('Employee');

    return ok(result, {
      message: result.alreadyActive
        ? 'Employee is already active'
        : result.loginReactivated
          ? 'Employee restored and their self-service login re-activated'
          : 'Employee restored successfully',
    });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/employees/[employeeId]/restore', method: 'POST' });
  }
}
