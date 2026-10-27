/**
 * GET /api/auditor/calendar/overview
 *
 * The auditor's month: their own events merged with the holiday master. The
 * compliance, payroll and leave feeds belong to other panels, so they are asked
 * for explicitly — never inherited by accident.
 */
import { requireAuditorApi } from '@/lib/auth/api-guards';
import { handleRouteError, ok, parseSearchParams } from '@/lib/utils/api-response';
import { agenda } from '@/services/calendar.service';

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
    const result = await agenda(Object.fromEntries(params), {
      auditorId,
      includeExpiries: false,
      includePayroll: false,
      includeLeave: false,
      includeHolidays: true,
    });
    return ok(result.entries, { extra: { from: result.from, to: result.to, counts: result.counts, days: result.days } });
  } catch (error) {
    return handleRouteError(error, { route: '/api/auditor/calendar/overview', method: 'GET' });
  }
}
