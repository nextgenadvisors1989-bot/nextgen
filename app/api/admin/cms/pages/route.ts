/**
 * GET  /api/admin/cms/pages — the page register: filters, sorting, pagination
 *       and the statistics the register's tiles read.
 * POST /api/admin/cms/pages — creates a page (draft, published or scheduled).
 *
 * A slug is generated from the title when one is not supplied, is never allowed
 * to collide with a real public route, and stays unique across the register.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, created, handleRouteError, ok, parseSearchParams, userAgent } from '@/lib/utils/api-response';
import { cmsPageListQuerySchema } from '@/lib/validations/cms.validation';
import { createPage, listPages } from '@/services/cms.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireAdminApi(['cms_page.read']);
    const filters = cmsPageListQuerySchema.parse(Object.fromEntries(parseSearchParams(request)));
    const result = await listPages(filters);
    return ok(result.data, { pagination: result.pagination, extra: { stats: result.stats } });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/cms/pages', method: 'GET' });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAdminApi(['cms_page.create']);
    const result = await createPage(await request.json(), { user, ip: clientIp(request), userAgent: userAgent(request) });
    return created(result, `Page “${result.slug}” created as ${result.status}`);
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/cms/pages', method: 'POST' });
  }
}
