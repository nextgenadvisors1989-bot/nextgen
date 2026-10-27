import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/breadcrumb';
import { requirePageUser, hasPermission } from '@/lib/auth/permission-check';
import { EmployerDepartments } from '@/components/employer/employer-departments';

export const metadata: Metadata = { title: 'Departments' };
export const dynamic = 'force-dynamic';

export default async function EmployerDepartmentsPage() {
  const user = await requirePageUser();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Departments"
        description="Departments belong to one of your units. A department that still holds employees cannot be removed."
        breadcrumbs={[{ label: 'Dashboard', href: '/employer/dashboard' }, { label: 'Departments' }]}
      />
      <EmployerDepartments
        canCreate={hasPermission(user.permissions, 'department.create')}
        canUpdate={hasPermission(user.permissions, 'department.update')}
        canRemove={hasPermission(user.permissions, 'department.delete')}
      />
    </div>
  );
}
