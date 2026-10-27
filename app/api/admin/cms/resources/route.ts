/**
 * GET  /api/admin/cms/resources — the downloadable library register.
 * POST /api/admin/cms/resources — records a resource (file-backed or a link),
 *        with the act it belongs to and whether it needs a sign-in.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, created, handleRouteError, ok, parseSearchParams, userAgent } from '@/lib/utils/api-response';
import { cmsResourceListQuerySchema } from '@/lib/validations/cms.validation';
import { createResource, listResources } from '@/services/cms.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireAdminApi(['cms_resource.read']);
    const filters = cmsResourceListQuerySchema.parse(Object.fromEntries(parseSearchParams(request)));
    const result = await listResources(filters);
    return ok(result.data, { pagination: result.pagination, extra: { stats: result.stats } });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/cms/resources', method: 'GET' });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAdminApi(['cms_resource.create']);
    const result = await createResource(await request.json(), { user, ip: clientIp(request), userAgent: userAgent(request) });
    return created(result, `Resource “${result.slug}” saved as ${result.status}`);
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/cms/resources', method: 'POST' });
  }
}
