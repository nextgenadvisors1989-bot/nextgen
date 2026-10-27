/**
 * POST /api/admin/cms/pages/bulk — publish, unpublish, archive or restore many
 * pages at once. Each page is reported individually, so one bad row never hides
 * the outcome of the rest.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, ok, userAgent } from '@/lib/utils/api-response';
import { cmsPageBulkSchema } from '@/lib/validations/cms.validation';
import { bulkPageAction } from '@/services/cms.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const user = await requireAdminApi(['cms_page.update']);
    const input = cmsPageBulkSchema.parse(await request.json());
    const result = await bulkPageAction(input, { user, ip: clientIp(request), userAgent: userAgent(request) });
    return ok(result, {
      message: `${result.succeeded} page(s) ${input.action}ed${result.failed ? `, ${result.failed} refused` : ''}`,
    });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/cms/pages/bulk', method: 'POST' });
  }
}
