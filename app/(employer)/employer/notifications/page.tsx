import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/breadcrumb';
import { requirePageUser } from '@/lib/auth/permission-check';
import { AllNotifications } from '@/components/notifications/all-notifications';

export const metadata: Metadata = { title: 'Notifications' };
export const dynamic = 'force-dynamic';

export default async function EmployerNotificationsPage() {
  await requirePageUser();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description="Everything the platform has told this account — audits, compliance dates and payroll events."
        breadcrumbs={[{ label: 'Dashboard', href: '/employer/dashboard' }, { label: 'Notifications' }]}
      />
      <AllNotifications heading="Your notifications" />
    </div>
  );
}
