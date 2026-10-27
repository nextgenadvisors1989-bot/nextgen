/**
 * POST /api/admin/compliance/documents/[documentId]/renew
 *
 * Records a renewal: new issue/expiry dates (or a validity period), the new
 * document number and fee, the status recomputed and the reminder stamp cleared
 * so the expiry job can fire again for the next cycle.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, notFound, ok, userAgent } from '@/lib/utils/api-response';
import { renewDocument } from '@/services/compliance.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  const id = Number(documentId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Document');
  try {
    const user = await requireAdminApi(['compliance_document.update']);
    const result = await renewDocument(id, await request.json(), { user, ip: clientIp(request), userAgent: userAgent(request) });
    return ok(result, { message: `Renewed to ${result.expiryDate}` });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/compliance/documents/[documentId]/renew', method: 'POST' });
  }
}
