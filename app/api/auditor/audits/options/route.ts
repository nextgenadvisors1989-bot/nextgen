/**
 * GET /api/auditor/audits/options
 * Enumerations and lookups the auditor workspace filters and forms need, plus the
 * signed-in auditor's own profile so the panel can label itself.
 */
import { requireAuditorApi } from '@/lib/auth/api-guards';
import { handleRouteError, ok } from '@/lib/utils/api-response';
import { identityFor, myAuditStats, myReportStats } from '@/services/auditor-workspace.service';
import {
  FINDING_SEVERITIES, FINDING_STATUSES, REPORT_TYPES,
} from '@/lib/validations/audit-report.validation';
import { AUDIT_STATUSES, AUDIT_PRIORITIES } from '@/types/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await requireAuditorApi(['audit_assignment.read']);
    const me = await identityFor(user.id);
    const [audits, reports] = await Promise.all([myAuditStats(me.id), myReportStats(me.id)]);

    return ok({
      auditor: me,
      assignmentStatuses: AUDIT_STATUSES,
      priorities: AUDIT_PRIORITIES,
      reportTypes: REPORT_TYPES,
      severities: FINDING_SEVERITIES,
      findingStatuses: FINDING_STATUSES,
      stats: { audits, reports },
    });
  } catch (error) {
    return handleRouteError(error, { route: '/api/auditor/audits/options', method: 'GET' });
  }
}
