/**
 * GET /api/employer/payroll/payslips
 *
 * This company's payslips — the history an employee queries about and the payroll
 * office reconciles. Scoped to the session's company.
 */
import { requireEmployerApi } from '@/lib/auth/api-guards';
import { handleRouteError, ok, parseSearchParams } from '@/lib/utils/api-response';
import { payslipListQuerySchema } from '@/lib/validations/payroll.validation';
import { listPayslips } from '@/services/payroll.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const user = await requireEmployerApi(['payslip.read']);
    const employerId = Number(user.employerId ?? 0);
    if (!employerId) return ok([], { pagination: { total: 0, page: 1, limit: 10, totalPages: 0, from: 0, to: 0 } });
    const filters = payslipListQuerySchema.parse(Object.fromEntries(parseSearchParams(request)));
    const result = await listPayslips({
      page: filters.page,
      limit: filters.limit,
      search: filters.search ?? null,
      sortBy: filters.sortBy ?? null,
      sortDir: filters.sortDir ?? null,
      runId: filters.run_id ?? null,
      employeeId: filters.employee_id ?? null,
      employerId,
      scopeEmployerId: employerId,
      unitId: typeof filters.unit_id === 'number' ? filters.unit_id : null,
      departmentId: typeof filters.department_id === 'number' ? filters.department_id : null,
      month: typeof filters.month === 'number' ? filters.month : null,
      year: typeof filters.year === 'number' ? filters.year : null,
      paymentStatus: filters.payment_status,
      published: filters.published,
    });
    return ok(result.data, { pagination: result.pagination, extra: { stats: result.stats } });
  } catch (error) {
    return handleRouteError(error, { route: '/api/employer/payroll/payslips', method: 'GET' });
  }
}
