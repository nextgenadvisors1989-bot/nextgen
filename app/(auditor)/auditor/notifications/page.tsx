import type { Metadata } from 'next';
import { requirePageUser } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { AllNotifications } from '@/components/notifications/all-notifications';

export const metadata: Metadata = { title: 'Notifications' };
export const dynamic = 'force-dynamic';

export default async function AuditorNotificationsPage() {
  const user = await requirePageUser();
  return (
    <div className="space-y-6">
      <PageHeader
        title='Notifications'
        description='Everything the platform has told this account — audits, reports and account events.'
        breadcrumbs={[
          { label: 'Dashboard', href: '/auditor/dashboard' },
          { label: 'Notifications' },
        ]}
      />
      <AllNotifications heading="Your notifications" />
    </div>
  );
}
