/**
 * GET /api/employee/attendance
 *
 * The employee's own attendance for a month, with the tallies the screen shows
 * underneath (present, absent, leave, holiday, weekly off, overtime) — the same
 * tallies payroll uses to compute the payslip.
 */
import { requireEmployeeApi } from '@/lib/auth/api-guards';
import { handleRouteError, ok, parseSearchParams } from '@/lib/utils/api-response';
import { payrollWindowQuerySchema } from '@/lib/validations/payroll.validation';
import { listAttendance } from '@/services/payroll.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const user = await requireEmployeeApi(['attendance.read']);
    const employeeId = Number(user.employeeId ?? 0);
    if (!employeeId) {
      return ok([], { pagination: { total: 0, page: 1, limit: 31, totalPages: 0, from: 0, to: 0 }, extra: { stats: null } });
    }
    const window = payrollWindowQuerySchema.parse(Object.fromEntries(parseSearchParams(request)));
    const result = await listAttendance({
      page: 1,
      limit: 31,
      employeeId,
      scopeEmployeeId: employeeId,
      month: window.month,
      year: window.year,
      sortBy: 'attendance_date',
      sortDir: 'asc',
    });
    return ok(result.data, {
      pagination: result.pagination,
      extra: { stats: result.stats, month: window.month, year: window.year },
    });
  } catch (error) {
    return handleRouteError(error, { route: '/api/employee/attendance', method: 'GET' });
  }
}
