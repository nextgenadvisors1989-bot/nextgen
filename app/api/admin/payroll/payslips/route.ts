/**
 * GET /api/admin/payroll/payslips
 *
 * Every payslip on the platform, filterable by run, employee, company, unit,
 * month, payment status and whether it has been published — the register the
 * payroll officer reconciles and the employee queries about.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { handleRouteError, ok, parseSearchParams } from '@/lib/utils/api-response';
import { payslipListQuerySchema } from '@/lib/validations/payroll.validation';
import { listPayslips } from '@/services/payroll.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireAdminApi(['payslip.read']);
    const filters = payslipListQuerySchema.parse(Object.fromEntries(parseSearchParams(request)));
    const result = await listPayslips({
      page: filters.page,
      limit: filters.limit,
      search: filters.search ?? null,
      sortBy: filters.sortBy ?? null,
      sortDir: filters.sortDir ?? null,
      runId: filters.run_id ?? null,
      employeeId: filters.employee_id ?? null,
      employerId: typeof filters.employer_id === 'number' ? filters.employer_id : null,
      unitId: typeof filters.unit_id === 'number' ? filters.unit_id : null,
      departmentId: typeof filters.department_id === 'number' ? filters.department_id : null,
      month: typeof filters.month === 'number' ? filters.month : null,
      year: typeof filters.year === 'number' ? filters.year : null,
      paymentStatus: filters.payment_status,
      published: filters.published,
    });
    return ok(result.data, { pagination: result.pagination, extra: { stats: result.stats } });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/payroll/payslips', method: 'GET' });
  }
}
