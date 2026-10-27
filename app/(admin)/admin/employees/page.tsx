import type { Metadata } from 'next';
import { requireAdminApi } from '@/lib/auth/api-guards';
import { hasPermission } from '@/lib/auth/rbac';
import { PageHeader } from '@/components/ui/breadcrumb';
import { EmployeesTable } from '@/components/employee/employees-table';
import { employerOptionsBySearch } from '@/services/employer-options';
import { query, type RowDataPacket } from '@/lib/db/mysql';

export const metadata: Metadata = { title: 'Employees' };
export const dynamic = 'force-dynamic';

export default async function EmployeesPage() {
  const user = await requireAdminApi(['employee.read']);

  const [employers, units, departments] = await Promise.all([
    employerOptionsBySearch(undefined, 100),
    query<RowDataPacket>('SELECT id, unit_name FROM company_units WHERE deleted_at IS NULL ORDER BY unit_name ASC LIMIT 500'),
    query<RowDataPacket>('SELECT id, department_name FROM departments WHERE deleted_at IS NULL ORDER BY department_name ASC LIMIT 500'),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Employees"
        description="Every employee record across all employers, with personal file status, wage structure and portal login state."
        breadcrumbs={[{ label: 'Dashboard', href: '/admin/dashboard' }, { label: 'Employees' }]}
      />
      <EmployeesTable
        employers={employers}
        units={units.map((unit) => ({ value: String(unit.id), label: String(unit.unit_name) }))}
        departments={departments.map((department) => ({ value: String(department.id), label: String(department.department_name) }))}
        permissions={{
          create: hasPermission(user.permissions, 'employee.create'),
          update: hasPermission(user.permissions, 'employee.update'),
          remove: hasPermission(user.permissions, 'employee.delete'),
        }}
      />
    </div>
  );
}
