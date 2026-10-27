import type { Metadata } from 'next';
import { requirePageUser } from '@/lib/auth/permission-check';
import { NotificationForm } from '@/components/compliance/notification-form';

export const metadata: Metadata = { title: 'Register Gazette Notification' };
export const dynamic = 'force-dynamic';

export default async function CreateNotificationPage() {
  await requirePageUser();
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-ink">Register a Notification</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Notification numbers must be unique — the register is the reference employers and auditors cite.
        </p>
      </header>
      <NotificationForm mode="create" />
    </div>
  );
}
