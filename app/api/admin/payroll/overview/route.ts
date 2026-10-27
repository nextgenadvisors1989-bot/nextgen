/**
 * GET /api/admin/payroll/overview
 *
 * The payroll monitoring dashboard: the month's totals, the twelve-month trend
 * the chart plots, the latest runs, and — the number an administrator actually
 * acts on — the companies that have employees but no run for the period.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { handleRouteError, ok, parseSearchParams } from '@/lib/utils/api-response';
import { payrollWindowQuerySchema } from '@/lib/validations/payroll.validation';
import { payrollOverview } from '@/services/payroll.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireAdminApi(['payroll.read']);
    const window = payrollWindowQuerySchema.parse(Object.fromEntries(parseSearchParams(request)));
    const result = await payrollOverview(window, { employerId: null });
    return ok(result);
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/payroll/overview', method: 'GET' });
  }
}
