/**
 * GET /api/admin/calendar/working-days
 *
 * Working days per month for a year: calendar days, minus the weekly off, minus
 * the holidays that actually fall on a working day. The payroll engine and the
 * attendance register both count against these numbers, so it is computed in one
 * place from the same rows the calendar shows.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { handleRouteError, ok, parseSearchParams } from '@/lib/utils/api-response';
import { workingDaySummary } from '@/services/calendar.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireAdminApi(['calendar.read']);
    const params = parseSearchParams(request);
    const year = Number(params.get('year') ?? new Date().getFullYear());
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return ok({ error: 'year must be between 2000 and 2100' }, { status: 422 });
    }
    const employerParam = params.get('employer_id');
    const employerId = employerParam && employerParam !== 'all' ? Number(employerParam) : null;
    const offParam = params.get('weekly_off');
    const weeklyOffDay = offParam === null || offParam === '' ? 0 : Number(offParam);
    return ok(await workingDaySummary(year, employerId, Number.isFinite(weeklyOffDay) ? weeklyOffDay : 0));
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/calendar/working-days', method: 'GET' });
  }
}
