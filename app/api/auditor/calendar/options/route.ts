/**
 * GET /api/auditor/calendar/options — the audits this auditor may file an event
 * against, and the manual event types they may use.
 */
import { requireAuditorApi } from '@/lib/auth/api-guards';
import { handleRouteError, ok } from '@/lib/utils/api-response';
import { MANUAL_EVENT_TYPES, EVENT_TYPE_LABELS } from '@/lib/validations/calendar.validation';
import { calendarOptions } from '@/services/calendar.service';

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

export async function GET() {
  try {
    const user = await requireAuditorApi(['calendar.read']);
    const options = await calendarOptions({ auditorId: requireAuditorScope(user) });
    return ok({
      ...options,
      eventTypes: MANUAL_EVENT_TYPES.map((type) => ({ value: type, label: EVENT_TYPE_LABELS[type] ?? type })),
    });
  } catch (error) {
    return handleRouteError(error, { route: '/api/auditor/calendar/options', method: 'GET' });
  }
}
