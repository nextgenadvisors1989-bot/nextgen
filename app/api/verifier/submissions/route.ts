/**
 * GET /api/verifier/submissions — the verification queue: every submission whose
 * module requires verification and that is waiting on a decision.
 */
import { requireVerifierApi } from '@/lib/auth/api-guards';
import { handleRouteError, ok, parseSearchParams } from '@/lib/utils/api-response';
import { filterObject } from '@/services/dynamic-module.service';
import { actorFromUser, listSubmissions, submissionOptions } from '@/services/dynamic-submission.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const user = await requireVerifierApi(['submission.read']);
    const actor = actorFromUser(user, request);
    const filters = filterObject(parseSearchParams(request));
    const [result, options] = await Promise.all([
      listSubmissions(actor, filters),
      submissionOptions(actor),
    ]);
    return ok(result.data, {
      pagination: result.pagination,
      extra: { stats: result.stats, options },
    });
  } catch (error) {
    return handleRouteError(error, { route: '/api/verifier/submissions', method: 'GET' });
  }
}
