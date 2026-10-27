/**
 * GET /api/employer/payroll/overview
 *
 * This company's payroll dashboard: the month's totals, the twelve-month trend,
 * the latest runs, the payslips of the month and the head count behind them.
 */
import { requireEmployerApi } from '@/lib/auth/api-guards';
import { handleRouteError, ok, parseSearchParams } from '@/lib/utils/api-response';
import { payrollWindowQuerySchema } from '@/lib/validations/payroll.validation';
import { payrollOverview } from '@/services/payroll.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const user = await requireEmployerApi(['payroll.read']);
    const employerId = Number(user.employerId ?? 0);
    const window = payrollWindowQuerySchema.parse(Object.fromEntries(parseSearchParams(request)));
    const result = await payrollOverview(window, { employerId: employerId || null });
    return ok(result);
  } catch (error) {
    return handleRouteError(error, { route: '/api/employer/payroll/overview', method: 'GET' });
  }
}
