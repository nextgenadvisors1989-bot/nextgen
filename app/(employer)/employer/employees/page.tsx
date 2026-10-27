import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/breadcrumb';
import { requirePageUser, hasPermission } from '@/lib/auth/permission-check';
import { EmployeesTable } from '@/components/employee/employees-table';
import { employeeLookups } from '@/services/employee.service';
import { listDepartments, listUnits } from '@/services/employer.service';

export const metadata: Metadata = { title: 'Employees' };
export const dynamic = 'force-dynamic';

/**
 * The establishment's own staff register.
 *
 * The table and the wizard are the platform's, pointed at this panel's routes —
 * one implementation of "a register of employees", used by the administrator and
 * by each establishment, so a column added in one place appears in both.
 */
export default async function EmployerEmployeesPage() {
  const user = await requirePageUser();
  const employerId = Number(user.employerId ?? 0);
  const [lookups, units, departments] = await Promise.all([
    employeeLookups(employerId),
    employerId ? listUnits(employerId) : Promise.resolve([]),
    employerId ? listDepartments(employerId) : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Employees"
        description="Everyone on your establishment's register, with their unit, department and designation."
        breadcrumbs={[
          { label: 'Dashboard', href: '/employer/dashboard' },
          { label: 'Employees' },
        ]}
      />
      <EmployeesTable
        employers={[]}
        hideEmployerColumn
        basePath="/api/employer"
        linkBase="/employer/employees"
        units={(units as Record<string, unknown>[]).map((unit) => ({ value: String(unit.id), label: String(unit.unit_name) }))}
        departments={(departments as Record<string, unknown>[]).map((row) => ({ value: String(row.id), label: String(row.department_name) }))}
        permissions={{
          create: hasPermission(user.permissions, 'employee.create'),
          update: hasPermission(user.permissions, 'employee.update'),
          remove: hasPermission(user.permissions, 'employee.delete'),
        }}
      />
    </div>
  );
}
