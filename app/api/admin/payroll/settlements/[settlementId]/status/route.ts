/**
 * POST /api/admin/payroll/settlements/[settlementId]/status
 *
 * Draft → Submitted → Approved → Paid, or Cancelled from any live state. Paying a
 * settlement closes the employee's record: the employment status becomes
 * `resigned` and the payment reference is stored against the settlement.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, ok, userAgent } from '@/lib/utils/api-response';
import { decideSettlement } from '@/services/payroll.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ settlementId: string }> }) {
  try {
    const body = (await request.json().catch(() => ({}))) as { status?: string; note?: string | null };
    const status = String(body.status ?? '');
    const user = await requireAdminApi([status === 'Paid' ? 'payroll.update' : 'payroll.update']);
    const { settlementId } = await params;
    const result = await decideSettlement(Number(settlementId), status, {
      user, ip: clientIp(request), userAgent: userAgent(request),
    }, body.note ?? null);
    return ok(result, { message: `Settlement ${result.status.toLowerCase()}` });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/payroll/settlements/[settlementId]/status', method: 'POST' });
  }
}
