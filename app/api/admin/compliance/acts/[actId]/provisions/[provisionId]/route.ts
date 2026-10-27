/**
 * PUT    /api/admin/compliance/acts/[actId]/provisions/[provisionId] — edits a provision (fields, parent, amendments)
 * DELETE /api/admin/compliance/acts/[actId]/provisions/[provisionId] — removes it and everything under it
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { handleRouteError, notFound, ok } from '@/lib/utils/api-response';
import { deleteProvision, updateProvision } from '@/services/act-provision.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ actId: string; provisionId: string }> };

async function keys(params: Context['params']) {
  const { actId, provisionId } = await params;
  const a = Number(actId), p = Number(provisionId);
  return Number.isInteger(a) && a > 0 && Number.isInteger(p) && p > 0 ? { a, p } : null;
}

export async function PUT(request: Request, { params }: Context) {
  const k = await keys(params);
  if (!k) return notFound('Provision');
  try {
    await requireAdminApi(['compliance_act.update']);
    return ok({ data: await updateProvision(k.a, k.p, await request.json().catch(() => ({}))) }, { message: 'Saved' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/compliance/acts/[actId]/provisions/[provisionId]', method: 'PUT' });
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  const k = await keys(params);
  if (!k) return notFound('Provision');
  try {
    await requireAdminApi(['compliance_act.update']);
    return ok({ data: await deleteProvision(k.a, k.p) }, { message: 'Removed' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/compliance/acts/[actId]/provisions/[provisionId]', method: 'DELETE' });
  }
}
