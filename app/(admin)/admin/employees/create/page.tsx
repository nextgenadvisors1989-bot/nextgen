import type { Metadata } from 'next';
import { requireAdminApi } from '@/lib/auth/api-guards';
import { PageHeader } from '@/components/ui/breadcrumb';
import { EmployeeWizard } from '@/components/employee/employee-wizard';
import { employeeLookups } from '@/services/employee.service';

export const metadata: Metadata = { title: 'Register Employee' };
export const dynamic = 'force-dynamic';

export default async function CreateEmployeePage() {
  await requireAdminApi(['employee.create']);
  const lookups = await employeeLookups();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Register Employee"
        description="The 14-step onboarding wizard: personal details through to the personal file, wage structure and portal login."
        breadcrumbs={[
          { label: 'Dashboard', href: '/admin/dashboard' },
          { label: 'Employees', href: '/admin/employees' },
          { label: 'Register' },
        ]}
      />
      <EmployeeWizard mode="create" lookups={lookups} />
    </div>
  );
}
