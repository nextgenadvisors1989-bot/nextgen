/**
 * POST /api/admin/payroll/[runId]/status
 *
 * Moves a run along its lifecycle: Calculated → Approved → Locked → Paid, with
 * the reverse step allowed until money has moved. The permitted transitions live
 * in the service so the rule is the same wherever it is invoked from.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, ok, userAgent } from '@/lib/utils/api-response';
import { setRunStatus } from '@/services/payroll.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const user = await requireAdminApi(['payroll.update']);
    const { runId } = await params;
    const body = (await request.json().catch(() => ({}))) as { status?: string; note?: string | null };
    const result = await setRunStatus(Number(runId), String(body.status ?? ''), {
      user, ip: clientIp(request), userAgent: userAgent(request),
    }, body.note ?? null);
    return ok(result, { message: `Payroll run ${result.run_number} is now ${result.status}` });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/payroll/[runId]/status', method: 'POST' });
  }
}
