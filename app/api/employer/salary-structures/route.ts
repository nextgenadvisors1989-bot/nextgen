/**
 * /api/employer/salary-structures
 *
 * GET  — this company's salary structures (who is on what, which revision is in
 *        force, whether PF and ESI apply).
 * POST — sets a structure for one of this company's employees. The employee is
 *        checked against the session's company before anything is written.
 */
import { requireEmployerApi } from '@/lib/auth/api-guards';
import { clientIp, created, handleRouteError, ok, parseSearchParams, userAgent } from '@/lib/utils/api-response';
import { salaryStructureListQuerySchema } from '@/lib/validations/payroll.validation';
import { createStructure, listStructures } from '@/services/payroll.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const user = await requireEmployerApi(['salary_structure.read']);
    const employerId = Number(user.employerId ?? 0);
    if (!employerId) return ok([], { pagination: { total: 0, page: 1, limit: 10, totalPages: 0, from: 0, to: 0 } });
    const filters = salaryStructureListQuerySchema.parse(Object.fromEntries(parseSearchParams(request)));
    const result = await listStructures({
      page: filters.page,
      limit: filters.limit,
      search: filters.search ?? null,
      sortBy: filters.sortBy ?? null,
      sortDir: filters.sortDir ?? null,
      employerId,
      scopeEmployerId: employerId,
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
    return handleRouteError(error, { route: '/api/employer/salary-structures', method: 'GET' });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireEmployerApi(['salary_structure.create']);
    const result = await createStructure(await request.json(), {
      user, ip: clientIp(request), userAgent: userAgent(request),
    }, { employerId: Number(user.employerId ?? 0) || null });
    return created(result, `Salary structure revision ${result.revision_number} set for ${result.employee_name}`);
  } catch (error) {
    return handleRouteError(error, { route: '/api/employer/salary-structures', method: 'POST' });
  }
}
