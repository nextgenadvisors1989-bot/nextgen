import { requireUser } from '@/lib/auth/permission-check';
import { markNotificationsRead } from '@/lib/notifications/notification-service';
import { handleRouteError, ok } from '@/lib/utils/api-response';

export const runtime = 'nodejs';

/** POST /api/notifications/mark-read — Body: { notification_ids?: number[] } */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { notification_ids?: number[] };
  try {
    const user = await requireUser();
    const updated = await markNotificationsRead(user.id, body.notification_ids);
    return ok({ updated }, { message: 'Notifications marked as read' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/notifications/mark-read', method: 'POST', body });
  }
}
