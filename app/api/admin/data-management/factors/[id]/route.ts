/** /api/admin/data-management/factors/[id] — PUT edits a factor (set status approved to start using it), DELETE removes it. */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, notFound, ok, userAgent } from '@/lib/utils/api-response';
import { deleteFactor, saveFactor } from '@/services/data-management.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return notFound('Factor');
  try {
    const user = await requireAdminApi(['data_management.update']);
    const body = ((await request.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
    return ok(await saveFactor({ user, ip: clientIp(request), userAgent: userAgent(request) }, id, body), { message: 'Emission factor saved' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/data-management/factors/[id]', method: 'PUT' });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return notFound('Factor');
  try {
    const user = await requireAdminApi(['data_management.update']);
    await deleteFactor({ user, ip: clientIp(request), userAgent: userAgent(request) }, id);
    return ok({ id }, { message: 'Emission factor removed' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/data-management/factors/[id]', method: 'DELETE' });
  }
}
