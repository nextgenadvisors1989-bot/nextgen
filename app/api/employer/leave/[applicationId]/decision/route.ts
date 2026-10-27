/**
 * POST /api/employer/leave/[applicationId]/decision
 *
 * Approves or refuses one of this company's leave applications. Approval moves
 * the employee's ledger balance and marks the days in attendance; the employee is
 * told in the portal, by email and by SMS.
 */
import { requireEmployerApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, ok, userAgent } from '@/lib/utils/api-response';
import { decideLeave } from '@/services/payroll.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ applicationId: string }> }) {
  try {
    const { applicationId } = await params;
    const body = (await request.json().catch(() => ({}))) as { decision?: string };
    const decision = String(body.decision ?? '');
    const permission = decision === 'approve' ? 'leave.approve' : decision === 'reject' ? 'leave.reject' : 'leave.update';
    const user = await requireEmployerApi([permission]);
    const result = await decideLeave(Number(applicationId), body, {
      user, ip: clientIp(request), userAgent: userAgent(request),
    }, { employerId: Number(user.employerId ?? 0) || null });
    return ok(result, { message: `Leave application ${result.status.toLowerCase()}` });
  } catch (error) {
    return handleRouteError(error, { route: '/api/employer/leave/[applicationId]/decision', method: 'POST' });
  }
}
