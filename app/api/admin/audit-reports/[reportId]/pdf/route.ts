/**
 * POST /api/admin/audit-reports/[reportId]/pdf
 * Regenerates the report PDF from the current revision, keeps it as the next
 * version of the stored file and returns the new file id.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, notFound, ok } from '@/lib/utils/api-response';
import { generateAndStorePdf } from '@/services/audit-report.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  const id = Number(reportId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Report');

  try {
    const user = await requireAdminApi(['audit_report.update']);
    const result = await generateAndStorePdf(id, { user, ip: clientIp(request) });
    if (!result.fileId) return notFound('Report');

    return ok(
      { fileId: result.fileId, version: result.version, warnings: result.warnings, downloadUrl: `/api/files/${result.fileId}/download` },
      { message: `PDF regenerated for version ${result.version}` }
    );
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/audit-reports/[reportId]/pdf', method: 'POST' });
  }
}
