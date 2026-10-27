/**
 * GET  /api/admin/dynamic-modules — module register (filters, sorting, paging, stats)
 * POST /api/admin/dynamic-modules — create a module (optionally with its first form)
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, created, handleRouteError, ok, parseSearchParams, userAgent } from '@/lib/utils/api-response';
import { createModule, listModules } from '@/services/dynamic-module.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireAdminApi(['module.read']);
    const result = await listModules(parseSearchParams(request));
    return ok(result.data, {
      pagination: result.pagination,
      extra: { stats: result.stats, moduleOptions: result.moduleOptions },
    });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/dynamic-modules', method: 'GET' });
  }
}

export async function POST(request: Request) {
  let userId: number | undefined;
  let body: unknown;
  try {
    const user = await requireAdminApi(['module.create']);
    userId = user.id;
    body = await request.json();
    const result = await createModule(body, {
      id: user.id, name: user.fullName, role: user.primaryRole,
      ip: clientIp(request), userAgent: userAgent(request),
    });
    return created(result, `Module created${result.formId ? ' with its first form' : ''}`);
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/dynamic-modules', method: 'POST', body, userId, ip: clientIp(request) ?? undefined });
  }
}
