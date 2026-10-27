/**
 * /api/admin/payroll/bonus
 *
 * GET  — the statutory bonus register: who was paid the annual bonus, on what
 *        eligible wages, at what percentage, and whether it has been paid yet.
 * POST — computes bonus for the employees named, from their paid days and wages
 *        for the bonus year. An employee who already has a record for the year is
 *        reported as skipped rather than duplicated.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, created, handleRouteError, ok, parseSearchParams, userAgent } from '@/lib/utils/api-response';
import { createBonus, listBonus } from '@/services/payroll.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: Request) {
  try {
    await requireAdminApi(['payroll.read']);
    const params = parseSearchParams(request);
    const rows = await listBonus({
      employerId: Number(params.get('employer_id')) || null,
      year: Number(params.get('year')) || null,
      status: params.get('status') ?? null,
      limit: Math.min(Number(params.get('limit') ?? 200), 1000),
    });
    return ok(rows, {
      extra: {
        count: rows.length,
        total: rows.reduce((sum, row) => sum + row.bonus_amount, 0),
      },
    });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/payroll/bonus', method: 'GET' });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAdminApi(['payroll.create']);
    const result = await createBonus(await request.json(), {
      user, ip: clientIp(request), userAgent: userAgent(request),
    });
    return created(result, result.created.length
      ? `Bonus computed for ${result.created.length} employee(s) — total ₹${result.total.toFixed(2)}`
      : 'No bonus was computed',
    );
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/payroll/bonus', method: 'POST' });
  }
}
