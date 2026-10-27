import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePanel, hasPermission } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { RoleDetail, type RoleMember } from '@/components/users/role-detail';
import { getRoleDetail } from '@/services/user.service';
import { grantsForRole } from '@/lib/auth/rbac';
import type { RoleRow } from '@/components/users/shared';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ roleId: string }> }): Promise<Metadata> {
  const { roleId } = await params;
  try {
    const detail = await getRoleDetail(Number(roleId));
    return { title: String(detail.role.name) };
  } catch {
    return { title: 'Role' };
  }
}

export default async function RoleDetailPage({ params }: { params: Promise<{ roleId: string }> }) {
  const { roleId } = await params;
  const id = Number(roleId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const actor = await requirePanel(['admin', 'super_admin']);

  let detail;
  try {
    detail = await getRoleDetail(id);
  } catch {
    notFound();
  }

  const role = JSON.parse(JSON.stringify(detail.role)) as RoleRow;

  return (
    <div className="space-y-5">
      <PageHeader
        title={String(role.name)}
        description={role.description ?? 'No description recorded.'}
        breadcrumbs={[
          { label: 'Dashboard', href: '/admin/dashboard' },
          { label: 'Roles', href: '/admin/roles' },
          { label: String(role.name) },
        ]}
      />
      <RoleDetail
        role={role}
        permissionNames={detail.permissionNames}
        members={JSON.parse(JSON.stringify(detail.members)) as RoleMember[]}
        catalogue={JSON.parse(JSON.stringify(detail.catalogue))}
        defaults={grantsForRole(String(role.slug))}
        canEdit={hasPermission(actor.permissions, 'role.update')}
        canDelete={hasPermission(actor.permissions, 'role.delete')}
      />
    </div>
  );
}
