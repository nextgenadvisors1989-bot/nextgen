import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePanel } from '@/lib/auth/permission-check';
import { hasPermission } from '@/lib/auth/rbac';
import { PageHeader } from '@/components/ui/breadcrumb';
import { EmployersTable } from '@/components/employer/employers-table';

export const metadata: Metadata = { title: 'Employers' };
export const dynamic = 'force-dynamic';

export default async function EmployersPage() {
  const user = await requirePanel(['admin', 'super_admin']);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Employers"
        description="The employer register — every company you audit, run payroll for and keep compliance records against."
        breadcrumbs={[{ label: 'Dashboard', href: '/admin/dashboard' }, { label: 'Employers' }]}
      />
      <EmployersTable
        canCreate={hasPermission(user.permissions, 'employer.create')}
        canUpdate={hasPermission(user.permissions, 'employer.update')}
        canDelete={hasPermission(user.permissions, 'employer.delete')}
      />
    </div>
  );
}
