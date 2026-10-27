import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireAdminApi } from '@/lib/auth/api-guards';
import { PageHeader } from '@/components/ui/breadcrumb';
import { EmployeeWizard } from '@/components/employee/employee-wizard';
import { employeeLookups, getEmployeeDetail } from '@/services/employee.service';

export const metadata: Metadata = { title: 'Edit Employee' };
export const dynamic = 'force-dynamic';

export default async function EditEmployeePage({ params }: { params: Promise<{ employeeId: string }> }) {
  await requireAdminApi(['employee.update']);
  const { employeeId } = await params;
  const id = Number(employeeId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const detail = await getEmployeeDetail(id);
  if (!detail) notFound();

  const lookups = await employeeLookups(detail.employee.employer_id);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Edit — ${detail.employee.name}`}
        description={`${detail.employee.employee_number} · ${detail.employee.employer_name}. Field-level changes are written to the audit trail.`}
        breadcrumbs={[
          { label: 'Dashboard', href: '/admin/dashboard' },
          { label: 'Employees', href: '/admin/employees' },
          { label: detail.employee.name, href: `/admin/employees/${id}` },
          { label: 'Edit' },
        ]}
      />
      <EmployeeWizard mode="edit" lookups={lookups} employee={detail.employee} />
    </div>
  );
}
