/**
 * /api/admin/calendar
 *
 * GET  — the event register: every filter the screen offers, sorting,
 *        pagination and the counters the header renders.
 * POST — a hand-made event: a meeting, a training session, an inspection, a
 *        reminder. Events owned by other modules (an audit date, a payroll
 *        period) are not creatable here — they travel with their module.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, created, handleRouteError, ok, parseSearchParams, userAgent } from '@/lib/utils/api-response';
import { calendarEventListQuerySchema, MANUAL_EVENT_TYPES } from '@/lib/validations/calendar.validation';
import { createEvent, listEvents } from '@/services/calendar.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireAdminApi(['calendar.read']);
    const params = parseSearchParams(request);
    const filters = calendarEventListQuerySchema.parse(Object.fromEntries(params));
    const result = await listEvents({
      page: filters.page,
      limit: filters.limit,
      search: filters.search ?? null,
      sortBy: filters.sortBy ?? null,
      sortDir: filters.sortDir ?? null,
      eventType: filters.event_type,
      status: filters.status,
      priority: filters.priority,
      visibility: filters.visibility,
      employerId: filters.employer_id ?? null,
      unitId: filters.unit_id ?? null,
      auditorId: filters.auditor_id ?? null,
      createdBy: filters.created_by ?? null,
      fromDate: filters.from_date || null,
      toDate: filters.to_date || null,
      window: filters.window,
    });
    return ok(result.data, {
      pagination: result.pagination,
      extra: { stats: result.stats },
    });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/calendar', method: 'GET' });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAdminApi(['calendar.create']);
    const result = await createEvent(await request.json(), {
      user,
      ip: clientIp(request),
      userAgent: userAgent(request),
    }, { allowedTypes: MANUAL_EVENT_TYPES });
    return created(result, `“${result.title}” added to the calendar for ${result.start_datetime}`);
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/calendar', method: 'POST' });
  }
}
