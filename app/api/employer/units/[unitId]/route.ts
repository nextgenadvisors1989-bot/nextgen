/**
 * GET/PATCH/DELETE /api/employer/units/:unitId — one of the establishment's own
 * units. A unit belonging to another company reads as 404, not as a refusal, so
 * the register never confirms that somebody else's id exists.
 */
import { requireEmployerApi } from '@/lib/auth/api-guards';
import { clientIp, fail, handleRouteError, notFound, ok, userAgent } from '@/lib/utils/api-response';
import { deleteUnit, updateUnit } from '@/services/employer.service';
import * as repo from '@/repositories/employer.repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ unitId: string }> };

function parseId(value: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const user = await requireEmployerApi(['company_unit.read']);
    const { unitId } = await params;
    const id = parseId(unitId);
    if (!id) return fail('Invalid unit id', 400);

    const unit = await repo.findUnitById(id, Number(user.employerId ?? 0));
    if (!unit) return notFound('Unit');
    return ok(unit);
  } catch (error) {
    return handleRouteError(error, { route: '/api/employer/units/:id', method: 'GET' });
  }
}

export async function PATCH(request: Request, { params }: Params) {
  const body = await request.json().catch(() => ({}));
  try {
    const user = await requireEmployerApi(['company_unit.update']);
    const { unitId } = await params;
    const id = parseId(unitId);
    if (!id) return fail('Invalid unit id', 400);

    const owned = await repo.findUnitById(id, Number(user.employerId ?? 0));
    if (!owned) return notFound('Unit');

    const result = await updateUnit(id, body, { user, ip: clientIp(request), userAgent: userAgent(request) });
    if (!result) return notFound('Unit');
    return ok(result, { message: 'Unit updated successfully' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/employer/units/:id', method: 'PATCH', body });
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const user = await requireEmployerApi(['company_unit.delete']);
    const { unitId } = await params;
    const id = parseId(unitId);
    if (!id) return fail('Invalid unit id', 400);

    const owned = await repo.findUnitById(id, Number(user.employerId ?? 0));
    if (!owned) return notFound('Unit');

    const result = await deleteUnit(id, { user, ip: clientIp(request), userAgent: userAgent(request) });
    if (!result) return notFound('Unit');
    if (result.blocked) {
      return fail(
        `This unit still holds ${result.employeeCount} employee(s) — move them to another unit first`,
        409,
        { code: 'IN_USE' }
      );
    }
    return ok(result, { message: 'Unit removed successfully' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/employer/units/:id', method: 'DELETE' });
  }
}
