/**
 * /api/employee/calendar — an employee's own calendar.
 *
 * Holidays and the employee's own approved leave. Employees do not see company
 * events, other people's leave, payroll or the compliance register: the scope
 * carries their employee id and the repository drops everything else.
 */
import { requireEmployeeApi } from '@/lib/auth/api-guards';
import { handleRouteError, ok, parseSearchParams } from '@/lib/utils/api-response';
import { agenda } from '@/services/calendar.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const user = await requireEmployeeApi(['calendar.read']);
    const params = parseSearchParams(request);
    const result = await agenda(Object.fromEntries(params), {
      employerId: user.employerId ?? null,
      employeeId: user.employeeId ?? null,
      panel: 'employee',
      includeExpiries: false,
      includePayroll: false,
      includeHolidays: true,
      includeLeave: true,
    });
    return ok(result.entries, { extra: { from: result.from, to: result.to, counts: result.counts, days: result.days } });
  } catch (error) {
    return handleRouteError(error, { route: '/api/employee/calendar', method: 'GET' });
  }
}
