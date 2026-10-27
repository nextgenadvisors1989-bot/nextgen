/**
 * GET /api/admin/calendar/options — the pickers on the event form: employers,
 * their units, auditors and the audits still open, each with the id the event
 * links to.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { handleRouteError, ok } from '@/lib/utils/api-response';
import { calendarOptions } from '@/services/calendar.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireAdminApi(['calendar.read']);
    return ok(await calendarOptions());
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/calendar/options', method: 'GET' });
  }
}
