/**
 * GET    /api/admin/dynamic-modules/[moduleId] — module + its forms, assignments and counters
 * PUT    /api/admin/dynamic-modules/[moduleId] — update the module
 * DELETE /api/admin/dynamic-modules/[moduleId] — delete (refused once submissions exist)
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, notFound, ok, userAgent } from '@/lib/utils/api-response';
import { deleteModule, getModuleDetail, updateModule } from '@/services/dynamic-module.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ moduleId: string }> }) {
  const { moduleId } = await params;
  const id = Number(moduleId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Module');
  try {
    await requireAdminApi(['module.read']);
    return ok(await getModuleDetail(id));
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/dynamic-modules/[moduleId]', method: 'GET' });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ moduleId: string }> }) {
  const { moduleId } = await params;
  const id = Number(moduleId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Module');
  try {
    const user = await requireAdminApi(['module.update']);
    const body = await request.json();
    const result = await updateModule(id, body, {
      id: user.id, name: user.fullName, role: user.primaryRole,
      ip: clientIp(request), userAgent: userAgent(request),
    });
    return ok(result, { message: 'Module updated' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/dynamic-modules/[moduleId]', method: 'PUT' });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ moduleId: string }> }) {
  const { moduleId } = await params;
  const id = Number(moduleId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Module');
  try {
    const user = await requireAdminApi(['module.delete']);
    const result = await deleteModule(id, {
      id: user.id, name: user.fullName, role: user.primaryRole,
      ip: clientIp(request), userAgent: userAgent(request),
    });
    return ok(result, { message: 'Module deleted' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/dynamic-modules/[moduleId]', method: 'DELETE' });
  }
}
