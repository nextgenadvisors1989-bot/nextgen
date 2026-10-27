/**
 * GET /api/admin/calendar/agenda
 *
 * The merged agenda for an arbitrary window (`from_date` / `to_date`, defaulting
 * to the month). The admin calendar includes every source; the smaller panels
 * ask for the subset they are entitled to see.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { handleRouteError, ok, parseSearchParams } from '@/lib/utils/api-response';
import { agenda } from '@/services/calendar.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireAdminApi(['calendar.read']);
    const params = parseSearchParams(request);
    const result = await agenda(Object.fromEntries(params), {
      includeExpiries: true,
      includePayroll: true,
      includeHolidays: true,
      includeLeave: true,
    });
    return ok(result.entries, { extra: { from: result.from, to: result.to, counts: result.counts, days: result.days } });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/calendar/agenda', method: 'GET' });
  }
}
