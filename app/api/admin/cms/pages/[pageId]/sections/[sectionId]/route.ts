/**
 * /api/admin/cms/pages/[pageId]/sections/[sectionId]
 *
 * PUT    — updates a section (its heading, prose, items, styling, visibility).
 * DELETE — removes it from the page.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, notFound, ok, userAgent } from '@/lib/utils/api-response';
import { removeSection, updateSection } from '@/services/cms.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseId(value: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PUT(request: Request, { params }: { params: Promise<{ pageId: string; sectionId: string }> }) {
  const { pageId, sectionId } = await params;
  const section = parseId(sectionId);
  if (!parseId(pageId) || !section) return notFound('Section');
  try {
    const user = await requireAdminApi(['cms_page.update']);
    const result = await updateSection(section, await request.json(), { user, ip: clientIp(request), userAgent: userAgent(request) });
    return ok(result, { message: 'Section saved' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/cms/pages/[pageId]/sections/[sectionId]', method: 'PUT' });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ pageId: string; sectionId: string }> }) {
  const { pageId, sectionId } = await params;
  const section = parseId(sectionId);
  if (!parseId(pageId) || !section) return notFound('Section');
  try {
    const user = await requireAdminApi(['cms_page.update']);
    const result = await removeSection(section, { user, ip: clientIp(request), userAgent: userAgent(request) });
    return ok(result, { message: 'Section removed' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/cms/pages/[pageId]/sections/[sectionId]', method: 'DELETE' });
  }
}
