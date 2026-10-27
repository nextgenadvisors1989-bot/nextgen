/**
 * GET/POST /api/employer/employees/:employeeId/:resource — the child registers of
 * one of the establishment's own employees (qualifications, experience,
 * dependents, references, nominees, service records, documents, checklist).
 *
 * The employee is resolved through `findEmployeeScoped` before the collection is
 * touched, so another company's child register is a 404 rather than a leak.
 */
import { requireEmployerApi } from '@/lib/auth/api-guards';
import { clientIp, created, fail, handleRouteError, notFound, ok, userAgent } from '@/lib/utils/api-response';
import {
  addEmployeeRecord, loadEmployeeCollection, resourceDefinition, type EmployeeResource,
} from '@/services/employee.service';
import * as repo from '@/repositories/employee.repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ employeeId: string; resource: string }> };

async function ownEmployee(employeeId: string, employerId: number): Promise<number | null> {
  const id = Number(employeeId);
  if (!Number.isInteger(id) || id <= 0) return null;
  const scoped = await repo.findEmployeeScoped(id, employerId);
  return scoped ? id : null;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const user = await requireEmployerApi(['employee.read']);
    const { employeeId, resource } = await params;
    const definition = resourceDefinition(resource);
    if (!definition) return fail(`Unknown employee resource "${resource}"`, 404, { code: 'UNKNOWN_RESOURCE' });

    const id = await ownEmployee(employeeId, Number(user.employerId ?? 0));
    if (!id) return notFound('Employee');

    const data = await loadEmployeeCollection(resource as EmployeeResource, id);
    return ok(data);
  } catch (error) {
    return handleRouteError(error, { route: '/api/employer/employees/:id/:resource', method: 'GET' });
  }
}

export async function POST(request: Request, { params }: Params) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const user = await requireEmployerApi(['employee.update']);
    const { employeeId, resource } = await params;
    const definition = resourceDefinition(resource);
    if (!definition) return fail(`Unknown employee resource "${resource}"`, 404, { code: 'UNKNOWN_RESOURCE' });

    const id = await ownEmployee(employeeId, Number(user.employerId ?? 0));
    if (!id) return notFound('Employee');

    const result = await addEmployeeRecord(id, resource as EmployeeResource, body, {
      user, ip: clientIp(request), userAgent: userAgent(request),
    });
    if (!result) return notFound('Employee');

    if (resource === 'checklist') {
      return ok(result, {
        message: Boolean(body.is_checked) ? 'Checklist item marked as complete' : 'Checklist item marked as pending',
      });
    }
    return created(result, `${definition.label} added successfully`);
  } catch (error) {
    return handleRouteError(error, { route: '/api/employer/employees/:id/:resource', method: 'POST', body });
  }
}
