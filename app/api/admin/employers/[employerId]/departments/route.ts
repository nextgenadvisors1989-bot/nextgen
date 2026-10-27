import { requireAdminApi } from '@/lib/auth/api-guards';
import { listDepartments, createDepartment } from '@/services/employer.service';
import { clientIp, created, handleRouteError, notFound, ok, parseSearchParams } from '@/lib/utils/api-response';

export const runtime = 'nodejs';

type Params = { params: Promise<{ employerId: string }> };

/** GET /api/admin/employers/:employerId/departments */
export async function GET(request: Request, { params }: Params) {
  try {
    await requireAdminApi(['department.read']);
    const { employerId } = await params;
    const search = parseSearchParams(request);
    const unitId = search.get('unitId');
    const departments = await listDepartments(Number(employerId), {
      search: search.get('search') ?? undefined,
      status: search.get('status') ?? undefined,
      unitId: unitId ? Number(unitId) : undefined,
    });
    return ok(departments);
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/employers/:id/departments', method: 'GET' });
  }
}

/** POST /api/admin/employers/:employerId/departments */
export async function POST(request: Request, { params }: Params) {
  const body = await request.json().catch(() => ({}));
  try {
    const user = await requireAdminApi(['department.create']);
    const { employerId } = await params;
    const result = await createDepartment(Number(employerId), body, { user, ip: clientIp(request) });
    if (!result) return notFound('Employer');
    return created(result, 'Department created successfully');
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/employers/:id/departments', method: 'POST', body });
  }
}
