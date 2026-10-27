import { requireAdminApi } from '@/lib/auth/api-guards';
import { updateUnit, deleteUnit } from '@/services/employer.service';
import { clientIp, fail, handleRouteError, notFound, ok } from '@/lib/utils/api-response';

export const runtime = 'nodejs';

type Params = { params: Promise<{ unitId: string }> };

/** PUT /api/admin/units/:unitId */
export async function PUT(request: Request, { params }: Params) {
  const body = await request.json().catch(() => ({}));
  try {
    const user = await requireAdminApi(['company_unit.update']);
    const { unitId } = await params;
    const result = await updateUnit(Number(unitId), body, { user, ip: clientIp(request) });
    if (!result) return notFound('Unit');
    return ok(result, { message: 'Unit updated successfully' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/units/:id', method: 'PUT', body });
  }
}

/** DELETE /api/admin/units/:unitId — soft delete. */
export async function DELETE(request: Request, { params }: Params) {
  try {
    const user = await requireAdminApi(['company_unit.delete']);
    const { unitId } = await params;
    const id = Number(unitId);
    if (!Number.isInteger(id) || id <= 0) return fail('Invalid unit id', 400);

    const result = await deleteUnit(id, { user, ip: clientIp(request) });
    if (!result) return notFound('Unit');
    return ok(result, { message: 'Unit removed successfully' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/units/:id', method: 'DELETE' });
  }
}
