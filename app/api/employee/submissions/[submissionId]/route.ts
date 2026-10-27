/**
 * GET    /api/employee/submissions/[submissionId] — the filled form + answers + score
 * PUT    /api/employee/submissions/[submissionId] — save a draft (rules re-run server-side)
 * DELETE /api/employee/submissions/[submissionId] — delete a draft
 */
import { requireEmployeeApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, notFound, ok, userAgent } from '@/lib/utils/api-response';
import { actorFromUser, deleteSubmission, saveDraft, submissionWorkspace } from '@/services/dynamic-submission.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ submissionId: string }> }) {
  const { submissionId } = await params;
  const id = Number(submissionId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Submission');
  try {
    const user = await requireEmployeeApi(['submission.read']);
    return ok(await submissionWorkspace(id, actorFromUser(user, request)));
  } catch (error) {
    return handleRouteError(error, { route: '/api/employee/submissions/[submissionId]', method: 'GET' });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ submissionId: string }> }) {
  const { submissionId } = await params;
  const id = Number(submissionId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Submission');
  try {
    const user = await requireEmployeeApi(['submission.update']);
    const body = await request.json();
    const result = await saveDraft(id, body, {
      ...actorFromUser(user, request), ip: clientIp(request), userAgent: userAgent(request),
    });
    return ok(result, { message: `Draft saved — ${result.filled} answer(s) captured` });
  } catch (error) {
    return handleRouteError(error, { route: '/api/employee/submissions/[submissionId]', method: 'PUT' });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ submissionId: string }> }) {
  const { submissionId } = await params;
  const id = Number(submissionId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Submission');
  try {
    const user = await requireEmployeeApi(['submission.delete']);
    const result = await deleteSubmission(id, actorFromUser(user, request));
    return ok(result, { message: `${result.submissionNumber} deleted` });
  } catch (error) {
    return handleRouteError(error, { route: '/api/employee/submissions/[submissionId]', method: 'DELETE' });
  }
}
