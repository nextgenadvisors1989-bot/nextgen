/**
 * POST /api/admin/payroll/[runId]/calculate
 *
 * Runs the engine: the live salary structure of every eligible employee, that
 * month's attendance, the approved leave, the holidays and the employer's
 * statutory switches become one payslip each. Recalculation replaces the run's
 * payslips inside a single transaction, so it is always safe to press again
 * after an attendance correction.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, ok, userAgent } from '@/lib/utils/api-response';
import { calculateRun } from '@/services/payroll.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const user = await requireAdminApi(['payroll.update']);
    const { runId } = await params;
    const result = await calculateRun(Number(runId), {
      user, ip: clientIp(request), userAgent: userAgent(request),
    });
    return ok(result, {
      message: result.skipped.length
        ? `${result.payslips.length} payslip(s) computed; ${result.skipped.length} employee(s) skipped for want of a salary structure`
        : `${result.payslips.length} payslip(s) computed for ${result.month_label}`,
    });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/payroll/[runId]/calculate', method: 'POST' });
  }
}
