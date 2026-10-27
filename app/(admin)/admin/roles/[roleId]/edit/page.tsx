import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePanel } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { RoleForm } from '@/components/users/role-form';
import { getRoleDetail } from '@/services/user.service';
import { permissionCatalogue } from '@/repositories/user.repository';

export const metadata: Metadata = { title: 'Edit Role' };
export const dynamic = 'force-dynamic';

export default async function EditRolePage({ params }: { params: Promise<{ roleId: string }> }) {
  const { roleId } = await params;
  const id = Number(roleId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  await requirePanel(['admin', 'super_admin']);

  let detail;
  let catalogue;
  try {
    [detail, catalogue] = await Promise.all([getRoleDetail(id), permissionCatalogue()]);
  } catch {
    notFound();
  }

  const role = detail.role;
  const isSystemRole = Boolean(Number(role.is_system_role));

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Edit ${role.name}`}
        description={isSystemRole ? 'System role names are fixed — clone the role to get an editable copy.' : 'Rename the role or sharpen its purpose.'}
        breadcrumbs={[
          { label: 'Dashboard', href: '/admin/dashboard' },
          { label: 'Roles', href: '/admin/roles' },
          { label: String(role.name), href: `/admin/roles/${id}` },
          { label: 'Edit' },
        ]}
      />
      <RoleForm
        mode="edit"
        roleId={id}
        isSystemRole={isSystemRole}
        roleOptions={[]}
        catalogue={catalogue.map((row) => ({
          id: Number(row.id),
          name: String(row.name),
          module: String(row.module),
          action: String(row.action),
          description: row.description ? String(row.description) : null,
        }))}
        initialValues={{
          name: String(role.name),
          slug: String(role.slug),
          description: String(role.description ?? ''),
        }}
        initialPermissions={detail.permissionNames}
      />
    </div>
  );
}
