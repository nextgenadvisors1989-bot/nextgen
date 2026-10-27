/**
 * GET /api/admin/payroll/leave
 *
 * Leave applications across the platform — who asked for what, whether it was
 * paid, and where it stands — with the counters the monitoring screen shows.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { handleRouteError, ok, parseSearchParams } from '@/lib/utils/api-response';
import { listLeaveApplications } from '@/services/payroll.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireAdminApi(['leave.read']);
    const params = parseSearchParams(request);
    const result = await listLeaveApplications({
      page: Number(params.get('page') ?? 1),
      limit: Math.min(Number(params.get('limit') ?? 10), 100),
      search: params.get('search'),
      sortBy: params.get('sortBy'),
      sortDir: (params.get('sortDir') as 'asc' | 'desc' | null) ?? null,
      employerId: Number(params.get('employer_id')) || null,
      employeeId: Number(params.get('employee_id')) || null,
      leaveTypeId: Number(params.get('leave_type_id')) || null,
      status: params.get('status') ?? 'all',
      fromDate: params.get('from_date') || null,
      toDate: params.get('to_date') || null,
    });
    return ok(result.data, { pagination: result.pagination, extra: { stats: result.stats } });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/payroll/leave', method: 'GET' });
  }
}
