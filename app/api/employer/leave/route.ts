/**
 * /api/employer/leave
 *
 * GET  — this company's leave applications with the counters the ledger screen
 *        shows (pending, approved, refused, days availed this year).
 * POST — records a leave application on an employee's behalf (the paper form the
 *        office enters), through the same balance and working-day checks the
 *        employee's own application goes through.
 */
import { requireEmployerApi } from '@/lib/auth/api-guards';
import { clientIp, created, handleRouteError, ok, parseSearchParams, userAgent } from '@/lib/utils/api-response';
import { applyLeave, listLeaveApplications } from '@/services/payroll.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const user = await requireEmployerApi(['leave.read']);
    const employerId = Number(user.employerId ?? 0);
    if (!employerId) return ok([], { pagination: { total: 0, page: 1, limit: 10, totalPages: 0, from: 0, to: 0 } });
    const params = parseSearchParams(request);
    const result = await listLeaveApplications({
      page: Number(params.get('page') ?? 1),
      limit: Math.min(Number(params.get('limit') ?? 10), 100),
      search: params.get('search'),
      sortBy: params.get('sortBy'),
      sortDir: (params.get('sortDir') as 'asc' | 'desc' | null) ?? null,
      employerId,
      scopeEmployerId: employerId,
      employeeId: Number(params.get('employee_id')) || null,
      leaveTypeId: Number(params.get('leave_type_id')) || null,
      status: params.get('status') ?? 'all',
      fromDate: params.get('from_date') || null,
      toDate: params.get('to_date') || null,
    });
    return ok(result.data, { pagination: result.pagination, extra: { stats: result.stats } });
  } catch (error) {
    return handleRouteError(error, { route: '/api/employer/leave', method: 'GET' });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireEmployerApi(['leave.create']);
    const result = await applyLeave(await request.json(), {
      user, ip: clientIp(request), userAgent: userAgent(request),
    }, { employerId: Number(user.employerId ?? 0) || null });
    return created(result, `Leave application ${result.application_number} recorded — ${result.total_days} day(s)`);
  } catch (error) {
    return handleRouteError(error, { route: '/api/employer/leave', method: 'POST' });
  }
}
