/**
 * /api/admin/audit-reports/[reportId]
 *
 * GET    — report + current document body + every version + comment thread +
 *          verifier assignments and decisions.
 * PUT    — partial update; any change to the document body lands as a new
 *          version, so the signed-off revision is never lost.
 * DELETE — refuses an approved report (archive it instead).
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, fail, handleRouteError, notFound, ok, userAgent } from '@/lib/utils/api-response';
import { deleteReport, getReportDetail, updateReport } from '@/services/audit-report.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  const id = Number(reportId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Report');

  try {
    await requireAdminApi(['audit_report.read']);
    const detail = await getReportDetail(id);
    if (!detail) return notFound('Report');
    return ok(detail);
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/audit-reports/[reportId]', method: 'GET' });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  const id = Number(reportId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Report');

  let userId: number | undefined;
  let body: unknown;
  try {
    const user = await requireAdminApi(['audit_report.update']);
    userId = user.id;
    body = await request.json();

    const result = await updateReport(id, body, { user, ip: clientIp(request), userAgent: userAgent(request) });
    if (!result) return notFound('Report');

    return ok(
      { report: result.report, version: result.version ?? null, warnings: result.warnings ?? [] },
      { message: result.updated ? 'Report updated successfully' : 'No changes were applied' }
    );
  } catch (error) {
    return handleRouteError(error, {
      route: '/api/admin/audit-reports/[reportId]', method: 'PUT', body, userId, ip: clientIp(request) ?? undefined,
    });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  const id = Number(reportId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Report');

  try {
    const user = await requireAdminApi(['audit_report.delete']);
    const result = await deleteReport(id, { user, ip: clientIp(request) });
    if (!result) return notFound('Report');
    if (!result.deleted) return fail(result.reason ?? 'Report cannot be deleted', 409);

    return ok({ deleted: true }, { message: 'Report deleted successfully' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/audit-reports/[reportId]', method: 'DELETE' });
  }
}
