import type { Metadata } from 'next';
import { requirePageUser, hasPermission } from '@/lib/auth/permission-check';
import { NotificationsTable } from '@/components/compliance/notifications-table';

export const metadata: Metadata = { title: 'Gazette Notifications' };
export const dynamic = 'force-dynamic';

export default async function ComplianceNotificationsPage() {
  const user = await requirePageUser();
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-ink">Gazette Notifications</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Notifications that change what establishments must do — wage ceilings, leave entitlements,
          registration duties — with the action each one requires.
        </p>
      </header>
      <NotificationsTable
        canCreate={hasPermission(user.permissions, 'compliance_notification.create')}
        canUpdate={hasPermission(user.permissions, 'compliance_notification.update')}
        canDelete={hasPermission(user.permissions, 'compliance_notification.delete')}
      />
    </div>
  );
}
