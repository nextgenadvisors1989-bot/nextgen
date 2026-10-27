/**
 * GET    /api/admin/dynamic-submissions/[submissionId] — the filled form, read-only
 * PUT    /api/admin/dynamic-submissions/[submissionId] — review decision (approve / reject / return)
 * DELETE /api/admin/dynamic-submissions/[submissionId] — remove a submission
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { handleRouteError, notFound, ok } from '@/lib/utils/api-response';
import { actorFromUser, deleteSubmission, reviewSubmission, submissionWorkspace } from '@/services/dynamic-submission.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ submissionId: string }> }) {
  const { submissionId } = await params;
  const id = Number(submissionId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Submission');
  try {
    const user = await requireAdminApi(['submission.read']);
    return ok(await submissionWorkspace(id, actorFromUser(user, request)));
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/dynamic-submissions/[submissionId]', method: 'GET' });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ submissionId: string }> }) {
  const { submissionId } = await params;
  const id = Number(submissionId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Submission');
  try {
    const user = await requireAdminApi(['submission.approve']);
    const body = await request.json();
    const result = await reviewSubmission(id, body, actorFromUser(user, request));
    return ok(result, { message: `Submission ${result.status.replace(/_/g, ' ')}` });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/dynamic-submissions/[submissionId]', method: 'PUT' });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ submissionId: string }> }) {
  const { submissionId } = await params;
  const id = Number(submissionId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Submission');
  try {
    const user = await requireAdminApi(['submission.delete']);
    const result = await deleteSubmission(id, actorFromUser(user, request));
    return ok(result, { message: 'Submission deleted' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/dynamic-submissions/[submissionId]', method: 'DELETE' });
  }
}
