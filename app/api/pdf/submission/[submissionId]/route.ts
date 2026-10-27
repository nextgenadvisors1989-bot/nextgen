/**
 * GET /api/pdf/submission/[submissionId]
 *
 * Streams the PDF of a filled dynamic form. The document is regenerated on every
 * download from the stored answers, so a returned-and-corrected submission always
 * renders what is actually on record. Access is scoped the same way the
 * submission itself is: the submitter, their employer, the assigned auditor, a
 * verifier or an administrator.
 */
import { requireApiPanel } from '@/lib/auth/permission-check';
import { findFile, readFileBytes, registerDownload } from '@/lib/files/file-service';
import { clientIp, fail, handleRouteError, notFound, userAgent } from '@/lib/utils/api-response';
import { actorFromUser, submissionPdf } from '@/services/dynamic-submission.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ submissionId: string }> }) {
  const { submissionId } = await params;
  const id = Number(submissionId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Submission');

  try {
    const user = await requireApiPanel(['admin', 'super_admin', 'verifier', 'auditor', 'employer', 'employee']);
    const actor = { ...actorFromUser(user, request), ip: clientIp(request) };

    const stored = await submissionPdf(id, actor);

    await registerDownload(
      {
        id: 0,
        original_name: stored.filename,
        mime_type: 'application/pdf',
        file_size: stored.buffer.length,
      } as never,
      { user, ip: clientIp(request), userAgent: userAgent(request) }
    );

    return new Response(new Uint8Array(stored.buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${stored.filename}"`,
        'Content-Length': String(stored.buffer.length),
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    const raised = error as { code?: string; message?: string };
    if (raised?.code === 'NOT_FOUND') return notFound('Submission');
    if (raised?.code === 'FORBIDDEN') return fail(raised.message ?? 'Not allowed', 403, { code: 'FORBIDDEN' });
    return handleRouteError(error, { route: '/api/pdf/submission/[submissionId]', method: 'GET' });
  }
}

/** Unused import guard — `findFile`/`readFileBytes` stay available for cached PDFs. */
void findFile;
void readFileBytes;
