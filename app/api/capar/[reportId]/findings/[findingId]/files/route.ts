/**
 * POST /api/capar/[reportId]/findings/[findingId]/files - multipart upload of non-compliance photos or evidence.
 * Fields: `files` (one or many), `kind` (Photo | Evidence), optional `caption`.
 */
import { created, fail, serialize } from '@/lib/utils/api-response';
import { missing, numericId, one, readUploads, withCapar } from '@/lib/api/capar-route';
import { attachFiles } from '@/services/capar.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ reportId: string; findingId: string }> }) {
  const resolved = await params;
  const reportId = numericId(resolved.reportId);
  const findingId = numericId(resolved.findingId);
  if (!reportId || !findingId) return missing();
  return withCapar(request, { route: '/api/capar/[reportId]/findings/[findingId]/files', method: 'POST' }, async (_user, actor) => {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return fail('Send the files as multipart/form-data', 400, { code: 'VALIDATION_FAILED' });
    }
    const uploads = await readUploads(form);
    if (!uploads.length) return fail('Choose at least one file', 422, { code: 'VALIDATION_FAILED' });
    const caption = String(form.get('caption') ?? '').trim().slice(0, 255) || null;
    const saved = await attachFiles(actor, reportId, findingId, uploads, String(form.get('kind') ?? 'Photo'), caption);
    return one({ files: saved }, { message: uploads.length === 1 ? 'File attached' : `${uploads.length} files attached`, status: 201 });
  });
}
