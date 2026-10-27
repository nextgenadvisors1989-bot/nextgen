import type { Metadata } from 'next';
import { requirePanel } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { RoleForm } from '@/components/users/role-form';
import { listRoles } from '@/services/user.service';
import { permissionCatalogue } from '@/repositories/user.repository';

export const metadata: Metadata = { title: 'Create Role' };
export const dynamic = 'force-dynamic';

export default async function CreateRolePage() {
  await requirePanel(['admin', 'super_admin']);

  const [roles, catalogue] = await Promise.all([
    listRoles({ page: 1, limit: 200, search: null, sortBy: null, sortDir: 'asc', kind: 'all' }),
    permissionCatalogue(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Create Role"
        description="Define what a group of people may do, then assign the role to their logins from the user register."
        breadcrumbs={[
          { label: 'Dashboard', href: '/admin/dashboard' },
          { label: 'Roles', href: '/admin/roles' },
          { label: 'Create' },
        ]}
      />
      <RoleForm
        mode="create"
        roleOptions={roles.data.map((role) => ({
          slug: String(role.slug),
          name: String(role.name),
          permissions: Number(role.permissions),
        }))}
        catalogue={catalogue.map((row) => ({
          id: Number(row.id),
          name: String(row.name),
          module: String(row.module),
          action: String(row.action),
          description: row.description ? String(row.description) : null,
        }))}
      />
    </div>
  );
}
