/**
 * GET /api/employee/service-record — the employee's own employment history: the
 * service periods on record, their qualifications and their previous experience.
 */
import { requireEmployeeApi } from '@/lib/auth/api-guards';
import { getScoping } from '@/lib/auth/auth';
import { fail, handleRouteError, ok } from '@/lib/utils/api-response';
import { getMyServiceRecord } from '@/services/employee.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await requireEmployeeApi(['employee.read']);
    const { employeeId } = await getScoping(user.id);
    if (!employeeId) return fail('No employee record is linked to this login', 404, { code: 'NOT_FOUND' });

    const record = await getMyServiceRecord(employeeId);
    if (!record) return fail('Your employee record could not be found', 404, { code: 'NOT_FOUND' });
    return ok(record);
  } catch (error) {
    return handleRouteError(error, { route: '/api/employee/service-record', method: 'GET' });
  }
}
