/**
 * GET/PATCH/PUT/DELETE /api/employer/employees/:employeeId — one of the
 * establishment's own employees.
 *
 * The record is fetched through `findEmployeeScoped`, so an employee of another
 * company is a 404 on read, on write and on delete alike. The portal-login block
 * is left out of the detail on purpose: a login's username and last sign-in are
 * platform account data, not employment data, and the establishment has no
 * business reading them.
 */
import { requireEmployerApi } from '@/lib/auth/api-guards';
import { clientIp, fail, handleRouteError, notFound, ok, userAgent } from '@/lib/utils/api-response';
import { deleteEmployee, getEmployeeDetail, updateEmployee } from '@/services/employee.service';
import * as repo from '@/repositories/employee.repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ employeeId: string }> };

function refuseEmployerField(value: unknown, employerId: number): void {
  if (value === undefined || value === null || value === '') return;
  if (Number(value) === employerId) return;
  throw Object.assign(new Error('Validation failed. Please correct the highlighted fields.'), {
    code: 'VALIDATION_FAILED',
    issues: [{ field: 'employer_id', message: 'An employee cannot be transferred between establishments from this screen' }],
  });
}

export async function GET(request: Request, { params }: Params) {
  try {
    const user = await requireEmployerApi(['employee.read']);
    const { employeeId } = await params;
    const id = Number(employeeId);
    if (!Number.isInteger(id) || id <= 0) return fail('Invalid employee id', 400);

    const scoped = await repo.findEmployeeScoped(id, Number(user.employerId ?? 0));
    if (!scoped) return notFound('Employee');

    const detail = await getEmployeeDetail(id, { includeLogin: false });
    if (!detail) return notFound('Employee');
    return ok(detail);
  } catch (error) {
    return handleRouteError(error, { route: '/api/employer/employees/:id', method: 'GET' });
  }
}

async function update(request: Request, paramsPromise: Params['params']) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const user = await requireEmployerApi(['employee.update']);
    const { employeeId } = await paramsPromise;
    const id = Number(employeeId);
    if (!Number.isInteger(id) || id <= 0) return fail('Invalid employee id', 400);

    const employerId = Number(user.employerId ?? 0);
    const scoped = await repo.findEmployeeScoped(id, employerId);
    if (!scoped) return notFound('Employee');
    refuseEmployerField(body.employer_id, employerId);

    const result = await updateEmployee(id, body, { user, ip: clientIp(request), userAgent: userAgent(request) });
    if (!result) return notFound('Employee');
    return ok({ employee: result.employee, changedFields: result.changedFields },
      { message: 'Employee updated successfully' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/employer/employees/:id', method: 'PATCH', body });
  }
}

export async function PATCH(request: Request, { params }: Params) {
  return update(request, params);
}

export async function PUT(request: Request, { params }: Params) {
  return update(request, params);
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const user = await requireEmployerApi(['employee.delete']);
    const { employeeId } = await params;
    const id = Number(employeeId);
    if (!Number.isInteger(id) || id <= 0) return fail('Invalid employee id', 400);

    const scoped = await repo.findEmployeeScoped(id, Number(user.employerId ?? 0));
    if (!scoped) return notFound('Employee');

    const result = await deleteEmployee(id, { user, ip: clientIp(request), userAgent: userAgent(request) });
    if (!result) return notFound('Employee');
    return ok(result, {
      message: result.loginDisabled
        ? 'Employee archived and their self-service login deactivated'
        : 'Employee archived successfully',
    });
  } catch (error) {
    return handleRouteError(error, { route: '/api/employer/employees/:id', method: 'DELETE' });
  }
}
