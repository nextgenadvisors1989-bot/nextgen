/**
 * /api/admin/payroll/attendance
 *
 * GET  — the attendance register, filterable by company, unit, department,
 *        employee, month, status and date range.
 * POST — marks one day for one employee. Marking the same employee and date
 *        twice corrects the day rather than duplicating it.
 * PUT  — marks a whole month for a scope in one pass: every working day takes
 *        the default status, the exceptions in `rows` overwrite the days they
 *        name, and the weekly offs and holidays come from the calendar.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, created, handleRouteError, ok, parseSearchParams, userAgent } from '@/lib/utils/api-response';
import { attendanceListQuerySchema } from '@/lib/validations/payroll.validation';
import { bulkAttendance, listAttendance, recordAttendance } from '@/services/payroll.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: Request) {
  try {
    await requireAdminApi(['attendance.read']);
    const filters = attendanceListQuerySchema.parse(Object.fromEntries(parseSearchParams(request)));
    const result = await listAttendance({
      page: filters.page,
      limit: filters.limit,
      search: filters.search ?? null,
      sortBy: filters.sortBy ?? null,
      sortDir: filters.sortDir ?? null,
      employerId: typeof filters.employer_id === 'number' ? filters.employer_id : null,
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
    return handleRouteError(error, { route: '/api/admin/payroll/attendance', method: 'GET' });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAdminApi(['attendance.create']);
    const result = await recordAttendance(await request.json(), {
      user, ip: clientIp(request), userAgent: userAgent(request),
    });
    return created(result, `Attendance recorded as ${result.status} for ${result.attendance_date}`);
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/payroll/attendance', method: 'POST' });
  }
}

export async function PUT(request: Request) {
  try {
    const user = await requireAdminApi(['attendance.upload']);
    const result = await bulkAttendance(await request.json(), {
      user, ip: clientIp(request), userAgent: userAgent(request),
    });
    return ok(result, {
      message: `${result.days} day(s) marked for ${result.employees} employee(s)`,
    });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/payroll/attendance', method: 'PUT' });
  }
}
