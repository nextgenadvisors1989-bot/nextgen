/**
 * /api/verifier/reports/[reportId]/comments
 * The verifier's side of the conversation: comments, correction requests and
 * replies to the auditor. Scoped to reports in their own queue.
 */
import { requireVerifierApi } from '@/lib/auth/api-guards';
import { clientIp, created, fail, handleRouteError, notFound, ok, parseSearchParams } from '@/lib/utils/api-response';
import { queryOne, type RowDataPacket } from '@/lib/db/mysql';
import * as repo from '@/repositories/audit-report.repository';
import { addComment } from '@/services/audit-report.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  const id = Number(reportId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Report');

  try {
    const user = await requireVerifierApi(['verifier.read']);
    const allowed = await canReach(id, user);
    if (!allowed) return fail('This report is not in your verification queue', 403);

    const type = parseSearchParams(request).get('type') ?? undefined;
    const comments = await repo.listComments(id, { type });
    return ok(comments);
  } catch (error) {
    return handleRouteError(error, { route: '/api/verifier/reports/[reportId]/comments', method: 'GET' });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  const id = Number(reportId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Report');

  try {
    const user = await requireVerifierApi(['verifier.update']);
    const allowed = await canReach(id, user);
    if (!allowed) return fail('This report is not in your verification queue', 403);

    const result = await addComment(id, await request.json(), { user, ip: clientIp(request) });
    if (!result) return notFound('Report');
    return created({ comment: result.comment }, 'Comment added successfully');
  } catch (error) {
    return handleRouteError(error, { route: '/api/verifier/reports/[reportId]/comments', method: 'POST' });
  }
}

async function canReach(reportId: number, user: { id: number; roles: { slug: string }[] }) {
  if (user.roles.some((role) => ['admin', 'super_admin'].includes(role.slug))) return true;
  const row = await queryOne<RowDataPacket>(
    'SELECT id FROM verifier_assignments WHERE report_id = ? AND verifier_id = ? LIMIT 1',
    [reportId, user.id]
  );
  return Boolean(row);
}
