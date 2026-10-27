/**
 * GET /api/admin/payroll/register
 *
 * The pay register for a month: one line per payslip with the head-wise totals
 * underneath — the reconciliation a payroll officer does against the bank
 * statement, and the return an inspector asks to see.
 *
 * `?download=csv` returns the same rows as a file.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { handleRouteError, ok, parseSearchParams } from '@/lib/utils/api-response';
import { payslipListQuerySchema } from '@/lib/validations/payroll.validation';
import { payRegister } from '@/services/payroll.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireAdminApi(['payroll.read']);
    const params = parseSearchParams(request);
    const raw = Object.fromEntries(params);
    // The register is exported whole, so a download clamps the page size to the
    // schema's ceiling and then asks the service for every row of the month.
    if (raw.limit) raw.limit = String(Math.min(Math.max(Number(raw.limit) || 10, 1), 100));
    const filters = payslipListQuerySchema.parse(raw);
    const register = await payRegister({
      page: filters.page,
      limit: params.get('download') === 'csv' ? 1000 : Math.min(filters.limit === 10 ? 500 : filters.limit, 1000),
      search: filters.search ?? null,
      sortBy: filters.sortBy ?? 'payslip_number',
      sortDir: filters.sortDir ?? 'asc',
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
      lines.push(['', '', '', 'TOTAL', '', '', register.totals.gross.toFixed(2), register.totals.pf.toFixed(2), register.totals.esi.toFixed(2),
        register.totals.pt.toFixed(2), register.totals.lwf.toFixed(2), register.totals.tds.toFixed(2),
        register.totals.deductions.toFixed(2), register.totals.net.toFixed(2), ''].join(','));
      return new Response(`${lines.join('\n')}\n`, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="pay-register.csv"`,
          'Cache-Control': 'private, no-store',
        },
      });
    }

    return ok(register.rows, { extra: { totals: register.totals, count: register.count } });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/payroll/register', method: 'GET' });
  }
}
