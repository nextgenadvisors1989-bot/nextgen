/**
 * POST /api/capar/[reportId]/findings/[findingId]/messages - a Reply on the row. JSON { subject, body } or multipart (subject, body, files).
 * The other side is told by notification and mail.
 */
import { fail } from '@/lib/utils/api-response';
import { missing, numericId, one, readUploads, withCapar } from '@/lib/api/capar-route';
import { addMessage } from '@/services/capar.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ reportId: string; findingId: string }> }) {
  const resolved = await params;
  const reportId = numericId(resolved.reportId);
  const findingId = numericId(resolved.findingId);
  if (!reportId || !findingId) return missing();
  return withCapar(request, { route: '/api/capar/[reportId]/findings/[findingId]/messages', method: 'POST' }, async (_user, actor) => {
    if ((request.headers.get('content-type') ?? '').includes('multipart/form-data')) {
      let form: FormData;
      try { form = await request.formData(); } catch { return fail('Send the message as multipart/form-data', 400, { code: 'VALIDATION_FAILED' }); }
      return one(await addMessage(actor, reportId, findingId, { subject: form.get('subject'), body: form.get('body') }, await readUploads(form)), { message: 'Sent', status: 201 });
    }
    return one(await addMessage(actor, reportId, findingId, await request.json().catch(() => ({}))), { message: 'Sent', status: 201 });
  });
}
