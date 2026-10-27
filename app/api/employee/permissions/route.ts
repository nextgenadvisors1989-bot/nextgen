/** POST /api/employee/permissions  { date, from, to, reason } - ask the employer for a short permission (up to 4 hours). */
import { z } from 'zod';
import { requireEmployeeApi } from '@/lib/auth/api-guards';
import { handleRouteError, ok, validationFailed } from '@/lib/utils/api-response';
import { requestPermission } from '@/services/employee-workday.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick the date'),
  from: z.string().regex(/^\d{2}:\d{2}$/, 'Pick the start time'),
  to: z.string().regex(/^\d{2}:\d{2}$/, 'Pick the end time'),
  reason: z.string().trim().min(3, 'Give a reason').max(500),
});

export async function POST(request: Request) {
  try {
    const user = await requireEmployeeApi(['attendance.read']);
    const employeeId = Number(user.employeeId ?? 0);
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return validationFailed(parsed.error.issues.map((issue) => ({ field: String(issue.path[0] ?? 'form'), message: issue.message })));
    if (!employeeId) return validationFailed([{ field: 'date', message: 'Your login is not linked to an employee record' }]);
    const result = await requestPermission(employeeId, parsed.data);
    return ok({ data: result }, { message: 'Permission request sent to your employer', status: 201 });
  } catch (error) {
    return handleRouteError(error, { route: '/api/employee/permissions', method: 'POST' });
  }
}
