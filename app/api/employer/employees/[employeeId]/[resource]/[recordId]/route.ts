/**
 * PUT/PATCH/DELETE /api/employer/employees/:employeeId/:resource/:recordId — one
 * row of a child register of one of the establishment's own employees. Removals
 * are soft deletes, matching the platform's own register.
 */
import { requireEmployerApi } from '@/lib/auth/api-guards';
import { clientIp, fail, handleRouteError, notFound, ok } from '@/lib/utils/api-response';
import {
  deleteEmployeeRecord, resourceDefinition, updateEmployeeRecord, type EmployeeResource,
} from '@/services/employee.service';
import * as repo from '@/repositories/employee.repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ employeeId: string; resource: string; recordId: string }> };

async function ownEmployee(employeeId: string, employerId: number): Promise<number | null> {
  const id = Number(employeeId);
  if (!Number.isInteger(id) || id <= 0) return null;
  const scoped = await repo.findEmployeeScoped(id, employerId);
  return scoped ? id : null;
}

async function patch(request: Request, paramsPromise: Params['params']) {
  const body = await request.json().catch(() => ({}));
  try {
    const user = await requireEmployerApi(['employee.update']);
    const { employeeId, resource, recordId } = await paramsPromise;
    const definition = resourceDefinition(resource);
    if (!definition) return fail(`Unknown employee resource "${resource}"`, 404, { code: 'UNKNOWN_RESOURCE' });

    const id = await ownEmployee(employeeId, Number(user.employerId ?? 0));
    if (!id) return notFound('Employee');

    const result = await updateEmployeeRecord(id, resource as EmployeeResource, Number(recordId), body, {
      user, ip: clientIp(request),
    });
    if (!result) return notFound('Employee');
    if (!result.updated) return notFound(definition.label);
    return ok(result, { message: `${definition.label} updated successfully` });
  } catch (error) {
    return handleRouteError(error, { route: '/api/employer/employees/:id/:resource/:recordId', method: 'PUT', body });
  }
}

export async function PUT(request: Request, { params }: Params) {
  return patch(request, params);
}

export async function PATCH(request: Request, { params }: Params) {
  return patch(request, params);
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const user = await requireEmployerApi(['employee.update']);
    const { employeeId, resource, recordId } = await params;
    const definition = resourceDefinition(resource);
    if (!definition) return fail(`Unknown employee resource "${resource}"`, 404, { code: 'UNKNOWN_RESOURCE' });

    const id = await ownEmployee(employeeId, Number(user.employerId ?? 0));
    if (!id) return notFound('Employee');

    const result = await deleteEmployeeRecord(id, resource as EmployeeResource, Number(recordId), {
      user, ip: clientIp(request),
    });
    if (!result) return notFound('Employee');
    if (!result.deleted) return notFound(definition.label);
    return ok(result, { message: `${definition.label} removed successfully` });
  } catch (error) {
    return handleRouteError(error, { route: '/api/employer/employees/:id/:resource/:recordId', method: 'DELETE' });
  }
}
