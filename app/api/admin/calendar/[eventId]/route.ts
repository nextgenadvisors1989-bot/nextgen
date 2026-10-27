/**
 * /api/admin/calendar/[eventId]
 *
 * GET    — one event with its employer, unit, audit, auditor and attendees.
 * PUT    — the whole event. Moving or re-arming it clears the reminder flag so
 *          the reminder can fire again for the new time.
 * PATCH  — a status-only move: complete, cancel or reschedule.
 * DELETE — removes the event from the calendar. Events written by another
 *          module are refused unless the caller confirms, because the owning
 *          register is the place to cancel those.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, notFound, ok, userAgent } from '@/lib/utils/api-response';
import { MANUAL_EVENT_TYPES } from '@/lib/validations/calendar.validation';
import { deleteEvent, getEvent, setEventStatus, updateEvent } from '@/services/calendar.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseId(value: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const id = parseId((await params).eventId);
  if (!id) return notFound('Event');
  try {
    await requireAdminApi(['calendar.read']);
    return ok(await getEvent(id));
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/calendar/[eventId]', method: 'GET' });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const id = parseId((await params).eventId);
  if (!id) return notFound('Event');
  try {
    const user = await requireAdminApi(['calendar.update']);
    const result = await updateEvent(id, await request.json(), {
      user, ip: clientIp(request), userAgent: userAgent(request),
    }, undefined, { allowedTypes: MANUAL_EVENT_TYPES });
    return ok(result, { message: `Event updated (${result.changed.length} field(s))` });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/calendar/[eventId]', method: 'PUT' });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const id = parseId((await params).eventId);
  if (!id) return notFound('Event');
  try {
    const user = await requireAdminApi(['calendar.update']);
    const body = (await request.json()) as { status?: string };
    const allowed = ['scheduled', 'completed', 'cancelled', 'rescheduled'];
    if (!body?.status || !allowed.includes(body.status)) {
      return notFound('Status — use one of scheduled, completed, cancelled, rescheduled');
    }
    const result = await setEventStatus(id, body.status, {
      user, ip: clientIp(request), userAgent: userAgent(request),
    });
    return ok(result, { message: `Event marked ${result.status}` });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/calendar/[eventId]', method: 'PATCH' });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const id = parseId((await params).eventId);
  if (!id) return notFound('Event');
  try {
    const user = await requireAdminApi(['calendar.delete']);
    const body = await request.json().catch(() => ({}));
    const result = await deleteEvent(id, body ?? {}, {
      user, ip: clientIp(request), userAgent: userAgent(request),
    });
    return ok(result, { message: 'Event removed from the calendar' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/calendar/[eventId]', method: 'DELETE' });
  }
}
