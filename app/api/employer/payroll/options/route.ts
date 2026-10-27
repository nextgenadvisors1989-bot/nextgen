/**
 * GET /api/employer/payroll/options
 *
 * The units, departments, wage heads and leave types this company's payroll
 * forms read. Scoped from the session, so the list never contains another
 * company's data.
 */
import { requireEmployerApi } from '@/lib/auth/api-guards';
import { handleRouteError, ok } from '@/lib/utils/api-response';
import { payrollOptions } from '@/services/payroll.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await requireEmployerApi(['payroll.read']);
    const employerId = Number(user.employerId ?? 0);
    const options = await payrollOptions({ employerId: employerId || null });
    return ok(options);
  } catch (error) {
    return handleRouteError(error, { route: '/api/employer/payroll/options', method: 'GET' });
  }
}
