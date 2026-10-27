/**
 * /api/admin/calendar/holidays/[holidayId]
 *
 * GET    — one holiday.
 * PUT    — edits it, re-deriving the year from the date.
 * DELETE — removes it from the master. Holidays are soft-deleted, so the row
 *          survives for the activity trail even after the date passes.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, notFound, ok, userAgent } from '@/lib/utils/api-response';
import { deleteHoliday, getHoliday, updateHoliday } from '@/services/calendar.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseId(value: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ holidayId: string }> }) {
  const id = parseId((await params).holidayId);
  if (!id) return notFound('Holiday');
  try {
    await requireAdminApi(['holiday.read']);
    return ok(await getHoliday(id));
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/calendar/holidays/[holidayId]', method: 'GET' });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ holidayId: string }> }) {
  const id = parseId((await params).holidayId);
  if (!id) return notFound('Holiday');
  try {
    const user = await requireAdminApi(['holiday.update']);
    const result = await updateHoliday(id, await request.json(), {
      user, ip: clientIp(request), userAgent: userAgent(request),
    });
    return ok(result, { message: `Holiday updated (${result.changed.length} field(s))` });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/calendar/holidays/[holidayId]', method: 'PUT' });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ holidayId: string }> }) {
  const id = parseId((await params).holidayId);
  if (!id) return notFound('Holiday');
  try {
    const user = await requireAdminApi(['holiday.delete']);
    const result = await deleteHoliday(id, { user, ip: clientIp(request), userAgent: userAgent(request) });
    return ok(result, { message: 'Holiday removed from the master' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/calendar/holidays/[holidayId]', method: 'DELETE' });
  }
}
