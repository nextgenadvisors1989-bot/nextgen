/**
 * GET /api/admin/payroll/payslips/[payslipId]
 *
 * One payslip with every wage head broken out — earnings, deductions and the
 * employer's own contributions — plus the bank and payment particulars.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { handleRouteError, ok } from '@/lib/utils/api-response';
import { getPayslip } from '@/services/payroll.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ payslipId: string }> }) {
  try {
    await requireAdminApi(['payslip.read']);
    const { payslipId } = await params;
    const payslip = await getPayslip(Number(payslipId));
    return ok(payslip);
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/payroll/payslips/[payslipId]', method: 'GET' });
  }
}
