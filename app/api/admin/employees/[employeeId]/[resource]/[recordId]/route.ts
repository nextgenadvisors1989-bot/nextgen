import { requireAdminApi } from '@/lib/auth/api-guards';
import { updateEmployeeRecord, deleteEmployeeRecord, resourceDefinition, type EmployeeResource } from '@/services/employee.service';
import { clientIp, fail, handleRouteError, notFound, ok } from '@/lib/utils/api-response';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ employeeId: string; resource: string; recordId: string }> };

/** PUT /api/admin/employees/:employeeId/:resource/:recordId */
export async function PUT(request: Request, { params }: Params) {
  const body = await request.json().catch(() => ({}));
  try {
    const user = await requireAdminApi(['employee.update']);
    const { employeeId, resource, recordId } = await params;
    const definition = resourceDefinition(resource);
    if (!definition) return fail(`Unknown employee resource "${resource}"`, 404, { code: 'UNKNOWN_RESOURCE' });

    const result = await updateEmployeeRecord(
      Number(employeeId), resource as EmployeeResource, Number(recordId), body,
      { user, ip: clientIp(request) }
    );
    if (!result) return notFound('Employee');
    if (!result.updated) return notFound(definition.label);

    return ok(result, { message: `${definition.label} updated successfully` });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/employees/:id/:resource/:recordId', method: 'PUT', body });
  }
}

/** DELETE /api/admin/employees/:employeeId/:resource/:recordId — soft delete. */
export async function DELETE(request: Request, { params }: Params) {
  try {
    const user = await requireAdminApi(['employee.update']);
    const { employeeId, resource, recordId } = await params;
    const definition = resourceDefinition(resource);
    if (!definition) return fail(`Unknown employee resource "${resource}"`, 404, { code: 'UNKNOWN_RESOURCE' });

    const result = await deleteEmployeeRecord(
      Number(employeeId), resource as EmployeeResource, Number(recordId),
      { user, ip: clientIp(request) }
    );
    if (!result) return notFound('Employee');
    if (!result.deleted) return notFound(definition.label);

    return ok(result, { message: `${definition.label} removed successfully` });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/employees/:id/:resource/:recordId', method: 'DELETE' });
  }
}
