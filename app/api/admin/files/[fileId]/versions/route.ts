/**
 * POST /api/admin/files/[fileId]/versions — uploads the next revision of a
 * document. Multipart, field `file` plus an optional `changeNote`.
 *
 * Version numbers come from `file_versions`, so the history is gapless even if
 * an upload is repeated after a failure.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, fail, handleRouteError, notFound, ok } from '@/lib/utils/api-response';
import { uploadNewVersion } from '@/services/file.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const id = Number((await params).fileId);
  if (!Number.isInteger(id) || id <= 0) return notFound('File');

  try {
    const user = await requireAdminApi(['file.update']);
    const formData = await request.formData();
    // The vault screens post under `files` (the shared uploader's field name);
    // API clients may use the singular `file`. Both are accepted.
    const single = formData.get('file');
    const upload = single instanceof File ? single : formData.getAll('files').find((entry): entry is File => entry instanceof File);
    if (!(upload instanceof File)) return fail('Attach the new revision in the "file" field');

    const result = await uploadNewVersion(
      id,
      { originalName: upload.name, mimeType: upload.type, data: Buffer.from(await upload.arrayBuffer()) },
      (formData.get('changeNote') as string | null) || null,
      { user, ip: clientIp(request) }
    );

    return ok(result, { message: `Version ${result.version} of ${result.original_name} uploaded` });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/files/[fileId]/versions', method: 'POST' });
  }
}
