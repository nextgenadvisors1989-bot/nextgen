/**
 * POST /api/employer/payroll/[runId]/generate
 *
 * Generates the bilingual payslip PDF for every payslip in one of this
 * company's runs and files each in the document vault, where the employee can
 * download it. A run of another company is not found.
 */
import { requireEmployerApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, ok, userAgent } from '@/lib/utils/api-response';
import { generateRunDocuments } from '@/services/payroll.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 600;

export async function POST(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const user = await requireEmployerApi(['payslip.create']);
    const { runId } = await params;
    const result = await generateRunDocuments(Number(runId), {
      user, ip: clientIp(request), userAgent: userAgent(request),
    }, { employerId: Number(user.employerId ?? 0) || null });
    return ok(result, {
      message: result.failures.length
        ? `${result.generated} of ${result.total} payslip PDF(s) generated — ${result.failures.length} failed`
        : `${result.generated} payslip PDF(s) generated`,
    });
  } catch (error) {
    return handleRouteError(error, { route: '/api/employer/payroll/[runId]/generate', method: 'POST' });
  }
}
