/**
 * GET /api/employer/payroll/payslips/[payslipId]
 *
 * One of this company's payslips with every wage head broken out. A payslip of
 * another company is not found — the scope is in the query, not in a check
 * after the read.
 */
import { requireEmployerApi } from '@/lib/auth/api-guards';
import { handleRouteError, ok } from '@/lib/utils/api-response';
import { getPayslip } from '@/services/payroll.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ payslipId: string }> }) {
  try {
    const user = await requireEmployerApi(['payslip.read']);
    const { payslipId } = await params;
    const payslip = await getPayslip(Number(payslipId), { employerId: Number(user.employerId ?? 0) || null });
    return ok(payslip);
  } catch (error) {
    return handleRouteError(error, { route: '/api/employer/payroll/payslips/[payslipId]', method: 'GET' });
  }
}
