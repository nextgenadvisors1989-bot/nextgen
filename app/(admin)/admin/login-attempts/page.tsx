import type { Metadata } from 'next';
import { requirePanel, hasPermission } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { LoginAttemptsTable } from '@/components/logs/login-attempts-table';

export const metadata: Metadata = { title: 'Login Attempts' };
export const dynamic = 'force-dynamic';

export default async function LoginAttemptsPage() {
  const user = await requirePanel(['admin', 'super_admin']);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Login Attempts"
        description="Every sign-in, successful or refused, with the reason it was rejected, the address it came from and the client that made it. Locked accounts and repeated failures surface at the top."
        breadcrumbs={[{ label: 'Dashboard', href: '/admin/dashboard' }, { label: 'Login Attempts' }]}
      />
      {hasPermission(user.permissions, 'activity_log.read') ? (
        <LoginAttemptsTable canExport={hasPermission(user.permissions, 'activity_log.export')} />
      ) : (
        <p className="rounded-lg border border-line bg-surface-muted px-4 py-3 text-sm text-ink-soft">
          Your role does not include <span className="font-medium">activity_log.read</span>. Ask an administrator to
          grant it from Roles &amp; Permissions.
        </p>
      )}
    </div>
  );
}
