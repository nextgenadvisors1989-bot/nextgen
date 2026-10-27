/**
 * POST /api/admin/dynamic-modules/[moduleId]/archive — retires a module that has
 * history (modules with no submissions can simply be deleted).
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, notFound, ok, userAgent } from '@/lib/utils/api-response';
import { archiveModule } from '@/services/dynamic-module.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ moduleId: string }> }) {
  const { moduleId } = await params;
  const id = Number(moduleId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Module');
  try {
    const user = await requireAdminApi(['module.update']);
    const result = await archiveModule(id, {
      id: user.id, name: user.fullName, role: user.primaryRole,
      ip: clientIp(request), userAgent: userAgent(request),
    });
    return ok(result, { message: 'Module archived' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/dynamic-modules/[moduleId]/archive', method: 'POST' });
  }
}
