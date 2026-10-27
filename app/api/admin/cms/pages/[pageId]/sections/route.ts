/**
 * /api/admin/cms/pages/[pageId]/sections
 *
 * GET  — the page's sections in render order.
 * POST — appends a section. List-style blocks (features, stats, FAQ, pricing …)
 *        take an `items` array which is stored as the block's JSON payload.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, created, handleRouteError, notFound, ok, userAgent } from '@/lib/utils/api-response';
import { addSection, getPageDetail } from '@/services/cms.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseId(value: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ pageId: string }> }) {
  const id = parseId((await params).pageId);
  if (!id) return notFound('Page');
  try {
    await requireAdminApi(['cms_page.read']);
    const detail = await getPageDetail(id);
    return ok(detail.sections);
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/cms/pages/[pageId]/sections', method: 'GET' });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ pageId: string }> }) {
  const id = parseId((await params).pageId);
  if (!id) return notFound('Page');
  try {
    const user = await requireAdminApi(['cms_page.update']);
    const result = await addSection(id, await request.json(), { user, ip: clientIp(request), userAgent: userAgent(request) });
    return created(result, `Section added at position ${result.sortOrder}`);
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/cms/pages/[pageId]/sections', method: 'POST' });
  }
}
