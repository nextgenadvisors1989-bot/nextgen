/**
 * POST /api/admin/dynamic-modules/[moduleId]/clone — copies a module with its
 * forms (structure and all) and optionally its access assignments.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, created, handleRouteError, notFound, userAgent } from '@/lib/utils/api-response';
import { cloneModule } from '@/services/dynamic-module.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ moduleId: string }> }) {
  const { moduleId } = await params;
  const id = Number(moduleId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Module');
  try {
    const user = await requireAdminApi(['module.create']);
    const body = await request.json();
    const result = await cloneModule(id, body, {
      id: user.id, name: user.fullName, role: user.primaryRole,
      ip: clientIp(request), userAgent: userAgent(request),
    });
    return created(result, 'Module duplicated');
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/dynamic-modules/[moduleId]/clone', method: 'POST' });
  }
}
