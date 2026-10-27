import type { Metadata } from 'next';
import { requirePageUser } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { AllNotifications } from '@/components/notifications/all-notifications';

export const metadata: Metadata = { title: 'Notifications' };
export const dynamic = 'force-dynamic';

export default async function AdminNotificationsPage() {
  await requirePageUser();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description="Everything the platform has told this account — audits, compliance dates, payroll and account events."
        breadcrumbs={[{ label: 'Dashboard', href: '/admin/dashboard' }, { label: 'Notifications' }]}
      />
      <AllNotifications heading="Your notifications" />
    </div>
  );
}
