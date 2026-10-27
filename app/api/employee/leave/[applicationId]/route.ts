/**
 * DELETE /api/employee/leave/[applicationId]
 *
 * Withdraws the employee's own application. A pending or approved one may be
 * withdrawn; an approval that is withdrawn puts the ledger balance back and
 * clears the attendance days it had marked. Anybody else's application is not
 * visible to begin with.
 */
import { requireEmployeeApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, ok, userAgent } from '@/lib/utils/api-response';
import { decideLeave } from '@/services/payroll.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(request: Request, { params }: { params: Promise<{ applicationId: string }> }) {
  try {
    const user = await requireEmployeeApi(['leave.update']);
    const { applicationId } = await params;
    const body = (await request.json().catch(() => ({}))) as { approver_comments?: string };
    const result = await decideLeave(Number(applicationId), { decision: 'withdraw', approver_comments: body.approver_comments }, {
      user, ip: clientIp(request), userAgent: userAgent(request),
    }, { employeeId: Number(user.employeeId ?? 0) });
    return ok(result, { message: 'Leave application withdrawn' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/employee/leave/[applicationId]', method: 'DELETE' });
  }
}
