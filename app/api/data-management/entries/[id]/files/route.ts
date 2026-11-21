/** POST /api/data-management/entries/[id]/files — attaches photos or papers (multipart: files, caption?) to a record. */
import { created, fail, notFound } from '@/lib/utils/api-response';
import { withDataManagement } from '@/lib/api/data-management-route';
import { attachFiles } from '@/services/data-management.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return notFound('Record');
  return withDataManagement(request, { route: '/api/data-management/entries/[id]/files', method: 'POST' }, async ({ actor, employerId }) => {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return fail('Send the files as multipart/form-data', 400, { code: 'VALIDATION_FAILED' });
    }
    const files = form.getAll('files').filter((entry): entry is File => entry instanceof File);
    if (!files.length) return fail('Choose at least one file', 422, { code: 'VALIDATION_FAILED' });
    if (files.length > 10) return fail('Attach at most 10 files at a time', 422, { code: 'VALIDATION_FAILED' });
    const uploads = await Promise.all(files.map(async (file) => ({ originalName: file.name, mimeType: file.type || 'application/octet-stream', data: Buffer.from(await file.arrayBuffer()) })));
    const caption = String(form.get('caption') ?? '').trim().slice(0, 255) || null;
    const count = await attachFiles(actor, employerId ?? (Number(form.get('employer_id')) || null), id, uploads, caption);
    return created({ count }, count === 1 ? 'File attached' : `${count} files attached`);
  });
}
