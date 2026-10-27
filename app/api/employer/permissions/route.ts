/** GET /api/employer/permissions?status=Pending - the permission requests of this company's employees (pending first). */
import { requireEmployerApi } from '@/lib/auth/api-guards';
import { handleRouteError, ok } from '@/lib/utils/api-response';
import { listPermissions } from '@/services/employee-workday.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const user = await requireEmployerApi(['attendance.read']);
    const status = new URL(request.url).searchParams.get('status');
    const allowed = ['Pending', 'Approved', 'Rejected', 'Cancelled'];
    const rows = await listPermissions(Number(user.employerId ?? 0), status && allowed.includes(status) ? status : null);
    return ok(rows);
  } catch (error) {
    return handleRouteError(error, { route: '/api/employer/permissions', method: 'GET' });
  }
}
