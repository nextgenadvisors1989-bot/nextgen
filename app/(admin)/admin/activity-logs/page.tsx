import type { Metadata } from 'next';
import { requirePanel, hasPermission } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { ActivityLogsTable } from '@/components/logs/activity-logs-table';

export const metadata: Metadata = { title: 'Activity Logs' };
export const dynamic = 'force-dynamic';

export default async function ActivityLogsPage() {
  const user = await requirePanel(['admin', 'super_admin']);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Activity Logs"
        description="Every action taken in the platform — who did it, from where, what changed and whether it succeeded. The trail is append-only and written by the same request that performs the work."
        breadcrumbs={[{ label: 'Dashboard', href: '/admin/dashboard' }, { label: 'Activity Logs' }]}
      />
      {hasPermission(user.permissions, 'activity_log.read') ? (
        <ActivityLogsTable canExport={hasPermission(user.permissions, 'activity_log.export')} />
      ) : (
        <p className="rounded-lg border border-line bg-surface-muted px-4 py-3 text-sm text-ink-soft">
          Your role does not include <span className="font-medium">activity_log.read</span>. Ask an administrator to
          grant it from Roles &amp; Permissions.
        </p>
      )}
    </div>
  );
}
