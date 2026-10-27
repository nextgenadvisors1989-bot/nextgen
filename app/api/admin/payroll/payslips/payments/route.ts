/**
 * PATCH /api/admin/payroll/payslips/payments
 *
 * Marks a batch of payslips paid, failed or on hold, with the mode, the
 * reference and the date. When every payslip of a run is settled the run itself
 * becomes Paid — so the register and the payments never drift apart.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, ok, userAgent } from '@/lib/utils/api-response';
import { markPayslipsPaid } from '@/services/payroll.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(request: Request) {
  try {
    const user = await requireAdminApi(['payslip.update']);
    const result = await markPayslipsPaid(await request.json(), {
      user, ip: clientIp(request), userAgent: userAgent(request),
    });
    return ok(result, { message: `${result.updated} payslip(s) updated` });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/payroll/payslips/payments', method: 'PATCH' });
  }
}
