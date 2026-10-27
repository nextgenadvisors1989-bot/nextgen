/**
 * POST /api/admin/dynamic-modules/[moduleId]/publish
 * Publishes the module (and any draft forms inside it) after checking that the
 * forms are actually answerable.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, notFound, ok, userAgent } from '@/lib/utils/api-response';
import { publishModule } from '@/services/dynamic-module.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ moduleId: string }> }) {
  const { moduleId } = await params;
  const id = Number(moduleId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Module');
  try {
    const user = await requireAdminApi(['module.update']);
    const result = await publishModule(id, {
      id: user.id, name: user.fullName, role: user.primaryRole,
      ip: clientIp(request), userAgent: userAgent(request),
    });
    return ok(result, { message: `Module published as v${result.version}` });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/dynamic-modules/[moduleId]/publish', method: 'POST' });
  }
}
