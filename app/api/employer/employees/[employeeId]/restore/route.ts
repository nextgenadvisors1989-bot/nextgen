/** POST /api/employer/employees/:employeeId/restore — reverses an archive. */
import { requireEmployerApi } from '@/lib/auth/api-guards';
import { clientIp, fail, handleRouteError, notFound, ok, userAgent } from '@/lib/utils/api-response';
import { restoreEmployee } from '@/services/employee.service';
import { queryOne, type RowDataPacket } from '@/lib/db/mysql';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ employeeId: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const user = await requireEmployerApi(['employee.update']);
    const { employeeId } = await params;
    const id = Number(employeeId);
    if (!Number.isInteger(id) || id <= 0) return fail('Invalid employee id', 400);

    const archived = await queryOne<RowDataPacket>(
      'SELECT id FROM employees WHERE id = ? AND employer_id = ? AND deleted_at IS NOT NULL LIMIT 1',
      [id, Number(user.employerId ?? 0)]
    );
    if (!archived) return notFound('Employee');

    const result = await restoreEmployee(id, { user, ip: clientIp(request), userAgent: userAgent(request) });
    if (!result) return notFound('Employee');
    return ok(result, { message: 'Employee restored successfully' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/employer/employees/:id/restore', method: 'POST' });
  }
}
