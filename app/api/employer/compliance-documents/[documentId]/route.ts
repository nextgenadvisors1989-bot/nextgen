/**
 * GET    /api/employer/compliance-documents/[documentId] — one of this company's documents
 * PUT    /api/employer/compliance-documents/[documentId] — edits it (dates recompute the status)
 * DELETE /api/employer/compliance-documents/[documentId] — removes it from the register
 *
 * Every handler proves the document belongs to the session's employer first.
 */
import { requireEmployerApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, notFound, ok, userAgent } from '@/lib/utils/api-response';
import {
  deleteEmployerDocument, getEmployerDocumentDetail, updateEmployerDocument,
} from '@/services/compliance.service';

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
    const user = await requireEmployerApi(['compliance_document.read']);
    return ok(await getEmployerDocumentDetail(Number(user.employerId ?? 0), id));
  } catch (error) {
    return handleRouteError(error, { route: '/api/employer/compliance-documents/[documentId]', method: 'GET' });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const id = await documentKey(params);
  if (!id) return notFound('Document');
  try {
    const user = await requireEmployerApi(['compliance_document.update']);
    const result = await updateEmployerDocument(Number(user.employerId ?? 0), id, await request.json(), {
      user, ip: clientIp(request), userAgent: userAgent(request),
    });
    return ok(result, { message: `Document updated (${result.complianceStatus})` });
  } catch (error) {
    return handleRouteError(error, { route: '/api/employer/compliance-documents/[documentId]', method: 'PUT' });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const id = await documentKey(params);
  if (!id) return notFound('Document');
  try {
    const user = await requireEmployerApi(['compliance_document.delete']);
    const result = await deleteEmployerDocument(Number(user.employerId ?? 0), id, {
      user, ip: clientIp(request), userAgent: userAgent(request),
    });
    return ok(result, { message: 'Document removed from the register' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/employer/compliance-documents/[documentId]', method: 'DELETE' });
  }
}
