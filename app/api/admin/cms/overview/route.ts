/**
 * GET /api/admin/cms/overview — the CMS dashboard: page, media and resource
 * statistics with the recently edited pages and anything waiting to publish.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { handleRouteError, ok } from '@/lib/utils/api-response';
import { cmsOverview } from '@/services/cms.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireAdminApi(['cms_page.read']);
    return ok(await cmsOverview());
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/cms/overview', method: 'GET' });
  }
}
