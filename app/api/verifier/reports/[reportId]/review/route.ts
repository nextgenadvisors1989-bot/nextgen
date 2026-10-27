/**
 * POST /api/verifier/reports/[reportId]/review
 * Approve, reject or return the report. Corrections become individual threads
 * the auditor clears one by one; the decision is written to `verifier_comments`,
 * a new report revision and the audit trail, and the auditor is notified by
 * in-app + email + SMS + WhatsApp.
 */
import { requireVerifierApi } from '@/lib/auth/api-guards';
import { clientIp, fail, handleRouteError, notFound, ok } from '@/lib/utils/api-response';
import { queryOne, type RowDataPacket } from '@/lib/db/mysql';
import { reportReviewSchema } from '@/lib/validations/audit-report.validation';
import { reviewReport } from '@/services/audit-report.service';

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

    const body = await request.json();
    const parsed = reportReviewSchema.parse(body);

    // Approve / reject additionally require the matching verifier permission.
    if (parsed.action === 'approve' && !user.permissions.includes('verifier.approve')) {
      return fail('You do not have permission to approve reports', 403);
    }
    if (parsed.action === 'reject' && !user.permissions.includes('verifier.reject')) {
      return fail('You do not have permission to reject reports', 403);
    }

    const result = await reviewReport(id, parsed, { user, ip: clientIp(request) });
    if (!result) return notFound('Report');

    const messages = {
      approve: 'Report approved — the audit is closed and everyone has been notified',
      reject: 'Report rejected — the auditor has been notified with your reason',
      return: `Report returned for correction (${result.corrections} correction request(s))`,
    } as const;

    return ok(
      { report: result.report, status: result.status, corrections: result.corrections, warnings: result.warnings },
      { message: messages[parsed.action] }
    );
  } catch (error) {
    return handleRouteError(error, { route: '/api/verifier/reports/[reportId]/review', method: 'POST' });
  }
}
