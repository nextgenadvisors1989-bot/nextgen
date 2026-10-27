/**
 * /api/admin/cms/resources/[resourceId]
 *
 * GET    — the resource with its file, act and thumbnail.
 * PUT    — updates it (publishing stamps `published_at` once).
 * DELETE — archives it out of the public library.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, notFound, ok, userAgent } from '@/lib/utils/api-response';
import { deleteResource, getResourceDetail, updateResource } from '@/services/cms.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseId(value: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ resourceId: string }> }) {
  const id = parseId((await params).resourceId);
  if (!id) return notFound('Resource');
  try {
    await requireAdminApi(['cms_resource.read']);
    return ok(await getResourceDetail(id));
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/cms/resources/[resourceId]', method: 'GET' });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ resourceId: string }> }) {
  const id = parseId((await params).resourceId);
  if (!id) return notFound('Resource');
  try {
    const user = await requireAdminApi(['cms_resource.update']);
    const result = await updateResource(id, await request.json(), { user, ip: clientIp(request), userAgent: userAgent(request) });
    return ok(result, { message: `Resource updated (${result.changed.length} field(s))` });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/cms/resources/[resourceId]', method: 'PUT' });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ resourceId: string }> }) {
  const id = parseId((await params).resourceId);
  if (!id) return notFound('Resource');
  try {
    const user = await requireAdminApi(['cms_resource.delete']);
    const result = await deleteResource(id, { user, ip: clientIp(request), userAgent: userAgent(request) });
    return ok(result, { message: 'Resource archived' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/cms/resources/[resourceId]', method: 'DELETE' });
  }
}
