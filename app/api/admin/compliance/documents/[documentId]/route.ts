/**
 * GET    /api/admin/compliance/documents/[documentId] — the document with its
 *        employer, unit, act, rule, attached file and verification record
 * PUT    /api/admin/compliance/documents/[documentId] — edits it (dates recompute
 *        the derived status; moving the expiry clears the reminder stamp)
 * DELETE /api/admin/compliance/documents/[documentId] — soft delete
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, notFound, ok, userAgent } from '@/lib/utils/api-response';
import { deleteDocument, getDocumentDetail, updateDocument } from '@/services/compliance.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function documentKey(params: Promise<{ documentId: string }>) {
  const { documentId } = await params;
  const id = Number(documentId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const id = await documentKey(params);
  if (!id) return notFound('Document');
  try {
    await requireAdminApi(['compliance_document.read']);
    return ok(await getDocumentDetail(id));
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/compliance/documents/[documentId]', method: 'GET' });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const id = await documentKey(params);
  if (!id) return notFound('Document');
  try {
    const user = await requireAdminApi(['compliance_document.update']);
    const result = await updateDocument(id, await request.json(), { user, ip: clientIp(request), userAgent: userAgent(request) });
    return ok(result, { message: `Document updated (${result.complianceStatus})` });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/compliance/documents/[documentId]', method: 'PUT' });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const id = await documentKey(params);
  if (!id) return notFound('Document');
  try {
    const user = await requireAdminApi(['compliance_document.delete']);
    const result = await deleteDocument(id, { user, ip: clientIp(request), userAgent: userAgent(request) });
    return ok(result, { message: 'Document removed from the register' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/compliance/documents/[documentId]', method: 'DELETE' });
  }
}
