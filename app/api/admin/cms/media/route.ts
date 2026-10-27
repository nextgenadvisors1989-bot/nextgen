/**
 * GET /api/admin/cms/media — the media library: filters, sorting, pagination and
 * the storage statistics the library header shows.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { handleRouteError, ok, parseSearchParams } from '@/lib/utils/api-response';
import { cmsMediaListQuerySchema } from '@/lib/validations/cms.validation';
import { listMedia } from '@/services/cms.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireAdminApi(['cms_media.read']);
    const filters = cmsMediaListQuerySchema.parse(Object.fromEntries(parseSearchParams(request)));
    const result = await listMedia(filters);
    return ok(result.data, { pagination: result.pagination, extra: { stats: result.stats } });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/cms/media', method: 'GET' });
  }
}
