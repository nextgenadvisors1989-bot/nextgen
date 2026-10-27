/**
 * GET /api/admin/cms/slugs — every live slug plus the platform's reserved
 * routes, so the editors can warn about a clash before a save is attempted.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { handleRouteError, ok, parseSearchParams } from '@/lib/utils/api-response';
import { slugCatalog } from '@/services/cms.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireAdminApi(['cms_page.read']);
    const params = parseSearchParams(request);
    const excludeId = Number(params.get('exclude_id') ?? 0) || null;
    return ok(await slugCatalog(excludeId));
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/cms/slugs', method: 'GET' });
  }
}
