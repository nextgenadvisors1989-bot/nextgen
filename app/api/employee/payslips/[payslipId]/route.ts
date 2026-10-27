/**
 * GET /api/employee/payslips/[payslipId]
 *
 * One of the employee's own payslips with every wage head broken out. Opening it
 * stamps the first-view time the payroll office relies on. A payslip belonging to
 * anybody else — or one that is not published yet — answers 404.
 */
import { requireEmployeeApi } from '@/lib/auth/api-guards';
import { handleRouteError, ok } from '@/lib/utils/api-response';
import { viewOwnPayslip } from '@/services/payroll.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ payslipId: string }> }) {
  try {
    const user = await requireEmployeeApi(['payslip.read']);
    const { payslipId } = await params;
    const payslip = await viewOwnPayslip(Number(payslipId), Number(user.employeeId ?? 0));
    return ok(payslip);
  } catch (error) {
    return handleRouteError(error, { route: '/api/employee/payslips/[payslipId]', method: 'GET' });
  }
}
