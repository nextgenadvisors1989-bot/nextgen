/**
 * /api/admin/payroll/settlements
 *
 * GET  — the full-and-final register.
 * POST — prepares a settlement: salary for the part-month worked, leave
 *        encashment from the ledger, the statutory gratuity, any bonus already
 *        recorded, less the recoveries. Every figure is proposed by the engine
 *        and may be overwritten by the caller.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, created, handleRouteError, ok, parseSearchParams, userAgent } from '@/lib/utils/api-response';
import { createSettlement, listSettlements } from '@/services/payroll.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireAdminApi(['payroll.read']);
    const params = parseSearchParams(request);
    const rows = await listSettlements({
      employerId: Number(params.get('employer_id')) || null,
      status: params.get('status') ?? null,
      limit: Math.min(Number(params.get('limit') ?? 200), 1000),
    });
    return ok(rows, {
      extra: {
        count: rows.length,
        total: rows.reduce((sum, row) => sum + row.net_settlement_amount, 0),
      },
    });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/payroll/settlements', method: 'GET' });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAdminApi(['payroll.create']);
    const result = await createSettlement(await request.json(), {
      user, ip: clientIp(request), userAgent: userAgent(request),
    });
    return created(result, `Settlement ${result.settlement_number} prepared — net ₹${result.net_settlement_amount.toFixed(2)}`);
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/payroll/settlements', method: 'POST' });
  }
}
