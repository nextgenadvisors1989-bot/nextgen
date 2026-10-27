/**
 * /api/admin/payroll/structures
 *
 * GET  — the salary structures on the platform: who is on what, which ones are
 *        live, and whether PF and ESI apply.
 * POST — sets a structure for an employee. The previous revision is closed the
 *        day before the new one starts, the revision number climbs, and the
 *        employee's contractual wage is updated in step.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, created, handleRouteError, ok, parseSearchParams, userAgent } from '@/lib/utils/api-response';
import { salaryStructureListQuerySchema } from '@/lib/validations/payroll.validation';
import { createStructure, listStructures } from '@/services/payroll.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireAdminApi(['salary_structure.read']);
    const filters = salaryStructureListQuerySchema.parse(Object.fromEntries(parseSearchParams(request)));
    const result = await listStructures({
      page: filters.page,
      limit: filters.limit,
      search: filters.search ?? null,
      sortBy: filters.sortBy ?? null,
      sortDir: filters.sortDir ?? null,
      employerId: typeof filters.employer_id === 'number' ? filters.employer_id : null,
      unitId: typeof filters.unit_id === 'number' ? filters.unit_id : null,
      departmentId: typeof filters.department_id === 'number' ? filters.department_id : null,
      live: filters.live,
      pf: filters.pf,
      esi: filters.esi,
      fromDate: filters.from_date || null,
      toDate: filters.to_date || null,
    });
    return ok(result.data, { pagination: result.pagination, extra: { stats: result.stats } });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/payroll/structures', method: 'GET' });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAdminApi(['salary_structure.create']);
    const result = await createStructure(await request.json(), {
      user, ip: clientIp(request), userAgent: userAgent(request),
    });
    return created(result, `Salary structure revision ${result.revision_number} set for ${result.employee_name}`);
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/payroll/structures', method: 'POST' });
  }
}
