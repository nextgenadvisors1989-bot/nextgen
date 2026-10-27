/**
 * GET  /api/employee/submissions — this account's submissions (scoped, with stats)
 * POST /api/employee/submissions — start filling a form (resumes an open draft)
 */
import { requireEmployeeApi } from '@/lib/auth/api-guards';
import { clientIp, created, handleRouteError, ok, parseSearchParams, userAgent } from '@/lib/utils/api-response';
import { filterObject } from '@/services/dynamic-module.service';
import { actorFromUser, listSubmissions, startSubmission, submissionOptions } from '@/services/dynamic-submission.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const user = await requireEmployeeApi(['submission.read']);
    const actor = actorFromUser(user, request);
    const filters = filterObject(parseSearchParams(request));
    const [result, options] = await Promise.all([
      listSubmissions(actor, filters),
      filters.options === 'true' ? submissionOptions(actor) : Promise.resolve(null),
    ]);
    return ok(result.data, {
      pagination: result.pagination,
      extra: { stats: result.stats, scope: result.scope, ...(options ? { options } : {}) },
    });
  } catch (error) {
    return handleRouteError(error, { route: '/api/employee/submissions', method: 'GET' });
  }
}

export async function POST(request: Request) {
  let userId: number | undefined;
  let body: unknown;
  try {
    const user = await requireEmployeeApi(['submission.create']);
    userId = user.id;
    body = await request.json();
    const result = await startSubmission(body, {
      ...actorFromUser(user, request), ip: clientIp(request), userAgent: userAgent(request),
    });
    return created(
      { submissionId: result.submissionId, submissionNumber: result.submissionNumber, resumed: result.resumed },
      result.resumed ? `Resuming draft ${result.submissionNumber}` : `Started ${result.submissionNumber}`
    );
  } catch (error) {
    return handleRouteError(error, { route: '/api/employee/submissions', method: 'POST', body, userId, ip: clientIp(request) ?? undefined });
  }
}
