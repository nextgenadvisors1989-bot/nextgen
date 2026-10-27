/** POST /api/verifier/reports/[reportId]/start-review — claim the report. */
import { requireVerifierApi } from '@/lib/auth/api-guards';
import { clientIp, fail, handleRouteError, notFound, ok } from '@/lib/utils/api-response';
import { queryOne, type RowDataPacket } from '@/lib/db/mysql';
import { startReview } from '@/services/audit-report.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  const id = Number(reportId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Report');

  try {
    const user = await requireVerifierApi(['verifier.verify']);
    const isAdmin = user.roles.some((role) => ['admin', 'super_admin'].includes(role.slug));

    if (!isAdmin) {
      const assignment = await queryOne<RowDataPacket>(
        'SELECT id FROM verifier_assignments WHERE report_id = ? AND verifier_id = ? LIMIT 1',
        [id, user.id]
      );
      if (!assignment) return fail('This report is not in your verification queue', 403);
    }

    const result = await startReview(id, { user, ip: clientIp(request) });
    if (!result) return notFound('Report');

    return ok(
      { report: result.report, changed: result.changed },
      { message: result.changed ? 'Report opened for review' : 'Already under review' }
    );
  } catch (error) {
    return handleRouteError(error, { route: '/api/verifier/reports/[reportId]/start-review', method: 'POST' });
  }
}
