/**
 * POST /api/employer/compliance-documents/[documentId]/renew
 *
 * The employer records the renewal of their own licence or certificate: new
 * validity dates, the new number and fee, the status recomputed and the
 * reminder stamp cleared so the next expiry cycle notifies again.
 */
import { requireEmployerApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, notFound, ok, userAgent } from '@/lib/utils/api-response';
import { renewEmployerDocument } from '@/services/compliance.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  const id = Number(documentId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Document');
  try {
    const user = await requireEmployerApi(['compliance_document.update']);
    const result = await renewEmployerDocument(Number(user.employerId ?? 0), id, await request.json(), {
      user, ip: clientIp(request), userAgent: userAgent(request),
    });
    return ok(result, { message: `Renewed to ${result.expiryDate}` });
  } catch (error) {
    return handleRouteError(error, { route: '/api/employer/compliance-documents/[documentId]/renew', method: 'POST' });
  }
}
