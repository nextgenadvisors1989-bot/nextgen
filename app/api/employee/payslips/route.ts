/**
 * GET /api/employee/payslips
 *
 * The employee's own payslips — published ones only, because an unpublished
 * payslip is still being checked. The response carries the year's totals so the
 * screen can show what has been earned and deducted so far.
 */
import { requireEmployeeApi } from '@/lib/auth/api-guards';
import { handleRouteError, ok, parseSearchParams } from '@/lib/utils/api-response';
import { payslipListQuerySchema } from '@/lib/validations/payroll.validation';
import { listPayslips } from '@/services/payroll.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const user = await requireEmployeeApi(['payslip.read']);
    const employeeId = Number(user.employeeId ?? 0);
    if (!employeeId) {
      return ok([], { pagination: { total: 0, page: 1, limit: 10, totalPages: 0, from: 0, to: 0 }, extra: { stats: null } });
    }
    const filters = payslipListQuerySchema.parse(Object.fromEntries(parseSearchParams(request)));
    const result = await listPayslips({
      page: filters.page,
      limit: filters.limit,
      search: filters.search ?? null,
      sortBy: filters.sortBy ?? 'year',
      sortDir: filters.sortDir ?? 'desc',
      employeeId,
      scopeEmployeeId: employeeId,
      month: typeof filters.month === 'number' ? filters.month : null,
      year: typeof filters.year === 'number' ? filters.year : null,
      paymentStatus: filters.payment_status,
      published: 'yes',
    });
    const paid = result.data.filter((row) => String(row.payment_status) === 'Paid');
    return ok(result.data, {
      pagination: result.pagination,
      extra: {
        stats: {
          total: result.stats.total,
          yearToDate: result.stats.net,
          paidCount: paid.length,
        },
      },
    });
  } catch (error) {
    return handleRouteError(error, { route: '/api/employee/payslips', method: 'GET' });
  }
}
