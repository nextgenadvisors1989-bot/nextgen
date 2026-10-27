import { requireUser } from '@/lib/auth/permission-check';
import { listNotifications, markNotificationsRead } from '@/lib/notifications/notification-service';
import { handleRouteError, ok, parseSearchParams } from '@/lib/utils/api-response';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/notifications?page=&limit=&unread_only=&category= */
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const params = parseSearchParams(request);
    const result = await listNotifications(user.id, {
      page: Number(params.get('page') ?? 1),
      limit: Number(params.get('limit') ?? 20),
      unreadOnly: params.get('unread_only') === 'true',
      category: params.get('category') ?? undefined,
    });
    return ok(result);
  } catch (error) {
    return handleRouteError(error, { route: '/api/notifications', method: 'GET' });
  }
}

/** POST /api/notifications — creates an in-app notification (admin/system use). */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  try {
    const user = await requireUser();
    const { notifyUser } = await import('@/lib/notifications/notification-service');
    const input = body as { user_id?: number; title?: string; message?: string };

    if (!input.user_id || !input.title || !input.message) {
      return ok({ skipped: true }, { message: 'user_id, title and message are required' });
    }

    const result = await notifyUser({
      userId: Number(input.user_id),
      title: input.title,
      message: input.message,
      category: 'SYSTEM',
      channels: ['in_app'],
    });
    return ok(result, { message: 'Notification created' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/notifications', method: 'POST', body });
  }
}
