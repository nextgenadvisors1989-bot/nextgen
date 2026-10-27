/**
 * /api/employer/leave/ledger
 *
 * GET  — the leave ledger for this company's employees: opening, accrued,
 *        availed, encashed, lapsed and the balance carried.
 * POST — accrues the year's entitlement for every active employee of this company.
 */
import { requireEmployerApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, ok, parseSearchParams, userAgent } from '@/lib/utils/api-response';
import { accrueLeave, leaveLedgerReport } from '@/services/payroll.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: Request) {
  try {
    const user = await requireEmployerApi(['leave.read']);
    const employerId = Number(user.employerId ?? 0);
    const params = parseSearchParams(request);
    const rows = await leaveLedgerReport({
      employerId,
      employeeId: Number(params.get('employee_id')) || null,
      year: Number(params.get('year')) || null,
      scopeEmployerId: employerId || null,
      limit: Math.min(Number(params.get('limit') ?? 500), 1000),
    });
    return ok(rows, { extra: { count: rows.length } });
  } catch (error) {
    return handleRouteError(error, { route: '/api/employer/leave/ledger', method: 'GET' });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireEmployerApi(['leave.create']);
    const body = (await request.json().catch(() => ({}))) as { year?: number };
    const result = await accrueLeave(Number(user.employerId ?? 0), Number(body.year ?? new Date().getFullYear()), {
      user, ip: clientIp(request), userAgent: userAgent(request),
    });
    return ok(result, { message: `Leave accrued for ${result.employees} employee(s) across ${result.types} leave type(s)` });
  } catch (error) {
    return handleRouteError(error, { route: '/api/employer/leave/ledger', method: 'POST' });
  }
}
