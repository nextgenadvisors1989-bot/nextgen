import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/breadcrumb';
import { requirePageUser } from '@/lib/auth/permission-check';
import { AllNotifications } from '@/components/notifications/all-notifications';

export const metadata: Metadata = { title: 'Notifications' };
export const dynamic = 'force-dynamic';

export default async function EmployeePage() {
  await requirePageUser();
  return (
    <div className="space-y-6">
      <PageHeader
        title='Notifications'
        description='Everything the platform has told this account — leave decisions, payslips and account events.'
        breadcrumbs={[
          { label: 'Dashboard', href: '/employee/dashboard' },
          { label: 'Notifications' },
        ]}
      />
      <AllNotifications heading="Your notifications" />
    </div>
  );
}
