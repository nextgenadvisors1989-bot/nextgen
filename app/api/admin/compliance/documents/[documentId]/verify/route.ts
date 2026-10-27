/**
 * POST /api/admin/compliance/documents/[documentId]/verify
 *
 * Marks the document verified (checked against the original) or withdraws the
 * verification. Both are activity-logged with who and when.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, notFound, ok, userAgent } from '@/lib/utils/api-response';
import { verifyDocument } from '@/services/compliance.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  const id = Number(documentId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Document');
  try {
    const user = await requireAdminApi(['compliance_document.verify']);
    const body = await request.json().catch(() => ({}));
    const isVerified = body?.is_verified === undefined ? true : Boolean(body.is_verified);
    const result = await verifyDocument(id, isVerified, { user, ip: clientIp(request), userAgent: userAgent(request) });
    return ok(result, { message: isVerified ? 'Document marked verified' : 'Verification withdrawn' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/compliance/documents/[documentId]/verify', method: 'POST' });
  }
}
