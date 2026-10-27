/**
 * GET /api/admin/calendar/overview
 *
 * Everything the calendar screen renders in one read: the per-day counts for the
 * month grid, the merged agenda (events, compliance expiries, payroll periods,
 * holidays, approved leave), the counters and the next few events.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { handleRouteError, ok, parseSearchParams } from '@/lib/utils/api-response';
import { calendarOverview } from '@/services/calendar.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireAdminApi(['calendar.read']);
    const params = parseSearchParams(request);
    const result = await calendarOverview(Object.fromEntries(params), {
      includeExpiries: true,
      includePayroll: true,
      includeHolidays: true,
      includeLeave: true,
    });
    return ok(result);
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/calendar/overview', method: 'GET' });
  }
}
