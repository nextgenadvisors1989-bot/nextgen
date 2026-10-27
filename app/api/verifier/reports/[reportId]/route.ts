/**
 * GET /api/verifier/reports/[reportId] — the review bundle: report, current
 * body, every revision, the whole comment thread and the verification history.
 * Verifiers only reach reports assigned to them; administrators reach any.
 */
import { requireVerifierApi } from '@/lib/auth/api-guards';
import { queryOne, type RowDataPacket } from '@/lib/db/mysql';
import { fail, handleRouteError, notFound, ok } from '@/lib/utils/api-response';
import * as repo from '@/repositories/audit-report.repository';
import { getReportDetail } from '@/services/audit-report.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  const id = Number(reportId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Report');

  try {
    const user = await requireVerifierApi(['verifier.read']);
    const isAdmin = user.roles.some((role) => ['admin', 'super_admin'].includes(role.slug));

    if (!isAdmin) {
      const assignment = await queryAssignment(id, user.id);
      if (!assignment) return fail('This report is not in your verification queue', 403);
    }

    const detail = await getReportDetail(id);
    if (!detail) return notFound('Report');
    return ok(detail);
  } catch (error) {
    return handleRouteError(error, { route: '/api/verifier/reports/[reportId]', method: 'GET' });
  }
}

function queryAssignment(reportId: number, verifierId: number) {
  return queryOne<RowDataPacket>(
    'SELECT id FROM verifier_assignments WHERE report_id = ? AND verifier_id = ? LIMIT 1',
    [reportId, verifierId]
  );
}
