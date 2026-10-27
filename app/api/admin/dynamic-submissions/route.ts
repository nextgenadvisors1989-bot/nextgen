/**
 * GET /api/admin/dynamic-submissions — every submission on the platform, with the
 * reviewer's view of the queue in the stats block.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { handleRouteError, ok, parseSearchParams } from '@/lib/utils/api-response';
import { filterObject } from '@/services/dynamic-module.service';
import { actorFromUser, listSubmissions, submissionOptions } from '@/services/dynamic-submission.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const user = await requireAdminApi(['submission.read']);
    const filters = filterObject(parseSearchParams(request));
    const [result, options] = await Promise.all([
      listSubmissions(actorFromUser(user, request), filters),
      filters.options === 'true' ? submissionOptions(actorFromUser(user, request)) : Promise.resolve(null),
    ]);
    return ok(result.data, {
      pagination: result.pagination,
      extra: { stats: result.stats, scope: result.scope, ...(options ? { options } : {}) },
    });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/dynamic-submissions', method: 'GET' });
  }
}
