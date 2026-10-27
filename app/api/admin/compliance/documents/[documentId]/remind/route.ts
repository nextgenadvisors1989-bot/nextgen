/**
 * POST /api/admin/compliance/documents/[documentId]/remind
 *
 * The manual nudge beside the nightly `npm run send:reminders` cron: emails the
 * employer's compliance contact from the documented expiry template and raises
 * an in-app notification for the administrators.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, notFound, ok, userAgent } from '@/lib/utils/api-response';
import { remindDocument } from '@/services/compliance.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  const id = Number(documentId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Document');
  try {
    const user = await requireAdminApi(['compliance_document.read']);
    const result = await remindDocument(id, { user, ip: clientIp(request), userAgent: userAgent(request) });
    return ok(result, {
      message: result.emailed
        ? `Reminder emailed — ${result.daysToExpiry} day(s) to expiry`
        : `Reminder recorded — ${result.daysToExpiry} day(s) to expiry (no employer contact email on file)`,
    });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/compliance/documents/[documentId]/remind', method: 'POST' });
  }
}
