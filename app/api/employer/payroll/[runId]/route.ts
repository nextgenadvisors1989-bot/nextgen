/**
 * GET /api/employer/payroll/[runId]
 *
 * One of this company's runs with every payslip it produced. A run belonging to
 * another company answers 404 — the scope is applied in the query, not after it.
 *
 * DELETE — withdraws the run. A locked or paid run needs `confirm: true` in the
 *          body, because its payslips already record money that moved.
 */
import { requireEmployerApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, ok, userAgent } from '@/lib/utils/api-response';
import { deleteRun, getRun } from '@/services/payroll.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const user = await requireEmployerApi(['payroll.read']);
    const { runId } = await params;
    const run = await getRun(Number(runId), Number(user.employerId ?? 0) || null);
    return ok(run);
  } catch (error) {
    return handleRouteError(error, { route: '/api/employer/payroll/[runId]', method: 'GET' });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const user = await requireEmployerApi(['payroll.update']);
    const { runId } = await params;
    const body = await request.json().catch(() => ({}));
    const result = await deleteRun(Number(runId), {
      user, ip: clientIp(request), userAgent: userAgent(request),
    }, body, { employerId: Number(user.employerId ?? 0) || null });
    return ok(result, { message: 'Payroll run withdrawn from the register' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/employer/payroll/[runId]', method: 'DELETE' });
  }
}
