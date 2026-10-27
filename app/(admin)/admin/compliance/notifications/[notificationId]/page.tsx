import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePageUser, hasPermission } from '@/lib/auth/permission-check';
import { getNotificationRegisterRow } from '@/services/compliance.service';
import { NotificationDetail } from '@/components/compliance/notification-detail';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ notificationId: string }> }): Promise<Metadata> {
  const { notificationId } = await params;
  try {
    const data = await getNotificationRegisterRow(Number(notificationId));
    return { title: data.notification.title };
  } catch {
    return { title: 'Gazette Notification' };
  }
}

export default async function NotificationDetailPage({ params }: { params: Promise<{ notificationId: string }> }) {
  const { notificationId } = await params;
  const id = Number(notificationId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const user = await requirePageUser();
  let data;
  try {
    data = await getNotificationRegisterRow(id);
  } catch (error) {
    if ((error as { code?: string }).code === 'NOT_FOUND') notFound();
    throw error;
  }

  return (
    <NotificationDetail
      notification={JSON.parse(JSON.stringify(data.notification))}
      canUpdate={hasPermission(user.permissions, 'compliance_notification.update')}
    />
  );
}
