/**
 * GET /api/admin/payroll/attendance/sheet
 *
 * The month grid the attendance screen fills in: a row per employee, a cell per
 * day, with what has already been marked and which days are holidays.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { handleRouteError, ok, parseSearchParams } from '@/lib/utils/api-response';
import { payrollWindowQuerySchema } from '@/lib/validations/payroll.validation';
import { attendanceSheet } from '@/services/payroll.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireAdminApi(['attendance.read']);
    const params = parseSearchParams(request);
    const window = payrollWindowQuerySchema.parse(Object.fromEntries(params));
    const employerId = typeof window.employer_id === 'number' ? window.employer_id : 0;
    if (!employerId) {
      return ok({ year: window.year, month: window.month, days: 0, holidays: [], employees: [] }, {
        message: 'Choose a company to open its attendance sheet',
      });
    }
    const unitId = typeof window.unit_id === 'number' ? window.unit_id : null;
    const sheet = await attendanceSheet(employerId, window.year, window.month, unitId, null);
    return ok(sheet);
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/payroll/attendance/sheet', method: 'GET' });
  }
}
