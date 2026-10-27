import type { Metadata } from 'next';
import { requirePageUser, hasPermission } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { NotificationTemplates } from '@/components/notifications/notification-templates';

export const metadata: Metadata = { title: 'Notification Templates' };
export const dynamic = 'force-dynamic';

/**
 * The wording of every message the platform sends. Editing here changes what
 * recipients read on the next dispatch — the shipped text is always kept beside
 * the edit, so a template can be put back.
 */
export default async function AdminNotificationTemplatesPage() {
  const user = await requirePageUser();
  const canEdit = hasPermission(user.permissions, 'settings.update');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notification Templates"
        description={canEdit
          ? 'The wording of every message the platform sends, by channel. Variables are filled in when the message goes out.'
          : 'The wording of every message the platform sends. Your role can read them but not change them.'}
        breadcrumbs={[
          { label: 'Dashboard', href: '/admin/dashboard' },
          { label: 'Notifications', href: '/admin/notifications' },
          { label: 'Templates' },
        ]}
      />
      <NotificationTemplates />
    </div>
  );
}
