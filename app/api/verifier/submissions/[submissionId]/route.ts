/**
 * GET /api/verifier/submissions/[submissionId] — read a submission before deciding
 * PUT /api/verifier/submissions/[submissionId] — approve / reject / return (or start review)
 */
import { requireVerifierApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, notFound, ok, userAgent } from '@/lib/utils/api-response';
import { actorFromUser, reviewSubmission, submissionWorkspace } from '@/services/dynamic-submission.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ submissionId: string }> }) {
  const { submissionId } = await params;
  const id = Number(submissionId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Submission');
  try {
    const user = await requireVerifierApi(['submission.read']);
    return ok(await submissionWorkspace(id, actorFromUser(user, request)));
  } catch (error) {
    return handleRouteError(error, { route: '/api/verifier/submissions/[submissionId]', method: 'GET' });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ submissionId: string }> }) {
  const { submissionId } = await params;
  const id = Number(submissionId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Submission');
  try {
    const user = await requireVerifierApi(['submission.verify']);
    const body = await request.json();
    const result = await reviewSubmission(id, body, {
      ...actorFromUser(user, request), ip: clientIp(request), userAgent: userAgent(request),
    });
    return ok(result, { message: `Submission ${result.status.replace(/_/g, ' ')}` });
  } catch (error) {
    return handleRouteError(error, { route: '/api/verifier/submissions/[submissionId]', method: 'PUT' });
  }
}
