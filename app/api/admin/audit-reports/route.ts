/**
 * GET  /api/admin/audit-reports — register with filters, sorting, pagination and
 *      the status/score statistics used by the tiles (£ score averages, finding
 *      counts, re-audit pipeline).
 * POST /api/admin/audit-reports — creates a report as version 1, optionally
 *      submitting it straight to a verifier (PDF generated and attached).
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, created, handleRouteError, ok, parseSearchParams, userAgent } from '@/lib/utils/api-response';
import { reportListQuerySchema } from '@/lib/validations/audit-report.validation';
import { createReport, listReports, reportStats } from '@/services/audit-report.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireAdminApi(['audit_report.read']);
    const filters = reportListQuerySchema.parse(parseSearchParams(request));
    const [result, stats] = await Promise.all([listReports(filters), reportStats()]);

    return ok(result.data, { pagination: result.pagination, extra: { stats } });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/audit-reports', method: 'GET' });
  }
}

export async function POST(request: Request) {
  let userId: number | undefined;
  let body: unknown;
  try {
    const user = await requireAdminApi(['audit_report.create']);
    userId = user.id;
    body = await request.json();

    const result = await createReport(body, { user, ip: clientIp(request), userAgent: userAgent(request) });

    return created(
      {
        reportId: result.reportId,
        reportNumber: result.reportNumber,
        version: result.version,
        pdfFileId: result.pdfFileId,
        submitted: result.submitted,
        warnings: result.warnings,
      },
      result.submitted
        ? `Report ${result.reportNumber} created and submitted for verification`
        : `Report ${result.reportNumber} created successfully`
    );
  } catch (error) {
    return handleRouteError(error, {
      route: '/api/admin/audit-reports', method: 'POST', body, userId, ip: clientIp(request) ?? undefined,
    });
  }
}
