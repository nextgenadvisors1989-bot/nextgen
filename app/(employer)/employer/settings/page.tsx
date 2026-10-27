import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/breadcrumb';
import { requirePageUser } from '@/lib/auth/permission-check';
import { AccountSettings, type AccountSettingsUser } from '@/components/settings/account-settings';
import { NotificationPreferences } from '@/components/notifications/notification-preferences';

export const metadata: Metadata = { title: 'Settings' };
export const dynamic = 'force-dynamic';

export default async function EmployerSettingsPage() {
  const user = await requirePageUser();
  const account: AccountSettingsUser = {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    username: user.username,
    mobile: user.mobile,
    primaryRole: user.primaryRole,
    roles: user.roles.map((role) => role.name),
    lastLoginAt: user.lastLoginAt,
    dashboardPath: user.dashboardPath,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Your own sign-in and how you want to be told about audits, compliance dates and payroll."
        breadcrumbs={[{ label: 'Dashboard', href: '/employer/dashboard' }, { label: 'Settings' }]}
      />
      <AccountSettings user={account} notificationBasePath="/employer/notifications" />
      <NotificationPreferences />
    </div>
  );
}
