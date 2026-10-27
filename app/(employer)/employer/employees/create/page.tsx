import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/breadcrumb';
import { requirePageUser } from '@/lib/auth/permission-check';
import { EmployeeWizard } from '@/components/employee/employee-wizard';
import { employeeLookups } from '@/services/employee.service';
import { listDepartments, listUnits } from '@/services/employer.service';
import { findEmployerById } from '@/repositories/employer.repository';

export const metadata: Metadata = { title: 'Add Employee' };
export const dynamic = 'force-dynamic';

export default async function EmployerAddEmployeePage() {
  const user = await requirePageUser();
  const employerId = Number(user.employerId ?? 0);
  const [lookups, units, departments, employer] = await Promise.all([
    employeeLookups(employerId),
    employerId ? listUnits(employerId) : Promise.resolve([]),
    employerId ? listDepartments(employerId) : Promise.resolve([]),
    employerId ? findEmployerById(employerId) : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Add Employee"
        description="Register a new employee. Everything is saved in one go at the end, and a self-service login can be issued on the spot."
        breadcrumbs={[
          { label: 'Dashboard', href: '/employer/dashboard' },
          { label: 'Employees', href: '/employer/employees' },
          { label: 'Add Employee' },
        ]}
      />
      <EmployeeWizard
        mode="create"
        basePath="/api/employer"
        redirectBase="/employer/employees"
        lockedEmployerId={employerId}
        employerName={String((employer as { company_name?: string } | null)?.company_name ?? 'Your establishment')}
        lookups={{
          employers: [],
          designations: lookups.designations as string[],
          checklistItems: lookups.checklistItems,
          states: lookups.states as string[],
          wageHeads: lookups.wageHeads,
        }}
        employee={undefined}
      />
    </div>
  );
}
