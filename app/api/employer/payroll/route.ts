/**
 * /api/employer/payroll
 *
 * GET  — this company's payroll runs, filterable by month, year and status.
 * POST — creates a run for this company. The employer id always comes from the
 *        session, so an employer can only ever create payroll for itself.
 */
import { requireEmployerApi } from '@/lib/auth/api-guards';
import { clientIp, created, handleRouteError, ok, parseSearchParams, userAgent } from '@/lib/utils/api-response';
import { payrollRunListQuerySchema } from '@/lib/validations/payroll.validation';
import { createRun, listRuns } from '@/services/payroll.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const user = await requireEmployerApi(['payroll.read']);
    const filters = payrollRunListQuerySchema.parse(Object.fromEntries(parseSearchParams(request)));
    const employerId = Number(user.employerId ?? 0);
    if (!employerId) return ok([], { pagination: { total: 0, page: 1, limit: 10, totalPages: 0, from: 0, to: 0 } });
    const result = await listRuns({
      page: filters.page,
      limit: filters.limit,
      search: filters.search ?? null,
      sortBy: filters.sortBy ?? null,
      sortDir: filters.sortDir ?? null,
      status: filters.status,
      employerId,
      scopeEmployerId: employerId,
      unitId: typeof filters.unit_id === 'number' ? filters.unit_id : null,
      month: typeof filters.month === 'number' ? filters.month : null,
      year: typeof filters.year === 'number' ? filters.year : null,
      fromDate: filters.from_date || null,
      toDate: filters.to_date || null,
    });
    return ok(result.data, { pagination: result.pagination, extra: { stats: result.stats } });
  } catch (error) {
    return handleRouteError(error, { route: '/api/employer/payroll', method: 'GET' });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireEmployerApi(['payroll.create']);
    const employerId = Number(user.employerId ?? 0);
    const body = (await request.json()) as Record<string, unknown>;
    const result = await createRun({ ...body, employer_id: employerId }, {
      user, ip: clientIp(request), userAgent: userAgent(request),
    });
    return created(result, `Payroll run ${result.run_number} created for ${result.month_label}`);
  } catch (error) {
    return handleRouteError(error, { route: '/api/employer/payroll', method: 'POST' });
  }
}
