import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePageUser } from '@/lib/auth/permission-check';
import { getNotificationRegisterRow } from '@/services/compliance.service';
import { NotificationForm, type NotificationFormValues } from '@/components/compliance/notification-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Edit Gazette Notification' };

export default async function EditNotificationPage({ params }: { params: Promise<{ notificationId: string }> }) {
  const { notificationId } = await params;
  const id = Number(notificationId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  await requirePageUser();
  let data;
  try {
    data = await getNotificationRegisterRow(id);
  } catch (error) {
    if ((error as { code?: string }).code === 'NOT_FOUND') notFound();
    throw error;
  }

  const row = data.notification as Record<string, unknown>;
  const date = (value: unknown) => (value ? String(value).slice(0, 10) : '');
  const initial: NotificationFormValues = {
    id,
    notification_number: String(row.notification_number ?? ''),
    title: String(row.title ?? ''),
    notification_date: date(row.notification_date),
    issuing_authority: String(row.issuing_authority ?? ''),
    act_id: row.act_id ? String(row.act_id) : '',
    gazette_reference: String(row.gazette_reference ?? ''),
    subject: String(row.subject ?? ''),
    body: String(row.body ?? ''),
    effective_date: date(row.effective_date),
    applicability: String(row.applicability ?? ''),
    action_required: String(row.action_required ?? ''),
    status: String(row.status ?? 'active'),
  };

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-ink">Edit {initial.notification_number}</h1>
        <p className="mt-1 text-sm text-ink-muted">Changes are recorded in the notification&apos;s activity history.</p>
      </header>
      <NotificationForm mode="edit" initial={initial} />
    </div>
  );
}
