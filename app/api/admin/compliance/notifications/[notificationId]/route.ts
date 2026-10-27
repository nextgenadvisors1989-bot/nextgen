/**
 * GET /api/admin/compliance/notifications/[notificationId]
 * PUT /api/admin/compliance/notifications/[notificationId]
 * DELETE /api/admin/compliance/notifications/[notificationId]
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, notFound, ok, userAgent } from '@/lib/utils/api-response';
import {
  deleteNotificationRegisterRow, getNotificationRegisterRow, updateNotificationRegisterRow,
} from '@/services/compliance.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function registerKey(params: Promise<{ notificationId: string }>) {
  const { notificationId } = await params;
  const id = Number(notificationId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ notificationId: string }> }) {
  const id = await registerKey(params);
  if (!id) return notFound('Notification');
  try {
    await requireAdminApi(['compliance_notification.read']);
    return ok(await getNotificationRegisterRow(id));
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/compliance/notifications/[notificationId]', method: 'GET' });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ notificationId: string }> }) {
  const id = await registerKey(params);
  if (!id) return notFound('Notification');
  try {
    const user = await requireAdminApi(['compliance_notification.update']);
    const result = await updateNotificationRegisterRow(id, await request.json(), { user, ip: clientIp(request), userAgent: userAgent(request) });
    return ok(result, { message: 'Notification updated' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/compliance/notifications/[notificationId]', method: 'PUT' });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ notificationId: string }> }) {
  const id = await registerKey(params);
  if (!id) return notFound('Notification');
  try {
    const user = await requireAdminApi(['compliance_notification.delete']);
    const result = await deleteNotificationRegisterRow(id, { user, ip: clientIp(request), userAgent: userAgent(request) });
    return ok(result, { message: 'Notification removed' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/compliance/notifications/[notificationId]', method: 'DELETE' });
  }
}
