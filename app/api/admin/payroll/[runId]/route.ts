/**
 * /api/admin/payroll/[runId]
 *
 * GET    — one run with every payslip it produced and the head totals.
 * PATCH  — the period dates, the unit/department and the notes, while the run is
 *          still Draft or Calculated.
 * DELETE — withdraws a run from the register. A locked or paid run needs
 *          `confirm: true` in the body because its payslips record money that
 *          moved; a draft goes quietly.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, ok, userAgent } from '@/lib/utils/api-response';
import { deleteRun, getRun, updateRun } from '@/services/payroll.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  try {
    await requireAdminApi(['payroll.read']);
    const { runId } = await params;
    const result = await getRun(Number(runId));
    return ok(result);
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/payroll/[runId]', method: 'GET' });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const user = await requireAdminApi(['payroll.update']);
    const { runId } = await params;
    const result = await updateRun(Number(runId), await request.json(), {
      user, ip: clientIp(request), userAgent: userAgent(request),
    });
    return ok(result, { message: `Payroll run ${result.run_number} updated` });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/payroll/[runId]', method: 'PATCH' });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const user = await requireAdminApi(['payroll.update']);
    const { runId } = await params;
    const body = await request.json().catch(() => ({}));
    const result = await deleteRun(Number(runId), { user, ip: clientIp(request), userAgent: userAgent(request) }, body);
    return ok(result, { message: 'Payroll run withdrawn from the register' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/payroll/[runId]', method: 'DELETE' });
  }
}
