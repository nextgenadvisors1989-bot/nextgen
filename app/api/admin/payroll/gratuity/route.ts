/**
 * /api/admin/payroll/gratuity
 *
 * GET  — the gratuity register: service period, last drawn wages, the computed
 *        amount and whether the statutory five-year eligibility is met.
 * POST — computes gratuity for one employee from the joining and leaving dates.
 *        The formula (15 days' wages per completed year of service on the last
 *        drawn basic + DA) lives in the statutory library, not here.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, created, handleRouteError, ok, parseSearchParams, userAgent } from '@/lib/utils/api-response';
import { createGratuity, listGratuity } from '@/services/payroll.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireAdminApi(['payroll.read']);
    const params = parseSearchParams(request);
    const rows = await listGratuity({
      employerId: Number(params.get('employer_id')) || null,
      status: params.get('status') ?? null,
      limit: Math.min(Number(params.get('limit') ?? 200), 1000),
    });
    return ok(rows, {
      extra: {
        count: rows.length,
        eligible: rows.filter((row) => row.is_statutory_eligible).length,
        total: rows.reduce((sum, row) => sum + row.gratuity_amount, 0),
      },
    });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/payroll/gratuity', method: 'GET' });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAdminApi(['payroll.create']);
    const result = await createGratuity(await request.json(), {
      user, ip: clientIp(request), userAgent: userAgent(request),
    });
    return created(result, result.isStatutoryEligible
      ? `Gratuity of ₹${result.amount.toFixed(2)} computed over ${result.totalServiceYears} year(s) — statutory eligibility met`
      : `Gratuity of ₹${result.amount.toFixed(2)} computed over ${result.totalServiceYears} year(s) — under the five-year eligibility`,
    );
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/payroll/gratuity', method: 'POST' });
  }
}
