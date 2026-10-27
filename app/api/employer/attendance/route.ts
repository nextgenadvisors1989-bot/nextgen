/**
 * /api/employer/attendance
 *
 * GET  — this company's attendance register for a month, unit, department,
 *        employee or status.
 * POST — marks one day (or corrects it) for one of this company's employees.
 * PUT  — marks the month in bulk: the default status for every working day, the
 *        named exceptions on top, weekly offs and holidays from the calendar.
 */
import { requireEmployerApi } from '@/lib/auth/api-guards';
import { clientIp, created, handleRouteError, ok, parseSearchParams, userAgent } from '@/lib/utils/api-response';
import { attendanceListQuerySchema } from '@/lib/validations/payroll.validation';
import { bulkAttendance, listAttendance, recordAttendance } from '@/services/payroll.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: Request) {
  try {
    const user = await requireEmployerApi(['attendance.read']);
    const employerId = Number(user.employerId ?? 0);
    if (!employerId) return ok([], { pagination: { total: 0, page: 1, limit: 10, totalPages: 0, from: 0, to: 0 } });
    const filters = attendanceListQuerySchema.parse(Object.fromEntries(parseSearchParams(request)));
    const result = await listAttendance({
      page: filters.page,
      limit: filters.limit,
      search: filters.search ?? null,
      sortBy: filters.sortBy ?? null,
      sortDir: filters.sortDir ?? null,
      employerId,
      scopeEmployerId: employerId,
      unitId: typeof filters.unit_id === 'number' ? filters.unit_id : null,
      departmentId: typeof filters.department_id === 'number' ? filters.department_id : null,
      employeeId: filters.employee_id ?? null,
      month: typeof filters.month === 'number' ? filters.month : null,
      year: typeof filters.year === 'number' ? filters.year : null,
      status: filters.status,
      fromDate: filters.from_date || null,
      toDate: filters.to_date || null,
    });
    return ok(result.data, { pagination: result.pagination, extra: { stats: result.stats } });
  } catch (error) {
    return handleRouteError(error, { route: '/api/employer/attendance', method: 'GET' });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireEmployerApi(['attendance.create']);
    const result = await recordAttendance(await request.json(), {
      user, ip: clientIp(request), userAgent: userAgent(request),
    }, { employerId: Number(user.employerId ?? 0) || null });
    return created(result, `Attendance recorded as ${result.status} for ${result.attendance_date}`);
  } catch (error) {
    return handleRouteError(error, { route: '/api/employer/attendance', method: 'POST' });
  }
}

export async function PUT(request: Request) {
  try {
    const user = await requireEmployerApi(['attendance.upload']);
    const result = await bulkAttendance(await request.json(), {
      user, ip: clientIp(request), userAgent: userAgent(request),
    }, { employerId: Number(user.employerId ?? 0) || null });
    return ok(result, { message: `${result.days} day(s) marked for ${result.employees} employee(s)` });
  } catch (error) {
    return handleRouteError(error, { route: '/api/employer/attendance', method: 'PUT' });
  }
}
