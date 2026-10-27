/**
 * GET  /api/admin/compliance/notifications — the gazette notification register
 * POST /api/admin/compliance/notifications — registers one
 *
 * (Distinct from /api/notifications, which is the in-app notification centre.)
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, created, handleRouteError, ok, parseSearchParams, userAgent } from '@/lib/utils/api-response';
import { notificationListQuerySchema } from '@/lib/validations/compliance.validation';
import { createNotificationRegisterRow, listNotificationRegister } from '@/services/compliance.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireAdminApi(['compliance_notification.read']);
    const filters = notificationListQuerySchema.parse(Object.fromEntries(parseSearchParams(request)));
    const result = await listNotificationRegister(filters);
    return ok(result.data, {
      pagination: result.pagination,
      extra: { stats: result.stats, actOptions: result.actOptions },
    });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/compliance/notifications', method: 'GET' });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAdminApi(['compliance_notification.create']);
    const result = await createNotificationRegisterRow(await request.json(), { user, ip: clientIp(request), userAgent: userAgent(request) });
    return created(result, `Notification ${result.notificationNumber} registered`);
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/compliance/notifications', method: 'POST' });
  }
}
