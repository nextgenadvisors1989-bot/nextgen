/**
 * GET /api/admin/payroll/[runId]/payslips
 *
 * The payslips of one run, each with the head-wise items behind it — what the
 * run detail screen prints and what an inspector reads line by line.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { handleRouteError, ok } from '@/lib/utils/api-response';
import { getRun } from '@/services/payroll.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  try {
    await requireAdminApi(['payslip.read']);
    const { runId } = await params;
    const run = await getRun(Number(runId));
    return ok(run.payslips, { extra: { run: { id: run.id, run_number: run.run_number, status: run.status, month_label: run.month_label }, stats: run.stats } });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/payroll/[runId]/payslips', method: 'GET' });
  }
}
