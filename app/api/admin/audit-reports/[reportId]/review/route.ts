/**
 * POST /api/admin/audit-reports/[reportId]/review
 * The verifier decision: approve (closes the audit, sets next-audit-due),
 * reject (terminal, reason required) or return for correction (structured
 * corrections + comments the auditor must clear before resubmitting).
 *
 * Administrators can also use this route to record a decision on a verifier's
 * behalf, which is why it accepts the audit_report.approve / .reject gates.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, notFound, ok } from '@/lib/utils/api-response';
import { reportReviewSchema } from '@/lib/validations/audit-report.validation';
import { reviewReport } from '@/services/audit-report.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  const id = Number(reportId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Report');

  let body: unknown;
  try {
    const user = await requireAdminApi(['audit_report.approve']);
    body = await request.json();

    // Rejecting needs the reject gate too — approve alone is not enough.
    const parsed = reportReviewSchema.parse(body);
    if (parsed.action === 'reject' && !user.permissions.includes('audit_report.reject')) {
      await requireAdminApi(['audit_report.reject']);
    }

    const result = await reviewReport(id, parsed, { user, ip: clientIp(request) });
    if (!result) return notFound('Report');

    const messages = {
      approve: `Report approved — the audit is complete and the auditor has been notified`,
      reject: `Report rejected — the auditor has been notified with your reason`,
      return: `Report returned for correction with ${result.corrections} correction request(s)`,
    } as const;

    return ok({ report: result.report, status: result.status, corrections: result.corrections, warnings: result.warnings }, { message: messages[parsed.action] });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/audit-reports/[reportId]/review', method: 'POST' });
  }
}
