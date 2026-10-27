/**
 * /api/admin/payroll
 *
 * GET  — the payroll run register across every employer: filters, sorting,
 *        pagination and the counters the monitoring screen renders.
 * POST — creates a run for one company, unit or department for a month. A second
 *        run for the same scope and month is refused by the unique key and
 *        reported as a duplicate rather than a crash.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, created, handleRouteError, ok, parseSearchParams, userAgent } from '@/lib/utils/api-response';
import { payrollRunListQuerySchema } from '@/lib/validations/payroll.validation';
import { createRun, listRuns } from '@/services/payroll.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireAdminApi(['payroll.read']);
    const filters = payrollRunListQuerySchema.parse(Object.fromEntries(parseSearchParams(request)));
    const result = await listRuns({
      page: filters.page,
      limit: filters.limit,
      search: filters.search ?? null,
      sortBy: filters.sortBy ?? null,
      sortDir: filters.sortDir ?? null,
      status: filters.status,
      employerId: typeof filters.employer_id === 'number' ? filters.employer_id : null,
      unitId: typeof filters.unit_id === 'number' ? filters.unit_id : null,
      month: typeof filters.month === 'number' ? filters.month : null,
      year: typeof filters.year === 'number' ? filters.year : null,
      fromDate: filters.from_date || null,
      toDate: filters.to_date || null,
    });
    return ok(result.data, {
      pagination: result.pagination,
      extra: { stats: result.stats },
    });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/payroll', method: 'GET' });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAdminApi(['payroll.create']);
    const result = await createRun(await request.json(), {
      user, ip: clientIp(request), userAgent: userAgent(request),
    });
    return created(result, `Payroll run ${result.run_number} created for ${result.month_label}`);
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/payroll', method: 'POST' });
  }
}
