import { requireAdminApi } from '@/lib/auth/api-guards';
import { listUnits, createUnit } from '@/services/employer.service';
import { clientIp, created, handleRouteError, notFound, ok, parseSearchParams } from '@/lib/utils/api-response';

export const runtime = 'nodejs';

type Params = { params: Promise<{ employerId: string }> };

/** GET /api/admin/employers/:employerId/units */
export async function GET(request: Request, { params }: Params) {
  try {
    await requireAdminApi(['company_unit.read']);
    const { employerId } = await params;
    const search = parseSearchParams(request);
    const units = await listUnits(Number(employerId), {
      search: search.get('search') ?? undefined,
      status: search.get('status') ?? undefined,
    });
    return ok(units);
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/employers/:id/units', method: 'GET' });
  }
}

/** POST /api/admin/employers/:employerId/units */
export async function POST(request: Request, { params }: Params) {
  const body = await request.json().catch(() => ({}));
  try {
    const user = await requireAdminApi(['company_unit.create']);
    const { employerId } = await params;
    const result = await createUnit(Number(employerId), body, { user, ip: clientIp(request) });
    if (!result) return notFound('Employer');
    return created(result, 'Unit created successfully');
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/employers/:id/units', method: 'POST', body });
  }
}
