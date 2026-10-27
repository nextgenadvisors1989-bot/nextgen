/**
 * GET /api/employer/payroll/[runId]/bank-file
 *
 * The salary upload file for this company's bank. `?format=csv|neft|nach` picks
 * the column set; the response is the file itself.
 */
import { requireEmployerApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, parseSearchParams, userAgent } from '@/lib/utils/api-response';
import { bankFile, getRun } from '@/services/payroll.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const user = await requireEmployerApi(['payroll.export']);
    const { runId } = await params;
    await getRun(Number(runId), Number(user.employerId ?? 0) || null);
    const format = parseSearchParams(request).get('format') ?? 'csv';
    const file = await bankFile(Number(runId), format, {
      user, ip: clientIp(request), userAgent: userAgent(request),
    }, { employerId: Number(user.employerId ?? 0) || null });
    return new Response(file.body, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${file.fileName}"`,
        'X-Bank-File-Lines': String(file.lines),
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    return handleRouteError(error, { route: '/api/employer/payroll/[runId]/bank-file', method: 'GET' });
  }
}
