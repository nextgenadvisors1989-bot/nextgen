/**
 * /api/admin/payroll/leave/ledger
 *
 * GET  — the leave ledger: opening, accrued, availed, encashed, lapsed and the
 *        balance each employee carries, by leave type and year.
 * POST — accrues the year's entitlement for every active employee of a company
 *        (used when it is repeated for a new leave year, or after the policy
 *        changed). Existing entries are topped up, never duplicated.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, ok, parseSearchParams, userAgent } from '@/lib/utils/api-response';
import { accrueLeave, leaveLedgerReport } from '@/services/payroll.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: Request) {
  try {
    const user = await requireAdminApi(['leave.read']);
    const params = parseSearchParams(request);
    const rows = await leaveLedgerReport({
      employerId: Number(params.get('employer_id')) || null,
      employeeId: Number(params.get('employee_id')) || null,
      year: Number(params.get('year')) || null,
      scopeEmployerId: user.employerId ?? null,
      scopeEmployeeId: user.employeeId ?? null,
      limit: Math.min(Number(params.get('limit') ?? 500), 1000),
    });
    return ok(rows, { extra: { count: rows.length } });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/payroll/leave/ledger', method: 'GET' });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAdminApi(['leave.create']);
    const body = (await request.json().catch(() => ({}))) as { employer_id?: number; year?: number };
    const result = await accrueLeave(Number(body.employer_id ?? 0), Number(body.year ?? new Date().getFullYear()), {
      user, ip: clientIp(request), userAgent: userAgent(request),
    });
    return ok(result, {
      message: `Leave accrued for ${result.employees} employee(s) across ${result.types} leave type(s)`,
    });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/payroll/leave/ledger', method: 'POST' });
  }
}
