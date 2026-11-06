/**
 * GET /api/documents/submission/[submissionId]
 *
 * The Word (.docx) file of a filled form, with the same content as its PDF. Scoped like the PDF: the submitter, their employer,
 * the assigned auditor, a verifier or an administrator.
 */
import { requireApiPanel } from '@/lib/auth/permission-check';
import { clientIp, fail, handleRouteError, notFound } from '@/lib/utils/api-response';
import { actorFromUser, submissionDocx } from '@/services/dynamic-submission.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ submissionId: string }> }) {
  const { submissionId } = await params;
  const id = Number(submissionId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Submission');

  try {
    const user = await requireApiPanel(['admin', 'super_admin', 'verifier', 'auditor', 'employer', 'employee']);
    const actor = { ...actorFromUser(user, request), ip: clientIp(request) };
    const file = await submissionDocx(id, actor);
    return new Response(new Uint8Array(file.buffer), {
      status: 200,
      headers: {
        'Content-Type': file.contentType,
        'Content-Disposition': `attachment; filename="${file.filename}"`,
        'Content-Length': String(file.buffer.length),
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    const raised = error as { code?: string; message?: string };
    if (raised?.code === 'NOT_FOUND') return notFound('Submission');
    if (raised?.code === 'FORBIDDEN') return fail(raised.message ?? 'Not allowed', 403, { code: 'FORBIDDEN' });
    return handleRouteError(error, { route: '/api/documents/submission/[submissionId]', method: 'GET' });
  }
}
