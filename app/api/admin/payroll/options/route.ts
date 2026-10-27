/**
 * GET /api/admin/payroll/options
 *
 * Everything a payroll form needs in one round trip: employers, units,
 * departments, the 25-head wage catalogue and the leave types.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { handleRouteError, ok } from '@/lib/utils/api-response';
import { payrollOptions } from '@/services/payroll.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireAdminApi(['payroll.read']);
    const options = await payrollOptions({ employerId: null });
    return ok(options);
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/payroll/options', method: 'GET' });
  }
}
