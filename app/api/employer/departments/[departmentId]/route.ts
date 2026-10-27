/**
 * GET/PATCH/DELETE /api/employer/departments/:departmentId — one of the
 * establishment's own departments. A department belonging to another company is a
 * 404; one that still carries staff cannot be removed (409).
 */
import { requireEmployerApi } from '@/lib/auth/api-guards';
import { clientIp, fail, handleRouteError, notFound, ok, userAgent } from '@/lib/utils/api-response';
import { deleteDepartment, updateDepartment } from '@/services/employer.service';
import * as repo from '@/repositories/employer.repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ departmentId: string }> };

function parseId(value: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const user = await requireEmployerApi(['department.read']);
    const { departmentId } = await params;
    const id = parseId(departmentId);
    if (!id) return fail('Invalid department id', 400);

    const department = await repo.findDepartmentById(id, Number(user.employerId ?? 0));
    if (!department) return notFound('Department');
    return ok(department);
  } catch (error) {
    return handleRouteError(error, { route: '/api/employer/departments/:id', method: 'GET' });
  }
}

export async function PATCH(request: Request, { params }: Params) {
  const body = await request.json().catch(() => ({}));
  try {
    const user = await requireEmployerApi(['department.update']);
    const { departmentId } = await params;
    const id = parseId(departmentId);
    if (!id) return fail('Invalid department id', 400);

    const owned = await repo.findDepartmentById(id, Number(user.employerId ?? 0));
    if (!owned) return notFound('Department');

    const result = await updateDepartment(id, body, { user, ip: clientIp(request), userAgent: userAgent(request) });
    if (!result) return notFound('Department');
    return ok(result, { message: 'Department updated successfully' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/employer/departments/:id', method: 'PATCH', body });
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const user = await requireEmployerApi(['department.delete']);
    const { departmentId } = await params;
    const id = parseId(departmentId);
    if (!id) return fail('Invalid department id', 400);

    const owned = await repo.findDepartmentById(id, Number(user.employerId ?? 0));
    if (!owned) return notFound('Department');

    const result = await deleteDepartment(id, { user, ip: clientIp(request), userAgent: userAgent(request) });
    if (!result) return notFound('Department');
    if (result.blocked) {
      return fail(
        `This department still holds ${result.employeeCount} employee(s) — move them to another department first`,
        409,
        { code: 'IN_USE' }
      );
    }
    return ok(result, { message: 'Department removed successfully' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/employer/departments/:id', method: 'DELETE' });
  }
}
