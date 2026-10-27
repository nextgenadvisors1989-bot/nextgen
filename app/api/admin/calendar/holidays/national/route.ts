/**
 * POST /api/admin/calendar/holidays/national
 *
 * Declares the three national holidays that fall on the same date every year —
 * Republic Day, Independence Day and Gandhi Jayanti — for a year and a scope.
 * Rows already declared are reported as skipped rather than duplicated, so the
 * button is safe to press twice.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, created, handleRouteError, userAgent } from '@/lib/utils/api-response';
import { addNationalHolidays } from '@/services/calendar.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const user = await requireAdminApi(['holiday.create']);
    const result = await addNationalHolidays(await request.json(), {
      user, ip: clientIp(request), userAgent: userAgent(request),
    });
    return created(result, result.added.length
      ? `${result.added.length} national holiday(s) added for ${result.year}${result.skipped.length ? ` — ${result.skipped.length} already declared` : ''}`
      : `All ${result.total} national holidays for ${result.year} were already declared`);
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/calendar/holidays/national', method: 'POST' });
  }
}
