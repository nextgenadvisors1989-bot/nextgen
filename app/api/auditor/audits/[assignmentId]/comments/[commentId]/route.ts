/**
 * PUT /api/auditor/audits/[assignmentId]/comments/[commentId]
 * Ticks a verifier correction off (or reopens it). Only correction requests can be
 * resolved, and only on the auditor's own report.
 */
import { requireAuditorApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, notFound, ok } from '@/lib/utils/api-response';
import { identityFor, resolveMyCorrection } from '@/services/auditor-workspace.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ assignmentId: string; commentId: string }> }
) {
  const { assignmentId, commentId } = await params;
  const assignment = Number(assignmentId);
  const comment = Number(commentId);
  if (!Number.isInteger(assignment) || assignment <= 0) return notFound('Audit');
  if (!Number.isInteger(comment) || comment <= 0) return notFound('Correction');

  try {
    const user = await requireAuditorApi(['audit_report.update']);
    const me = await identityFor(user.id);

    let body: unknown = {};
    try { body = await request.json(); } catch { body = {}; }

    const result = await resolveMyCorrection(assignment, comment, body, {
      user, ip: clientIp(request), userAgent: request.headers.get('user-agent'),
    }, me.id);
    if (!result) return notFound('Correction');

    return ok(result, {
      message: (result.comment?.is_resolved ?? true) ? 'Correction marked as done' : 'Correction reopened',
    });
  } catch (error) {
    return handleRouteError(error, { route: '/api/auditor/audits/[assignmentId]/comments/[commentId]', method: 'PUT' });
  }
}
