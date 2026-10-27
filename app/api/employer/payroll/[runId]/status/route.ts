/**
 * POST /api/employer/payroll/[runId]/status
 *
 * Moves the company's run along its lifecycle (Draft → Calculated → Approved →
 * Locked → Paid, and back where money has not moved).
 */
import { requireEmployerApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, ok, userAgent } from '@/lib/utils/api-response';
import { getRun, setRunStatus } from '@/services/payroll.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const user = await requireEmployerApi(['payroll.update']);
    const { runId } = await params;
    const employerId = Number(user.employerId ?? 0);
    await getRun(Number(runId), employerId || null);
    const body = (await request.json().catch(() => ({}))) as { status?: string; note?: string | null };
    const result = await setRunStatus(Number(runId), String(body.status ?? ''), {
      user, ip: clientIp(request), userAgent: userAgent(request),
    }, body.note ?? null, { employerId: employerId || null });
    return ok(result, { message: `Payroll run ${result.run_number} is now ${result.status}` });
  } catch (error) {
    return handleRouteError(error, { route: '/api/employer/payroll/[runId]/status', method: 'POST' });
  }
}
