import type { Metadata } from 'next';
import { requirePanel, hasPermission } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { UsersRegister } from '@/components/users/users-register';
import { listRoles } from '@/services/user.service';

export const metadata: Metadata = { title: 'Users' };
export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const user = await requirePanel(['admin', 'super_admin']);

  // Every role is offered as a filter, custom roles included.
  const roles = await listRoles({ page: 1, limit: 200, search: null, sortBy: null, sortDir: 'asc', kind: 'all' });
  const roleOptions = roles.data.map((role) => ({ value: String(role.slug), label: String(role.name) }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description="Every login that can reach the platform, with the roles it holds, the portal those roles open, its live sessions and its lock state. Creating a login issues credentials and a 72-hour activation link by email."
        breadcrumbs={[{ label: 'Dashboard', href: '/admin/dashboard' }, { label: 'Users' }]}
      />
      {hasPermission(user.permissions, 'user.read') ? (
        <UsersRegister
          roleOptions={roleOptions}
          canCreate={hasPermission(user.permissions, 'user.create')}
          canEdit={hasPermission(user.permissions, 'user.update')}
          canDelete={hasPermission(user.permissions, 'user.delete')}
          canExport={hasPermission(user.permissions, 'user.export')}
        />
      ) : (
        <p className="rounded-lg border border-line bg-surface-muted px-4 py-3 text-sm text-ink-soft">
          Your role does not include <span className="font-medium">user.read</span>. Ask an administrator to grant it
          from Roles &amp; Permissions.
        </p>
      )}
    </div>
  );
}
