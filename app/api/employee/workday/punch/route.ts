/**
 * POST /api/employee/workday/punch  { action: "in" | "out" }
 *
 * Check in or out for today. This writes only the signed-in employee's own attendance row for today (source "Self"); the employer's
 * own attendance entry for that day, if any, is never overwritten with a different status.
 */
import { z } from 'zod';
import { requireEmployeeApi } from '@/lib/auth/api-guards';
import { handleRouteError, ok, validationFailed } from '@/lib/utils/api-response';
import { punch } from '@/services/employee-workday.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({ action: z.enum(['in', 'out']) });

export async function POST(request: Request) {
  try {
    const user = await requireEmployeeApi(['attendance.read']);
    const employeeId = Number(user.employeeId ?? 0);
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return validationFailed([{ field: 'action', message: 'Choose check in or check out' }]);
    if (!employeeId) return validationFailed([{ field: 'action', message: 'Your login is not linked to an employee record' }]);
    const result = await punch(employeeId, parsed.data.action);
    return ok({ data: result }, { message: parsed.data.action === 'in' ? 'Checked in' : 'Checked out' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/employee/workday/punch', method: 'POST' });
  }
}
