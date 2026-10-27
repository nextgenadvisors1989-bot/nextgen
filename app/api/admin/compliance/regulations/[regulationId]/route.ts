/**
 * GET /api/admin/compliance/regulations/[regulationId]
 * PUT /api/admin/compliance/regulations/[regulationId]
 * DELETE /api/admin/compliance/regulations/[regulationId]
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, notFound, ok, userAgent } from '@/lib/utils/api-response';
import { deleteRegulation, getRegulationDetail, updateRegulation } from '@/services/compliance.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function regulationKey(params: Promise<{ regulationId: string }>) {
  const { regulationId } = await params;
  const id = Number(regulationId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ regulationId: string }> }) {
  const id = await regulationKey(params);
  if (!id) return notFound('Regulation');
  try {
    await requireAdminApi(['compliance_regulation.read']);
    return ok(await getRegulationDetail(id));
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/compliance/regulations/[regulationId]', method: 'GET' });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ regulationId: string }> }) {
  const id = await regulationKey(params);
  if (!id) return notFound('Regulation');
  try {
    const user = await requireAdminApi(['compliance_regulation.update']);
    const result = await updateRegulation(id, await request.json(), { user, ip: clientIp(request), userAgent: userAgent(request) });
    return ok(result, { message: 'Regulation updated' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/compliance/regulations/[regulationId]', method: 'PUT' });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ regulationId: string }> }) {
  const id = await regulationKey(params);
  if (!id) return notFound('Regulation');
  try {
    const user = await requireAdminApi(['compliance_regulation.delete']);
    const result = await deleteRegulation(id, { user, ip: clientIp(request), userAgent: userAgent(request) });
    return ok(result, { message: 'Regulation removed' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/compliance/regulations/[regulationId]', method: 'DELETE' });
  }
}
