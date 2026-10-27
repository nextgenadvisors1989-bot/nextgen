/**
 * GET  /api/employer/employees — the establishment's own staff register.
 * POST /api/employer/employees — hires into the session's company.
 *
 * The employer id never comes from the body: an establishment can only ever read
 * or write its own register, and a request that tries to name a different
 * employer is refused by field name (422) rather than quietly redirected — a form
 * that thinks it moved staff between companies should say so out loud.
 */
import { requireEmployerApi } from '@/lib/auth/api-guards';
import { clientIp, created, handleRouteError, ok, parseSearchParams, userAgent } from '@/lib/utils/api-response';
import { createEmployee, listEmployees } from '@/services/employee.service';
import { employeeListQuerySchema } from '@/lib/validations/employee.validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function refuseEmployerField(value: unknown, employerId: number): void {
  if (value === undefined || value === null || value === '') return;
  if (Number(value) === employerId) return;
  throw Object.assign(new Error('Validation failed. Please correct the highlighted fields.'), {
    code: 'VALIDATION_FAILED',
    issues: [{ field: 'employer_id', message: 'Employees are always hired into your own establishment' }],
  });
}

export async function GET(request: Request) {
  try {
    const user = await requireEmployerApi(['employee.read']);
    const employerId = Number(user.employerId ?? 0);
    const filters = employeeListQuerySchema.parse(Object.fromEntries(parseSearchParams(request).entries()));
    const { data, pagination } = await listEmployees({ ...filters, employerId });
    return ok(data, { pagination });
  } catch (error) {
    return handleRouteError(error, { route: '/api/employer/employees', method: 'GET' });
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const user = await requireEmployerApi(['employee.create']);
    const employerId = Number(user.employerId ?? 0);
    refuseEmployerField(body.employer_id, employerId);

    const result = await createEmployee(
      { ...body, employer_id: employerId },
      { user, ip: clientIp(request), userAgent: userAgent(request) }
    );
    return created(result, `Employee ${result.employeeNumber} registered successfully`);
  } catch (error) {
    return handleRouteError(error, { route: '/api/employer/employees', method: 'POST', body });
  }
}
