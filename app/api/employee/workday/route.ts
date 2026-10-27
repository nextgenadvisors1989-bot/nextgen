/**
 * GET /api/employee/workday - the signed-in employee's own working-day summary (status, wage today / week / month, hours, deductions,
 * payslip, full and final, permissions). The employee id always comes from the session.
 */
import { requireEmployeeApi } from '@/lib/auth/api-guards';
import { handleRouteError, ok } from '@/lib/utils/api-response';
import { getWorkday } from '@/services/employee-workday.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await requireEmployeeApi(['attendance.read']);
    const employeeId = Number(user.employeeId ?? 0);
    if (!employeeId) return ok({ data: null });
    return ok({ data: await getWorkday(employeeId) });
  } catch (error) {
    return handleRouteError(error, { route: '/api/employee/workday', method: 'GET' });
  }
}
