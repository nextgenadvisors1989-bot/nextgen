/**
 * /api/admin/calendar/holidays
 *
 * GET  — the holiday master: filters by year, type, scope and paid status, with
 *        the year's counters and the list of years already populated.
 * POST — declares a holiday. The same name on the same date for the same scope
 *        is refused, because a duplicated holiday silently costs a working day.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, created, handleRouteError, ok, parseSearchParams, userAgent } from '@/lib/utils/api-response';
import { holidayListQuerySchema } from '@/lib/validations/calendar.validation';
import { createHoliday, listHolidays } from '@/services/calendar.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function numberOrNull(value: unknown): number | null {
  if (value === undefined || value === null || value === '' || value === 'all') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export async function GET(request: Request) {
  try {
    await requireAdminApi(['holiday.read']);
    const params = parseSearchParams(request);
    const filters = holidayListQuerySchema.parse(Object.fromEntries(params));
    const result = await listHolidays({
      page: filters.page,
      limit: filters.limit,
      search: filters.search ?? null,
      sortBy: filters.sortBy ?? null,
      sortDir: filters.sortDir ?? null,
      year: numberOrNull(filters.year) ?? null,
      holidayType: filters.holiday_type,
      employerId: numberOrNull(filters.employer_id),
      paid: filters.paid,
      fromDate: filters.from_date || null,
      toDate: filters.to_date || null,
    });
    return ok(result.data, {
      pagination: result.pagination,
      extra: { stats: result.stats, years: result.years },
    });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/calendar/holidays', method: 'GET' });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAdminApi(['holiday.create']);
    const result = await createHoliday(await request.json(), {
      user, ip: clientIp(request), userAgent: userAgent(request),
    });
    return created(result, `Holiday declared on ${result.holiday_date}`);
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/calendar/holidays', method: 'POST' });
  }
}
