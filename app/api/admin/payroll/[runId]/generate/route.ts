/**
 * POST /api/admin/payroll/[runId]/generate
 *
 * Generates the bilingual payslip PDF for every payslip in the run and files
 * each one in the document vault, where the employee can download it and the
 * auditor can see that it was issued.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, ok, userAgent } from '@/lib/utils/api-response';
import { generateRunDocuments } from '@/services/payroll.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 600;

export async function POST(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const user = await requireAdminApi(['payslip.create']);
    const { runId } = await params;
    const result = await generateRunDocuments(Number(runId), {
      user, ip: clientIp(request), userAgent: userAgent(request),
    });
    return ok(result, {
      message: result.failures.length
        ? `${result.generated} of ${result.total} payslip PDF(s) generated — ${result.failures.length} failed`
        : `${result.generated} payslip PDF(s) generated`,
    });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/payroll/[runId]/generate', method: 'POST' });
  }
}
