/**
 * GET /api/documents/form/[formId]?format=pdf|docx
 *
 * The empty form as a PDF or a Word file, to print or fill in on site. Whoever may open the form may download it
 * (an administrator or verifier any form, an auditor the forms of the modules assigned to their type).
 */
import { requireApiPanel } from '@/lib/auth/permission-check';
import { clientIp, fail, handleRouteError, notFound } from '@/lib/utils/api-response';
import { actorFromUser, formDocument } from '@/services/dynamic-submission.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ formId: string }> }) {
  const { formId } = await params;
  const id = Number(formId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Form');
  const format = new URL(request.url).searchParams.get('format') === 'docx' ? 'docx' : 'pdf';

  try {
    const user = await requireApiPanel(['admin', 'super_admin', 'verifier', 'auditor']);
    const actor = { ...actorFromUser(user, request), ip: clientIp(request) };
    const file = await formDocument(id, actor, format);
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
    if (raised?.code === 'NOT_FOUND') return notFound('Form');
    if (raised?.code === 'FORBIDDEN') return fail(raised.message ?? 'Not allowed', 403, { code: 'FORBIDDEN' });
    if (raised?.code === 'INVALID_STATE') return fail(raised.message ?? 'Not available', 409, { code: 'INVALID_STATE' });
    return handleRouteError(error, { route: '/api/documents/form/[formId]', method: 'GET' });
  }
}
