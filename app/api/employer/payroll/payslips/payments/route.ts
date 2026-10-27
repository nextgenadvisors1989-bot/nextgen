/**
 * PATCH /api/employer/payroll/payslips/payments
 *
 * Marks a batch of this company's payslips paid, failed or on hold after the
 * salary upload was checked against the bank statement. Payslips belonging to
 * another company are ignored, so a batch cannot reach outside the session's
 * scope. When every payslip of a run is settled the run becomes Paid itself.
 */
import { requireEmployerApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, ok, userAgent } from '@/lib/utils/api-response';
import { markPayslipsPaid } from '@/services/payroll.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(request: Request) {
  try {
    const user = await requireEmployerApi(['payslip.update']);
    const result = await markPayslipsPaid(await request.json(), {
      user, ip: clientIp(request), userAgent: userAgent(request),
    }, { employerId: Number(user.employerId ?? 0) || null });
    return ok(result, { message: `${result.updated} payslip(s) updated` });
  } catch (error) {
    return handleRouteError(error, { route: '/api/employer/payroll/payslips/payments', method: 'PATCH' });
  }
}
