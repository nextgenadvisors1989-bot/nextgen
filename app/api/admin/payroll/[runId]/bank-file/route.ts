/**
 * GET /api/admin/payroll/[runId]/bank-file
 *
 * The salary upload file for the run's bank: net pay against account number and
 * IFSC, with the narration the bank expects. `?format=csv|neft|nach` picks the
 * column set. The response is a download, not JSON — and the run records that
 * the file was generated.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, parseSearchParams, userAgent } from '@/lib/utils/api-response';
import { bankFile } from '@/services/payroll.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const user = await requireAdminApi(['payroll.export']);
    const { runId } = await params;
    const format = parseSearchParams(request).get('format') ?? 'csv';
    const file = await bankFile(Number(runId), format, {
      user, ip: clientIp(request), userAgent: userAgent(request),
    });
    return new Response(file.body, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${file.fileName}"`,
        'X-Bank-File-Lines': String(file.lines),
        'X-Bank-File-Missing-Details': String(file.missingBankDetails.length),
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/payroll/[runId]/bank-file', method: 'GET' });
  }
}
