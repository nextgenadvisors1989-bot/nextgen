/**
 * /api/employee/leave
 *
 * GET  — the employee's own leave applications with their status counters.
 * POST — applies for leave: the balance in the ledger is checked, weekly offs
 *        and holidays inside the range are not counted as leave, and the
 *        approvers are notified.
 */
import { requireEmployeeApi } from '@/lib/auth/api-guards';
import { clientIp, created, handleRouteError, ok, parseSearchParams, userAgent } from '@/lib/utils/api-response';
import { applyLeave, listLeaveApplications } from '@/services/payroll.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const user = await requireEmployeeApi(['leave.read']);
    const employeeId = Number(user.employeeId ?? 0);
    if (!employeeId) return ok([], { pagination: { total: 0, page: 1, limit: 10, totalPages: 0, from: 0, to: 0 } });
    const params = parseSearchParams(request);
    const result = await listLeaveApplications({
      page: Number(params.get('page') ?? 1),
      limit: Math.min(Number(params.get('limit') ?? 10), 100),
      search: params.get('search'),
      sortBy: params.get('sortBy'),
      sortDir: (params.get('sortDir') as 'asc' | 'desc' | null) ?? null,
      employeeId,
      scopeEmployeeId: employeeId,
      leaveTypeId: Number(params.get('leave_type_id')) || null,
      status: params.get('status') ?? 'all',
      fromDate: params.get('from_date') || null,
      toDate: params.get('to_date') || null,
    });
    return ok(result.data, { pagination: result.pagination, extra: { stats: result.stats } });
  } catch (error) {
    return handleRouteError(error, { route: '/api/employee/leave', method: 'GET' });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireEmployeeApi(['leave.create']);
    const body = (await request.json()) as Record<string, unknown>;
    // The schema requires an employee; on this route it is always the signed-in
    // employee, never a value the request could choose.
    const result = await applyLeave({ ...body, employee_id: Number(user.employeeId ?? 0) }, {
      user, ip: clientIp(request), userAgent: userAgent(request),
    }, { employeeId: Number(user.employeeId ?? 0) });
    return created(result, `Leave application ${result.application_number} submitted — ${result.total_days} day(s)`);
  } catch (error) {
    return handleRouteError(error, { route: '/api/employee/leave', method: 'POST' });
  }
}
