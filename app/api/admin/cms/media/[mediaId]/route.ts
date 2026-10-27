/**
 * /api/admin/cms/media/[mediaId]
 *
 * GET    — the asset with the pages that use it ("used by").
 * PUT    — title, alt text, caption, folder, tags, media type.
 * DELETE — removes the library row. Refused while a live page still points at
 *          the asset, because a broken image on a published page is a bug the
 *          editor should fix deliberately.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, notFound, ok, userAgent } from '@/lib/utils/api-response';
import { deleteMedia, getMediaDetail, updateMedia } from '@/services/cms.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseId(value: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ mediaId: string }> }) {
  const id = parseId((await params).mediaId);
  if (!id) return notFound('Media asset');
  try {
    await requireAdminApi(['cms_media.read']);
    return ok(await getMediaDetail(id));
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/cms/media/[mediaId]', method: 'GET' });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ mediaId: string }> }) {
  const id = parseId((await params).mediaId);
  if (!id) return notFound('Media asset');
  try {
    const user = await requireAdminApi(['cms_media.update']);
    const result = await updateMedia(id, await request.json(), { user, ip: clientIp(request), userAgent: userAgent(request) });
    return ok(result, { message: `Asset updated (${result.changed.length} field(s))` });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/cms/media/[mediaId]', method: 'PUT' });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ mediaId: string }> }) {
  const id = parseId((await params).mediaId);
  if (!id) return notFound('Media asset');
  try {
    const user = await requireAdminApi(['cms_media.delete']);
    const result = await deleteMedia(id, { user, ip: clientIp(request), userAgent: userAgent(request) });
    return ok(result, { message: 'Asset removed from the library' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/cms/media/[mediaId]', method: 'DELETE' });
  }
}
