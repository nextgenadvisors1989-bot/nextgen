/**
 * /api/admin/audit-reports/[reportId]/comments/[commentId]
 * PUT    — mark a correction resolved (or reopen it).
 * DELETE — remove your own comment (administrators can remove any).
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, notFound, ok } from '@/lib/utils/api-response';
import { deleteComment, resolveComment } from '@/services/audit-report.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PUT(request: Request, { params }: { params: Promise<{ reportId: string; commentId: string }> }) {
  const { reportId, commentId } = await params;
  const report = Number(reportId);
  const comment = Number(commentId);
  if (!Number.isInteger(report) || !Number.isInteger(comment)) return notFound('Comment');

  try {
    const user = await requireAdminApi(['audit_report.update']);
    let body: unknown = {};
    try { body = await request.json(); } catch { body = {}; }

    const result = await resolveComment(report, comment, body, { user, ip: clientIp(request) });
    if (!result) return notFound('Comment');
    return ok({ comment: result.comment }, { message: 'Comment updated' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/audit-reports/[reportId]/comments/[commentId]', method: 'PUT' });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ reportId: string; commentId: string }> }) {
  const { reportId, commentId } = await params;
  const report = Number(reportId);
  const comment = Number(commentId);
  if (!Number.isInteger(report) || !Number.isInteger(comment)) return notFound('Comment');

  try {
    const user = await requireAdminApi(['audit_report.update']);
    const result = await deleteComment(report, comment, { user, ip: clientIp(request) });
    if (!result) return notFound('Comment');
    return ok({ deleted: true }, { message: 'Comment deleted' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/audit-reports/[reportId]/comments/[commentId]', method: 'DELETE' });
  }
}
