/**
 * GET    /api/admin/compliance/acts/[actId] — the act with its rules, regulations,
 *                                              gazette notifications and employer documents
 * PUT    /api/admin/compliance/acts/[actId] — updates the act
 * DELETE /api/admin/compliance/acts/[actId] — removes it; refused while anything references it
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, notFound, ok, userAgent } from '@/lib/utils/api-response';
import { deleteAct, getActDetail, updateAct } from '@/services/compliance.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function actKey(params: Promise<{ actId: string }>) {
  const { actId } = await params;
  const id = Number(actId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ actId: string }> }) {
  const id = await actKey(params);
  if (!id) return notFound('Act');
  try {
    await requireAdminApi(['compliance_act.read']);
    return ok(await getActDetail(id));
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/compliance/acts/[actId]', method: 'GET' });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ actId: string }> }) {
  const id = await actKey(params);
  if (!id) return notFound('Act');
  try {
    const user = await requireAdminApi(['compliance_act.update']);
    const result = await updateAct(id, await request.json(), { user, ip: clientIp(request), userAgent: userAgent(request) });
    return ok(result, { message: 'Act updated' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/compliance/acts/[actId]', method: 'PUT' });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ actId: string }> }) {
  const id = await actKey(params);
  if (!id) return notFound('Act');
  try {
    const user = await requireAdminApi(['compliance_act.delete']);
    const result = await deleteAct(id, { user, ip: clientIp(request), userAgent: userAgent(request) });
    return ok(result, { message: 'Act removed from the register' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/compliance/acts/[actId]', method: 'DELETE' });
  }
}
