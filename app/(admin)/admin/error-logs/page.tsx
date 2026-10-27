import type { Metadata } from 'next';
import { requirePanel, hasPermission } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { ErrorLogsTable } from '@/components/logs/error-logs-table';

export const metadata: Metadata = { title: 'Error Logs' };
export const dynamic = 'force-dynamic';

export default async function ErrorLogsPage() {
  const user = await requirePanel(['admin', 'super_admin']);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Error Logs"
        description="Failures the platform captured, with the stack trace, the route that raised them and the request that triggered them. Triage by severity, then resolve the incident with a note that stays on the record."
        breadcrumbs={[{ label: 'Dashboard', href: '/admin/dashboard' }, { label: 'Error Logs' }]}
      />
      {hasPermission(user.permissions, 'activity_log.read') ? (
        <ErrorLogsTable
          canResolve={hasPermission(user.permissions, 'activity_log.update')}
          canExport={hasPermission(user.permissions, 'activity_log.export')}
        />
      ) : (
        <p className="rounded-lg border border-line bg-surface-muted px-4 py-3 text-sm text-ink-soft">
          Your role does not include <span className="font-medium">activity_log.read</span>. Ask an administrator to
          grant it from Roles &amp; Permissions.
        </p>
      )}
    </div>
  );
}
