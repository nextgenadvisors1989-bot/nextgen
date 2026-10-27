import type { Metadata } from 'next';
import { requirePanel } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { UserCreateScreen } from '@/components/users/user-create-screen';
import { listRoles } from '@/services/user.service';
import { portalLinkCandidates } from '@/repositories/user.repository';

export const metadata: Metadata = { title: 'Create User' };
export const dynamic = 'force-dynamic';

export default async function CreateUserPage() {
  await requirePanel(['admin', 'super_admin']);

  const [roles, candidates] = await Promise.all([
    listRoles({ page: 1, limit: 200, search: null, sortBy: null, sortDir: 'asc', kind: 'all' }),
    portalLinkCandidates(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Create User"
        description="Provision a login for an employer contact, an auditor, an employee or a staff member. Roles decide the panel; a portal link scopes the data."
        breadcrumbs={[
          { label: 'Dashboard', href: '/admin/dashboard' },
          { label: 'Users', href: '/admin/users' },
          { label: 'Create' },
        ]}
      />
      <UserCreateScreen
        roleOptions={roles.data.map((role) => ({
          value: String(role.slug),
          label: String(role.name),
          description: String(role.description ?? `${role.permissions} permission(s)`),
        }))}
        linkOptions={{
          employers: candidates.employers.map((row) => ({ id: Number(row.id), label: String(row.label) })),
          auditors: candidates.auditors.map((row) => ({ id: Number(row.id), label: String(row.label) })),
          employees: candidates.employees.map((row) => ({ id: Number(row.id), label: String(row.label) })),
        }}
      />
    </div>
  );
}
