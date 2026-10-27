/**
 * POST /api/admin/payroll/leave/[applicationId]/decision
 *
 * Approves, refuses or withdraws a leave application. An approval moves the
 * employee's ledger and marks the days as Leave in attendance; a refusal leaves
 * both untouched. The employee is told in the portal, by email and by SMS.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
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
    const user = await requireAdminApi([permission]);
    const result = await decideLeave(Number(applicationId), body, {
      user, ip: clientIp(request), userAgent: userAgent(request),
    });
    return ok(result, { message: `Leave application ${result.status.toLowerCase()}` });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/payroll/leave/[applicationId]/decision', method: 'POST' });
  }
}
