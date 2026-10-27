/**
 * POST /api/admin/cms/pages/[pageId]/sections/reorder — rewrites the render
 * order of a page's blocks. Every section of the page must be sent, so a partial
 * list can never silently leave two blocks claiming the same position.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, notFound, ok, userAgent } from '@/lib/utils/api-response';
import { cmsSectionReorderSchema } from '@/lib/validations/cms.validation';
import { reorderSections } from '@/services/cms.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  const id = Number(pageId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Page');
  try {
    const user = await requireAdminApi(['cms_page.update']);
    const input = cmsSectionReorderSchema.parse(await request.json());
    const result = await reorderSections(id, input.order, { user, ip: clientIp(request), userAgent: userAgent(request) });
    return ok(result, { message: `Section order saved (${result.updated} blocks)` });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/cms/pages/[pageId]/sections/reorder', method: 'POST' });
  }
}
