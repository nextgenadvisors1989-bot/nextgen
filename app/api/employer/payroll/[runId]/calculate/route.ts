/**
 * POST /api/employer/payroll/[runId]/calculate
 *
 * Runs (or re-runs) this company's payroll engine for the run. Safe to press
 * again after an attendance correction: the run's payslips are rebuilt from the
 * live structure and the corrected attendance.
 */
import { requireEmployerApi } from '@/lib/auth/api-guards';
import { clientIp, fail, handleRouteError, ok, userAgent } from '@/lib/utils/api-response';
import { calculateRun, getRun } from '@/services/payroll.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const user = await requireEmployerApi(['payroll.update']);
    const employerId = Number(user.employerId ?? 0);
    const { runId } = await params;
    // Scoped read first: a run of another company is not found, not forbidden.
    await getRun(Number(runId), employerId || null);
    const result = await calculateRun(Number(runId), {
      user, ip: clientIp(request), userAgent: userAgent(request),
    }, { employerId: employerId || null });
    if (Number(result.employer_id) !== employerId) return fail('Payroll run not found', 404, { code: 'NOT_FOUND' });
    return ok(result, { message: `${result.payslips.length} payslip(s) computed for ${result.month_label}` });
  } catch (error) {
    return handleRouteError(error, { route: '/api/employer/payroll/[runId]/calculate', method: 'POST' });
  }
}
