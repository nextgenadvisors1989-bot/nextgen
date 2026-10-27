/**
 * /api/files/[fileId]
 *
 * GET    — file metadata plus its full version history.
 * PUT    — upload a replacement revision (multipart `file`, optional `changeNote`).
 * DELETE — archive the file (soft delete; the audit trail keeps every version).
 *
 * Access is decided by `canAccessFile()`: admins and auditors see the vault,
 * employers only their own entity's documents, employees only their own records.
 */
import { requireApiPanel } from '@/lib/auth/permission-check';
import { clientIp, fail, handleRouteError, notFound, ok } from '@/lib/utils/api-response';
import {
  addVersion, archiveFile, canAccessFile, findFile, listVersions, toPayload,
} from '@/lib/files/file-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function loadAccessibleFile(fileId: number) {
  const user = await requireApiPanel(['admin', 'super_admin', 'employer', 'employee', 'auditor', 'verifier']);
  const file = await findFile(fileId);
  if (!file) return { user, file: null, allowed: false };
  const allowed = await canAccessFile(user, file);
  return { user, file, allowed };
}

export async function GET(_request: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;
  const id = Number(fileId);
  if (!Number.isInteger(id) || id <= 0) return notFound('File');

  try {
    const { file, allowed } = await loadAccessibleFile(id);
    if (!file) return notFound('File');
    if (!allowed) return fail('You do not have access to this document', 403);

    const versions = await listVersions(Number(file.parent_file_id ?? file.id));
    return ok({ file: toPayload(file), meta: file, versions });
  } catch (error) {
    return handleRouteError(error, { route: '/api/files/[fileId]', method: 'GET' });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;
  const id = Number(fileId);
  if (!Number.isInteger(id) || id <= 0) return notFound('File');

  try {
    const { user, file, allowed } = await loadAccessibleFile(id);
    if (!file) return notFound('File');
    if (!allowed) return fail('You do not have access to this document', 403);

    const formData = await request.formData();
    const upload = formData.get('file');
    if (!(upload instanceof File)) return fail('Attach the new revision in the "file" field');

    const result = await addVersion(
      id,
      { originalName: upload.name, mimeType: upload.type, data: Buffer.from(await upload.arrayBuffer()) },
      (formData.get('changeNote') as string | null) || null,
      { user, ip: clientIp(request) }
    );
    if (!result) return notFound('File');

    return ok({ file: result }, { message: `Version ${result.version} uploaded successfully` });
  } catch (error) {
    return handleRouteError(error, { route: '/api/files/[fileId]', method: 'PUT' });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;
  const id = Number(fileId);
  if (!Number.isInteger(id) || id <= 0) return notFound('File');

  try {
    const { user, file, allowed } = await loadAccessibleFile(id);
    if (!file) return notFound('File');
    if (!allowed) return fail('You do not have access to this document', 403);

    const removed = await archiveFile(id, { user, ip: clientIp(request) });
    if (!removed) return notFound('File');

    return ok({ archived: true }, { message: `${file.original_name} removed from the vault` });
  } catch (error) {
    return handleRouteError(error, { route: '/api/files/[fileId]', method: 'DELETE' });
  }
}
