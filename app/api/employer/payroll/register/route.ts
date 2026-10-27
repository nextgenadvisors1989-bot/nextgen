/**
 * GET /api/employer/payroll/register
 *
 * This company's pay register for a month, with the head-wise totals; `?download=csv`
 * returns the same rows as a file for the bank or the auditor.
 */
import { requireEmployerApi } from '@/lib/auth/api-guards';
import { handleRouteError, ok, parseSearchParams } from '@/lib/utils/api-response';
import { payslipListQuerySchema } from '@/lib/validations/payroll.validation';
import { payRegister } from '@/services/payroll.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const user = await requireEmployerApi(['payroll.read']);
    const employerId = Number(user.employerId ?? 0);
    const params = parseSearchParams(request);
    const filters = payslipListQuerySchema.parse(Object.fromEntries(params));
    const register = await payRegister({
      page: 1,
      limit: Math.min(filters.limit === 10 ? 500 : filters.limit, 1000),
      search: filters.search ?? null,
      sortBy: 'payslip_number',
      sortDir: 'asc',
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

    if (params.get('download') === 'csv') {
      const header = ['Sl.No', 'Payslip No', 'Employee Code', 'Employee Name', 'Month', 'Paid Days', 'Gross', 'PF', 'ESI', 'PT', 'LWF', 'TDS', 'Deductions', 'Net Pay', 'Status'];
      const lines = [header.join(',')];
      register.rows.forEach((row, index) => {
        lines.push([
          index + 1, row.payslip_number, row.employee_number, `"${String(row.employee_name).replace(/"/g, '""')}"`,
          row.month_label, Number(row.paid_days ?? 0).toFixed(2), Number(row.gross_earnings).toFixed(2),
          Number(row.pf_employee).toFixed(2), Number(row.esi_employee).toFixed(2), Number(row.professional_tax).toFixed(2),
          Number(row.lwf_amount ?? 0).toFixed(2), Number(row.tds_amount ?? 0).toFixed(2),
          Number(row.total_deductions).toFixed(2), Number(row.net_pay).toFixed(2), String(row.payment_status ?? 'Pending'),
        ].join(','));
      });
      return new Response(`${lines.join('\n')}\n`, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="pay-register.csv"',
          'Cache-Control': 'private, no-store',
        },
      });
    }

    return ok(register.rows, { extra: { totals: register.totals, count: register.count } });
  } catch (error) {
    return handleRouteError(error, { route: '/api/employer/payroll/register', method: 'GET' });
  }
}
