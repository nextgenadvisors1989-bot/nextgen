import { requireAdminApi } from '@/lib/auth/api-guards';
import { listEmployees, createEmployee } from '@/services/employee.service';
import { employeeListQuerySchema } from '@/lib/validations/employee.validation';
import { clientIp, created, handleRouteError, ok, parseSearchParams, userAgent } from '@/lib/utils/api-response';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/employees
 * Query: page, limit, search, employerId, unitId, departmentId, status, category,
 *        designation, state, dateFrom, dateTo, sortBy, sortDir
 */
export async function GET(request: Request) {
  try {
    await requireAdminApi(['employee.read']);
    const filters = employeeListQuerySchema.parse(Object.fromEntries(parseSearchParams(request).entries()));
    const { data, pagination } = await listEmployees(filters);
    return ok(data, { pagination });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/employees', method: 'GET' });
  }
}

/**
 * POST /api/admin/employees
 * Registers an employee from the onboarding wizard. Optionally provisions a
 * self-service login and emails the temporary password.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  try {
    const user = await requireAdminApi(['employee.create']);
    const result = await createEmployee(body, { user, ip: clientIp(request), userAgent: userAgent(request) });
    return created(result, `Employee ${result.employeeNumber} registered successfully`);
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/employees', method: 'POST', body });
  }
}
