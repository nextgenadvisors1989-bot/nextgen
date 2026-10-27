/**
 * GET /api/admin/audit-reports/options
 *
 *   ?lookups=true  → employers (+units), auditors, verifiers with live queues,
 *                    assignments that can still take a report, modules
 *   ?stats=true    → the register's status/score statistics
 *   ?charts=true   → monthly score trend + findings breakdown
 *   (no params)    → status, type and severity enumerations
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { handleRouteError, ok, parseSearchParams } from '@/lib/utils/api-response';
import { FINDING_SEVERITIES, FINDING_STATUSES, REPORT_STATUSES, REPORT_TYPES } from '@/lib/validations/audit-report.validation';
import { reportCharts, reportLookups, reportStats } from '@/services/audit-report.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireAdminApi(['audit_report.read']);
    const params = parseSearchParams(request);
    const employerId = params.get('employerId');
    const verifierId = params.get('verifierId');

    if (params.get('lookups') === 'true' || params.get('lookups') === '1') {
      return ok(await reportLookups());
    }
    if (params.get('stats') === 'true') {
      return ok(await reportStats(employerId ? Number(employerId) : undefined, verifierId ? Number(verifierId) : undefined));
    }
    if (params.get('charts') === 'true') {
      const [trend, breakdown] = await reportCharts(employerId ? Number(employerId) : undefined);
      return ok({ trend, breakdown });
    }

    return ok({
      statuses: REPORT_STATUSES,
      types: REPORT_TYPES,
      severities: FINDING_SEVERITIES,
      findingStatuses: FINDING_STATUSES,
    });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/audit-reports/options', method: 'GET' });
  }
}
