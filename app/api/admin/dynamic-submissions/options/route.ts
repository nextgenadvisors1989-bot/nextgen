/**
 * GET /api/admin/dynamic-submissions/options — filter lookups + queue counters.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { handleRouteError, ok } from '@/lib/utils/api-response';
import { actorFromUser, submissionOptions } from '@/services/dynamic-submission.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const user = await requireAdminApi(['submission.read']);
    return ok(await submissionOptions(actorFromUser(user, request)));
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/dynamic-submissions/options', method: 'GET' });
  }
}
