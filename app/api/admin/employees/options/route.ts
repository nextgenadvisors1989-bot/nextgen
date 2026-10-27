import { requireAdminApi } from '@/lib/auth/api-guards';
import { employeeOptions, employeeLookups } from '@/services/employee.service';
import { handleRouteError, ok, parseSearchParams } from '@/lib/utils/api-response';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/employees/options
 * `?search=` returns picker options; `?lookups=true` returns every dropdown the
 * onboarding wizard needs (employers, designations, checklist items, states).
 */
export async function GET(request: Request) {
  try {
    await requireAdminApi(['employee.read']);
    const params = parseSearchParams(request);
    const employerId = params.get('employerId');

    if (params.get('lookups') === 'true') {
      const lookups = await employeeLookups(employerId ? Number(employerId) : undefined);
      return ok(lookups);
    }

    const options = await employeeOptions(params.get('search') ?? undefined, employerId ? Number(employerId) : undefined);
    return ok(options);
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/employees/options', method: 'GET' });
  }
}
