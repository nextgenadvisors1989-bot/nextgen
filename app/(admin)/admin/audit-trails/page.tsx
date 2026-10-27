import type { Metadata } from 'next';
import { requirePanel, hasPermission } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { AuditTrailsTable } from '@/components/logs/audit-trails-table';

export const metadata: Metadata = { title: 'Audit Trails' };
export const dynamic = 'force-dynamic';

export default async function AuditTrailsPage() {
  const user = await requirePanel(['admin', 'super_admin']);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Trails"
        description="Field-by-field change history for compliance-critical records: which column changed, from what to what, by whom and why. Where the activity log records the action, this records the exact difference."
        breadcrumbs={[{ label: 'Dashboard', href: '/admin/dashboard' }, { label: 'Audit Trails' }]}
      />
      {hasPermission(user.permissions, 'activity_log.read') ? (
        <AuditTrailsTable canExport={hasPermission(user.permissions, 'activity_log.export')} />
      ) : (
        <p className="rounded-lg border border-line bg-surface-muted px-4 py-3 text-sm text-ink-soft">
          Your role does not include <span className="font-medium">activity_log.read</span>. Ask an administrator to
          grant it from Roles &amp; Permissions.
        </p>
      )}
    </div>
  );
}
