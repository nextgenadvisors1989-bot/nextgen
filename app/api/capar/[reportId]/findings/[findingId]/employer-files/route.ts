/** POST /api/capar/[reportId]/findings/[findingId]/employer-files - the employer attaches images or documents as proof of a fix (multipart `files`). */
import { fail } from '@/lib/utils/api-response';
import { missing, numericId, one, readUploads, withCapar } from '@/lib/api/capar-route';
import { attachEmployerFiles } from '@/services/capar.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ reportId: string; findingId: string }> }) {
  const resolved = await params;
  const reportId = numericId(resolved.reportId);
  const findingId = numericId(resolved.findingId);
  if (!reportId || !findingId) return missing();
  return withCapar(request, { route: '/api/capar/[reportId]/findings/[findingId]/employer-files', method: 'POST' }, async (_user, actor) => {
    let form: FormData;
    try { form = await request.formData(); } catch { return fail('Send the files as multipart/form-data', 400, { code: 'VALIDATION_FAILED' }); }
    const saved = await attachEmployerFiles(actor, reportId, findingId, await readUploads(form));
    return one({ files: saved }, { message: saved.length === 1 ? 'File attached' : `${saved.length} files attached`, status: 201 });
  });
}
