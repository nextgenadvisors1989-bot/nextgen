/**
 * GET /api/admin/dynamic-modules/[moduleId]/assignments — which roles and users may use it
 * PUT /api/admin/dynamic-modules/[moduleId]/assignments — replace both lists
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, notFound, ok, userAgent } from '@/lib/utils/api-response';
import { assignModule, getModuleDetail } from '@/services/dynamic-module.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ moduleId: string }> }) {
  const { moduleId } = await params;
  const id = Number(moduleId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Module');
  try {
    await requireAdminApi(['module.read']);
    const detail = await getModuleDetail(id);
    return ok({ roleAssignments: detail.roleAssignments, userAssignments: detail.userAssignments });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/dynamic-modules/[moduleId]/assignments', method: 'GET' });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ moduleId: string }> }) {
  const { moduleId } = await params;
  const id = Number(moduleId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Module');
  try {
    const user = await requireAdminApi(['module.update']);
    const body = await request.json();
    const result = await assignModule(id, body, {
      id: user.id, name: user.fullName, role: user.primaryRole,
      ip: clientIp(request), userAgent: userAgent(request),
    });
    return ok(result, { message: 'Module access saved' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/dynamic-modules/[moduleId]/assignments', method: 'PUT' });
  }
}
