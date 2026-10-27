/**
 * /api/admin/audit-reports/[reportId]/comments
 * GET  — the conversation, oldest first, with author roles.
 * POST — add a comment, a correction request or an auditor reply. Everyone on
 *        the thread except the author is notified in-app.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, created, handleRouteError, notFound, ok, parseSearchParams } from '@/lib/utils/api-response';
import * as repo from '@/repositories/audit-report.repository';
import { addComment } from '@/services/audit-report.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  const id = Number(reportId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Report');

  try {
    await requireAdminApi(['audit_report.read']);
    const query = parseSearchParams(request);
    const comments = await repo.listComments(id, {
      type: query.get('type') ?? undefined,
      includeResolved: query.get('includeResolved') !== 'false',
    });
    const counts = await repo.commentCounts(id);
    return ok(comments, {
      extra: {
        counts: {
          total: Number(counts?.total ?? 0),
          corrections: Number(counts?.corrections ?? 0),
          openCorrections: Number(counts?.open_corrections ?? 0),
        },
      },
    });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/audit-reports/[reportId]/comments', method: 'GET' });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  const id = Number(reportId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Report');

  try {
    const user = await requireAdminApi(['audit_report.update']);
    const result = await addComment(id, await request.json(), { user, ip: clientIp(request) });
    if (!result) return notFound('Report');
    return created({ comment: result.comment }, 'Comment added successfully');
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/audit-reports/[reportId]/comments', method: 'POST' });
  }
}
