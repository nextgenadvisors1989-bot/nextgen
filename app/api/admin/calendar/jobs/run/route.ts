/**
 * POST /api/admin/calendar/jobs/run — runs the event-reminder job now.
 *
 * The cron calls the same job every fifteen minutes; this endpoint exists so an
 * administrator who has just created an event with a reminder attached can see
 * it dispatched without waiting for the tick. The dispatch ledger keeps it
 * idempotent, so pressing the button twice sends nothing twice.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { handleRouteError, ok } from '@/lib/utils/api-response';
import { runCalendarEventReminders } from '@/lib/notifications/reminder-jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST() {
  try {
    await requireAdminApi(['calendar.update']);
    const result = await runCalendarEventReminders();
    return ok(result, {
      message: result.dispatched
        ? `${result.dispatched} reminder(s) dispatched across ${result.candidates} due event(s)`
        : `Nothing was due — ${result.candidates} event(s) in the reminder window had already been reminded`,
    });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/calendar/jobs/run', method: 'POST' });
  }
}
