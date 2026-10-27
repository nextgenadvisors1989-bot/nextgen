/**
 * GET /api/employee/leave/ledger
 *
 * The employee's own leave balance: opening, accrued, availed, encashed and what
 * is left, by leave type for the year. This is the figure the apply form checks.
 */
import { requireEmployeeApi } from '@/lib/auth/api-guards';
import { handleRouteError, ok, parseSearchParams } from '@/lib/utils/api-response';
import { leaveLedgerReport } from '@/services/payroll.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const user = await requireEmployeeApi(['leave.read']);
    const employeeId = Number(user.employeeId ?? 0);
    const params = parseSearchParams(request);
    const rows = await leaveLedgerReport({
      employeeId,
      scopeEmployeeId: employeeId || null,
      year: Number(params.get('year')) || null,
      limit: 50,
    });
    return ok(rows, {
      extra: {
        count: rows.length,
        closingTotal: rows.reduce((total, row) => total + row.closing_balance, 0),
      },
    });
  } catch (error) {
    return handleRouteError(error, { route: '/api/employee/leave/ledger', method: 'GET' });
  }
}
