/**
 * GET /api/employer/attendance/sheet
 *
 * The month grid this company's attendance screen fills in: employees down the
 * side, days across the top, with what is already marked and the holidays.
 */
import { requireEmployerApi } from '@/lib/auth/api-guards';
import { handleRouteError, ok, parseSearchParams } from '@/lib/utils/api-response';
import { payrollWindowQuerySchema } from '@/lib/validations/payroll.validation';
import { attendanceSheet } from '@/services/payroll.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const user = await requireEmployerApi(['attendance.read']);
    const employerId = Number(user.employerId ?? 0);
    const window = payrollWindowQuerySchema.parse(Object.fromEntries(parseSearchParams(request)));
    if (!employerId) {
      return ok({ year: window.year, month: window.month, days: 0, holidays: [], employees: [] });
    }
    const unitId = typeof window.unit_id === 'number' ? window.unit_id : null;
    const sheet = await attendanceSheet(employerId, window.year, window.month, unitId, null);
    return ok(sheet);
  } catch (error) {
    return handleRouteError(error, { route: '/api/employer/attendance/sheet', method: 'GET' });
  }
}
