/**
 * /api/employer/calendar — this company's calendar, read-only.
 *
 * One screen shows the month: events filed against the company, its compliance
 * expiry dates, its payroll periods and the holiday master that applies to it.
 * The employer id comes from the session, so a company can only ever read its
 * own rows. Declaring an event or a holiday is an administrator's job, which is
 * why this panel has no POST.
 */
import { requireEmployerApi } from '@/lib/auth/api-guards';
import { handleRouteError, ok, parseSearchParams } from '@/lib/utils/api-response';
import { calendarWindowQuerySchema, monthBounds } from '@/lib/validations/calendar.validation';
import { agenda } from '@/services/calendar.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const user = await requireEmployerApi(['calendar.read']);
    const params = parseSearchParams(request);
    const employerId = user.employerId ?? null;
    if (!employerId) {
      // A portal account that is not attached to a company yet. The month still
      // answers — with nothing in it — rather than leaking the platform's rows.
      const window = calendarWindowQuerySchema.parse(Object.fromEntries(params));
      const bounds = monthBounds(window.year, window.month);
      return ok([], {
        extra: {
          from: bounds.from,
          to: bounds.to,
          counts: [],
          days: { events: 0, expiries: 0, payroll: 0, holidays: 0, leave: 0 },
          note: 'This account is not attached to a company, so there is nothing on its calendar.',
        },
      });
    }
    const result = await agenda(Object.fromEntries(params), {
      employerId,
      panel: 'employer',
      includeExpiries: true,
      includePayroll: true,
      includeHolidays: true,
      includeLeave: true,
    });
    return ok(result.entries, { extra: { from: result.from, to: result.to, counts: result.counts, days: result.days } });
  } catch (error) {
    return handleRouteError(error, { route: '/api/employer/calendar', method: 'GET' });
  }
}
