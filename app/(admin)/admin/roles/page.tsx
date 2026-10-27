import type { Metadata } from 'next';
import { requirePanel, hasPermission } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { RolesTable } from '@/components/users/roles-table';
import { ROLE_DEFINITIONS } from '@/lib/auth/rbac';

export const metadata: Metadata = { title: 'Roles' };
export const dynamic = 'force-dynamic';

export default async function RolesPage() {
  const user = await requirePanel(['admin', 'super_admin']);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Roles"
        description="Roles bundle permissions; logins hold roles. System roles anchor the panels and cannot be renamed or removed — clone one when a team needs a narrower set."
        breadcrumbs={[{ label: 'Dashboard', href: '/admin/dashboard' }, { label: 'Roles' }]}
      />
      {hasPermission(user.permissions, 'role.read') ? (
        <RolesTable
          canCreate={hasPermission(user.permissions, 'role.create')}
          canEdit={hasPermission(user.permissions, 'role.update')}
          canDelete={hasPermission(user.permissions, 'role.delete')}
          canExport={hasPermission(user.permissions, 'role.export')}
          systemRoles={ROLE_DEFINITIONS.map((role) => ({ slug: role.slug, name: role.name, description: role.description }))}
        />
      ) : (
        <p className="rounded-lg border border-line bg-surface-muted px-4 py-3 text-sm text-ink-soft">
          Your role does not include <span className="font-medium">role.read</span>. Ask an administrator to grant it
          from Roles &amp; Permissions.
        </p>
      )}
    </div>
  );
}
