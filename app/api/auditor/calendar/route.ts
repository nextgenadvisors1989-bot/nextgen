/**
 * /api/auditor/calendar — the auditor's own diary.
 *
 * GET  — every event assigned to this auditor (audit dates and closing meetings
 *        written by the assignment module included), with the counters and the
 *        free-text filters the screen offers.
 * POST — an auditor's own event: a meeting, a training day or a reminder. The
 *        auditor id always comes from the session, so an event cannot be filed
 *        against a colleague, and platform-owned event types are refused.
 */
import { requireAuditorApi } from '@/lib/auth/api-guards';
import { clientIp, created, handleRouteError, ok, parseSearchParams, userAgent } from '@/lib/utils/api-response';
import { calendarEventListQuerySchema, MANUAL_EVENT_TYPES } from '@/lib/validations/calendar.validation';
import { createEvent, listEvents } from '@/services/calendar.service';

/**
 * An auditor's diary is scoped to their own `auditors` row. If the signed-in
 * account has no such row there is nothing to scope to — and an unscoped read
 * would hand over the whole platform calendar — so the panel refuses instead.
 */
function requireAuditorScope(user: { auditorId: number | null }): number {
  const auditorId = Number(user.auditorId ?? 0);
  if (!auditorId) {
    throw Object.assign(
      new Error('This account is not linked to an auditor profile, so it has no diary. Ask an administrator to link it.'),
      { code: 'FORBIDDEN' }
    );
  }
  return auditorId;
}


export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const user = await requireAuditorApi(['calendar.read']);
    const auditorId = requireAuditorScope(user);
    const params = parseSearchParams(request);
    const filters = calendarEventListQuerySchema.parse(Object.fromEntries(params));
    const scope = { auditorId };
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
      fromDate: filters.from_date || null,
      toDate: filters.to_date || null,
      window: filters.window,
      scope,
    });
    return ok(result.data, { pagination: result.pagination, extra: { stats: result.stats } });
  } catch (error) {
    return handleRouteError(error, { route: '/api/auditor/calendar', method: 'GET' });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuditorApi(['calendar.create']);
    const auditorId = requireAuditorScope(user);
    const result = await createEvent(await request.json(), {
      user, ip: clientIp(request), userAgent: userAgent(request),
    }, {
      allowedTypes: MANUAL_EVENT_TYPES,
      scope: { auditorId },
    });
    return created(result, `“${result.title}” added to your diary for ${result.start_datetime}`);
  } catch (error) {
    return handleRouteError(error, { route: '/api/auditor/calendar', method: 'POST' });
  }
}
