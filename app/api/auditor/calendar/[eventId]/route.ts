/**
 * /api/auditor/calendar/[eventId]
 *
 * GET    — one of this auditor's events.
 * PUT    — edits it. Audit dates belong to the assignment module and are not
 *          editable from the diary.
 * PATCH  — marks it complete, cancelled or rescheduled.
 * DELETE — removes it from the diary; system-owned events need an explicit
 *          confirmation because the owning register is where they are cancelled.
 */
import { requireAuditorApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, notFound, ok, userAgent } from '@/lib/utils/api-response';
import { deleteEvent, getEvent, setEventStatus, updateEvent } from '@/services/calendar.service';
import { MANUAL_EVENT_TYPES } from '@/lib/validations/calendar.validation';

/**
 * An auditor's diary is scoped to their own `auditors` row. An account with no
 * auditor profile has no diary to read or write, and an unscoped call would
 * reach the whole platform calendar — so this panel fails closed.
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

/** Event types an auditor may not remove: the owning register cancels them. */
const MODULE_OWNED = ['AUDIT', 'AUDIT_END_MEETING', 'COMPLIANCE_EXPIRY', 'PAYROLL_RUN', 'LEAVE'];


export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATUSES = ['scheduled', 'completed', 'cancelled', 'rescheduled'];

function parseId(value: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const id = parseId((await params).eventId);
  if (!id) return notFound('Event');
  try {
    const user = await requireAuditorApi(['calendar.read']);
    requireAuditorScope(user);
    const event = await getEvent(id);
    if (Number(event.auditor_id ?? 0) !== Number(user.auditorId)) {
      return notFound('Event');
    }
    return ok(event);
  } catch (error) {
    return handleRouteError(error, { route: '/api/auditor/calendar/[eventId]', method: 'GET' });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const id = parseId((await params).eventId);
  if (!id) return notFound('Event');
  try {
    const user = await requireAuditorApi(['calendar.update']);
    const auditorId = requireAuditorScope(user);
    const result = await updateEvent(id, await request.json(), {
      user, ip: clientIp(request), userAgent: userAgent(request),
    }, { auditorId }, { allowedTypes: MANUAL_EVENT_TYPES });
    return ok(result, { message: `Event updated (${result.changed.length} field(s))` });
  } catch (error) {
    return handleRouteError(error, { route: '/api/auditor/calendar/[eventId]', method: 'PUT' });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const id = parseId((await params).eventId);
  if (!id) return notFound('Event');
  try {
    const user = await requireAuditorApi(['calendar.update']);
    const auditorId = requireAuditorScope(user);
    const body = (await request.json()) as { status?: string };
    if (!body?.status || !STATUSES.includes(body.status)) {
      return notFound('Status — use one of scheduled, completed, cancelled, rescheduled');
    }
    const result = await setEventStatus(id, body.status, {
      user, ip: clientIp(request), userAgent: userAgent(request),
    }, { auditorId });
    return ok(result, { message: `Event marked ${result.status}` });
  } catch (error) {
    return handleRouteError(error, { route: '/api/auditor/calendar/[eventId]', method: 'PATCH' });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const id = parseId((await params).eventId);
  if (!id) return notFound('Event');
  try {
    const user = await requireAuditorApi(['calendar.delete']);
    const auditorId = requireAuditorScope(user);
    // An audit date or a closing meeting belongs to the audit register: an
    // auditor may move one, or ask an administrator to remove it, but deleting
    // it here would leave the audit without the date it was planned around.
    const event = await getEvent(id);
    if (Number(event.auditor_id ?? 0) !== auditorId) return notFound('Event');
    const eventType = String((event as unknown as { event_type?: string }).event_type ?? '');
    if (MODULE_OWNED.includes(eventType)) {
      throw Object.assign(
        new Error('This date is kept by the register that created it — ask an administrator to remove it from the calendar.'),
        { code: 'FORBIDDEN' }
      );
    }
    const body = await request.json().catch(() => ({}));
    const result = await deleteEvent(id, body ?? {}, {
      user, ip: clientIp(request), userAgent: userAgent(request),
    }, { auditorId });
    return ok(result, { message: 'Event removed from your diary' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/auditor/calendar/[eventId]', method: 'DELETE' });
  }
}
