import { requireAdminApi } from '@/lib/auth/api-guards';
import { getEmployeeDetail, updateEmployee, deleteEmployee } from '@/services/employee.service';
import { clientIp, fail, handleRouteError, notFound, ok, userAgent } from '@/lib/utils/api-response';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ employeeId: string }> };

function parseId(value: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** GET /api/admin/employees/:employeeId — master record + every child table + stats. */
export async function GET(request: Request, { params }: Params) {
  try {
    await requireAdminApi(['employee.read']);
    const { employeeId } = await params;
    const id = parseId(employeeId);
    if (!id) return fail('Invalid employee id', 400);

    const detail = await getEmployeeDetail(id);
    if (!detail) return notFound('Employee');
    return ok(detail);
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/employees/:id', method: 'GET' });
  }
}

/** PUT /api/admin/employees/:employeeId — partial update with audit-trail diffs. */
export async function PUT(request: Request, { params }: Params) {
  const body = await request.json().catch(() => ({}));
  try {
    const user = await requireAdminApi(['employee.update']);
    const { employeeId } = await params;
    const id = parseId(employeeId);
    if (!id) return fail('Invalid employee id', 400);

    const result = await updateEmployee(id, body, { user, ip: clientIp(request), userAgent: userAgent(request) });
    if (!result) return notFound('Employee');

    return ok({ employee: result.employee, changedFields: result.changedFields }, { message: 'Employee updated successfully' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/employees/:id', method: 'PUT', body });
  }
}

/**
 * DELETE /api/admin/employees/:employeeId
 * Soft delete; the linked self-service login is deactivated in the same step.
 */
export async function DELETE(request: Request, { params }: Params) {
  try {
    const user = await requireAdminApi(['employee.delete']);
    const { employeeId } = await params;
    const id = parseId(employeeId);
    if (!id) return fail('Invalid employee id', 400);

    const result = await deleteEmployee(id, { user, ip: clientIp(request) });
    if (!result) return notFound('Employee');

    return ok(result, {
      message: result.loginDisabled
        ? 'Employee archived and their self-service login deactivated'
        : 'Employee archived successfully',
    });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/employees/:id', method: 'DELETE' });
  }
}
