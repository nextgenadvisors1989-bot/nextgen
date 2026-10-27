import { requireAdminApi } from '@/lib/auth/api-guards';
import { updateDepartment, deleteDepartment } from '@/services/employer.service';
import { clientIp, fail, handleRouteError, notFound, ok } from '@/lib/utils/api-response';

export const runtime = 'nodejs';

type Params = { params: Promise<{ departmentId: string }> };

/** PUT /api/admin/departments/:departmentId */
export async function PUT(request: Request, { params }: Params) {
  const body = await request.json().catch(() => ({}));
  try {
    const user = await requireAdminApi(['department.update']);
    const { departmentId } = await params;
    const result = await updateDepartment(Number(departmentId), body, { user, ip: clientIp(request) });
    if (!result) return notFound('Department');
    return ok(result, { message: 'Department updated successfully' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/departments/:id', method: 'PUT', body });
  }
}

/** DELETE /api/admin/departments/:departmentId — blocked while employees are assigned. */
export async function DELETE(request: Request, { params }: Params) {
  try {
    const user = await requireAdminApi(['department.delete']);
    const { departmentId } = await params;
    const id = Number(departmentId);
    if (!Number.isInteger(id) || id <= 0) return fail('Invalid department id', 400);

    const result = await deleteDepartment(id, { user, ip: clientIp(request) });
    if (!result) return notFound('Department');
    if (result.blocked) {
      return fail(
        `This department still has ${result.employeeCount} employee(s). Reassign them before deleting.`,
        409,
        { code: 'HAS_EMPLOYEES' }
      );
    }
    return ok(result, { message: 'Department removed successfully' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/departments/:id', method: 'DELETE' });
  }
}
