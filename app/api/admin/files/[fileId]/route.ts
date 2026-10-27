/**
 * /api/admin/files/[fileId] — one document from the vault, addressed by any of
 * its revisions (the handler resolves the root).
 *
 * GET    — metadata, the resolved current revision and the full version history.
 * PATCH  — metadata edit (name, category, description, tags, access level,
 *          expiry) plus archive/restore through `is_archived`.
 * DELETE — archive the document (soft delete; the file and history are kept).
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, fail, handleRouteError, notFound, ok } from '@/lib/utils/api-response';
import { fileMetadataSchema } from '@/lib/validations/file.validation';
import { getFileDetail, removeFile, updateMetadata } from '@/services/file.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseId(value: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const id = parseId((await params).fileId);
  if (!id) return notFound('File');

  try {
    await requireAdminApi(['file.read']);
    return ok(await getFileDetail(id));
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/files/[fileId]', method: 'GET' });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const id = parseId((await params).fileId);
  if (!id) return notFound('File');

  try {
    const user = await requireAdminApi(['file.update']);
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return fail('Send the fields you want to change', 400, { code: 'INVALID_JSON' });

    const input = fileMetadataSchema.parse(body);
    const result = await updateMetadata(id, input, { user, ip: clientIp(request) });
    return ok(result, { message: `${result.name} updated` });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/files/[fileId]', method: 'PATCH' });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const id = parseId((await params).fileId);
  if (!id) return notFound('File');

  try {
    const user = await requireAdminApi(['file.delete']);
    const result = await removeFile(id, { user, ip: clientIp(request) });
    return ok(result, { message: `${result.name} archived` });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/files/[fileId]', method: 'DELETE' });
  }
}
