/**
 * POST /api/admin/audit-reports/[reportId]/submit
 * Submits the report: freezes the body as a version, generates the PDF, moves
 * the assignment to Submitted, queues the verifier and emails the auditor,
 * verifier and administrators.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, notFound, ok } from '@/lib/utils/api-response';
import { submitReport } from '@/services/audit-report.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  const id = Number(reportId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Report');

  try {
    const user = await requireAdminApi(['audit_report.update']);
    let body: unknown = {};
    try { body = await request.json(); } catch { body = {}; }

    const result = await submitReport(id, body, { user, ip: clientIp(request) });
    if (!result) return notFound('Report');

    return ok(
      {
        report: result.report, version: result.version, pdfFileId: result.pdfFileId,
        verifierId: result.verifierId, warnings: result.warnings,
      },
      { message: `Report submitted as version ${result.version} and sent for verification` }
    );
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/audit-reports/[reportId]/submit', method: 'POST' });
  }
}
