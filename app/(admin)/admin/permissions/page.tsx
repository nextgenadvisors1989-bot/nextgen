import type { Metadata } from 'next';
import { requirePanel, hasPermission } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { RolePermissionMatrix, type MatrixPayload } from '@/components/users/role-permission-matrix';
import { permissionMatrix } from '@/services/user.service';

export const metadata: Metadata = { title: 'Permission Matrix' };
export const dynamic = 'force-dynamic';

export default async function PermissionsPage() {
  const actor = await requirePanel(['admin', 'super_admin']);

  const payload = JSON.parse(JSON.stringify(await permissionMatrix())) as MatrixPayload;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Permission Matrix"
        description="Every permission the platform enforces, laid out against every role. A tick here is exactly the capability the matching API route demands — nothing is enforced anywhere else."
        breadcrumbs={[
          { label: 'Dashboard', href: '/admin/dashboard' },
          { label: 'Roles', href: '/admin/roles' },
          { label: 'Permission Matrix' },
        ]}
      />
      {hasPermission(actor.permissions, 'permission.read') ? (
        <RolePermissionMatrix payload={payload} />
      ) : (
        <p className="rounded-lg border border-line bg-surface-muted px-4 py-3 text-sm text-ink-soft">
          Your role does not include <span className="font-medium">permission.read</span>. Ask an administrator to
          grant it from Roles &amp; Permissions.
        </p>
      )}
    </div>
  );
}
