/**
 * POST /api/auditor/audits/[assignmentId]/comments
 * The auditor side of the report thread: reply to a verifier's correction note or
 * leave a remark for the record. The other participants are notified with a link
 * into their own workspace.
 */
import { requireAuditorApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, notFound, ok } from '@/lib/utils/api-response';
import { commentOnMyAudit, identityFor } from '@/services/auditor-workspace.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = await params;
  const id = Number(assignmentId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Audit');

  try {
    const user = await requireAuditorApi(['audit_report.update']);
    const me = await identityFor(user.id);

    let body: unknown = {};
    try { body = await request.json(); } catch { body = {}; }

    const result = await commentOnMyAudit(id, body, {
      user, ip: clientIp(request), userAgent: request.headers.get('user-agent'),
    }, me.id);
    if (!result) return notFound('Audit');

    return ok(result, { message: 'Comment added' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/auditor/audits/[assignmentId]/comments', method: 'POST' });
  }
}
