/**
 * GET  /api/employer/departments — the establishment's own departments.
 * POST /api/employer/departments — adds a department. A unit may only be one of
 *      the establishment's own; a foreign unit is refused by field name (422).
 */
import { requireEmployerApi } from '@/lib/auth/api-guards';
import { clientIp, created, handleRouteError, ok, parseSearchParams, userAgent } from '@/lib/utils/api-response';
import { createDepartment, listDepartments } from '@/services/employer.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const user = await requireEmployerApi(['department.read']);
    const params = parseSearchParams(request);
    const employerId = Number(user.employerId ?? 0);
    const unitId = params.get('unitId') ?? params.get('unit_id');
    const data = employerId
      ? await listDepartments(employerId, {
          search: params.get('search') || undefined,
          status: params.get('status') || undefined,
          unitId: unitId ? Number(unitId) : undefined,
        })
      : [];
    return ok(data, { extra: { stats: { total: data.length } } });
  } catch (error) {
    return handleRouteError(error, { route: '/api/employer/departments', method: 'GET' });
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  try {
    const user = await requireEmployerApi(['department.create']);
    const employerId = Number(user.employerId ?? 0);
    const result = await createDepartment(employerId, body, {
      user, ip: clientIp(request), userAgent: userAgent(request),
    });
    if (!result) return ok({ departmentId: null }, { message: 'No company file to add a department to' });
    return created({ departmentId: result.departmentId }, 'Department added successfully');
  } catch (error) {
    return handleRouteError(error, { route: '/api/employer/departments', method: 'POST', body });
  }
}
