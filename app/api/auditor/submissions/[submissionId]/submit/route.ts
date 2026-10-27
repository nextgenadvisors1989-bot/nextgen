/**
 * POST /api/auditor/submissions/[submissionId]/submit
 *
 * The real submission: every rule is re-validated, unique answers are checked
 * again, the score is recomputed, a submission number is issued, the PDF is
 * rendered and filed, and the reviewers are notified.
 */
import { requireAuditorApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, notFound, ok, userAgent } from '@/lib/utils/api-response';
import { actorFromUser, saveDraft } from '@/services/dynamic-submission.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ submissionId: string }> }) {
  const { submissionId } = await params;
  const id = Number(submissionId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Submission');
  try {
    const user = await requireAuditorApi(['submission.update']);
    const body = await request.json();
    const result = await saveDraft(id, body, {
      ...actorFromUser(user, request), ip: clientIp(request), userAgent: userAgent(request),
    }, { submit: true });
    return ok(result, {
      message: result.status === 'under_review'
        ? 'Submitted — the verifier has been notified'
        : 'Submitted successfully',
    });
  } catch (error) {
    return handleRouteError(error, { route: '/api/auditor/submissions/[submissionId]/submit', method: 'POST' });
  }
}
