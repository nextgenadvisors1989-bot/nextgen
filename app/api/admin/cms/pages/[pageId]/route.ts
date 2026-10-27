/**
 * /api/admin/cms/pages/[pageId]
 *
 * GET    — the page with its ordered sections, children and parent.
 * PUT    — updates the page. Renaming a published page's slug is recorded so the
 *          old address can keep resolving.
 * DELETE — archives the page. Refused while live child pages still hang off it.
 * PATCH  — restores an archived page as a draft.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, fail, handleRouteError, notFound, ok, userAgent } from '@/lib/utils/api-response';
import { deletePage, getPageDetail, restorePage, updatePage } from '@/services/cms.service';

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
    return ok(await getPageDetail(id));
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/cms/pages/[pageId]', method: 'GET' });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ pageId: string }> }) {
  const id = parseId((await params).pageId);
  if (!id) return notFound('Page');
  try {
    const user = await requireAdminApi(['cms_page.update']);
    const result = await updatePage(id, await request.json(), { user, ip: clientIp(request), userAgent: userAgent(request) });
    return ok(result, { message: `Page updated (${result.changed.length} field(s))` });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/cms/pages/[pageId]', method: 'PUT' });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ pageId: string }> }) {
  const id = parseId((await params).pageId);
  if (!id) return notFound('Page');
  try {
    const user = await requireAdminApi(['cms_page.delete']);
    const body = await request.json().catch(() => ({}));
    const result = await deletePage(id, body ?? {}, { user, ip: clientIp(request), userAgent: userAgent(request) });
    return ok(result, { message: `Page archived with its ${result.sections} section(s)` });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/cms/pages/[pageId]', method: 'DELETE' });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ pageId: string }> }) {
  const id = parseId((await params).pageId);
  if (!id) return notFound('Page');
  try {
    const user = await requireAdminApi(['cms_page.update']);
    const result = await restorePage(id, { user, ip: clientIp(request), userAgent: userAgent(request) });
    return ok(result, { message: 'Page restored as a draft' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/cms/pages/[pageId]', method: 'PATCH' });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ pageId: string }> }) {
  const id = parseId((await params).pageId);
  if (!id) return notFound('Page');
  return fail('Use PUT to update a page, or /status to change its publishing state', 405, { code: 'METHOD_NOT_ALLOWED' });
}
