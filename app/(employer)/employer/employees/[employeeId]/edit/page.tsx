import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/ui/breadcrumb';
import { requirePageUser } from '@/lib/auth/permission-check';
import { EmployeeWizard } from '@/components/employee/employee-wizard';
import { employeeLookups, getEmployeeDetail } from '@/services/employee.service';
import { listDepartments, listUnits } from '@/services/employer.service';
import { findEmployerById } from '@/repositories/employer.repository';
import * as repo from '@/repositories/employee.repository';

export const metadata: Metadata = { title: 'Edit Employee' };
export const dynamic = 'force-dynamic';

export default async function EmployerEditEmployeePage({ params }: { params: Promise<{ employeeId: string }> }) {
  const user = await requirePageUser();
  const employerId = Number(user.employerId ?? 0);
  const { employeeId } = await params;
  const id = Number(employeeId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const scoped = await repo.findEmployeeScoped(id, employerId);
  if (!scoped) notFound();

  const [detail, lookups, units, departments, employer] = await Promise.all([
    getEmployeeDetail(id, { includeLogin: false }),
    employeeLookups(employerId),
    employerId ? listUnits(employerId) : Promise.resolve([]),
    employerId ? listDepartments(employerId) : Promise.resolve([]),
    employerId ? findEmployerById(employerId) : Promise.resolve(null),
  ]);
  if (!detail) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Edit ${String((detail.employee as unknown as Record<string, unknown>).name ?? 'employee')}`}
        description="Correct the particulars on the register. The employee number and the establishment itself are fixed."
        breadcrumbs={[
          { label: 'Dashboard', href: '/employer/dashboard' },
          { label: 'Employees', href: '/employer/employees' },
          { label: String((detail.employee as unknown as Record<string, unknown>).employee_number ?? 'Employee') },
          { label: 'Edit' },
        ]}
      />
      <EmployeeWizard
        mode="edit"
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
        employee={detail.employee as unknown as Parameters<typeof EmployeeWizard>[0]['employee']}
      />
    </div>
  );
}
