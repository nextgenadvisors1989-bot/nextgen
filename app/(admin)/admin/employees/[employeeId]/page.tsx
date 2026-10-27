import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireAdminApi } from '@/lib/auth/api-guards';
import { hasPermission } from '@/lib/auth/rbac';
import { getEmployeeDetail } from '@/services/employee.service';
import { PageHeader } from '@/components/ui/breadcrumb';
import { EmployeeDetailView } from '@/components/employee/employee-detail';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ employeeId: string }> }): Promise<Metadata> {
  const { employeeId } = await params;
  const detail = await getEmployeeDetail(Number(employeeId));
  return { title: detail ? detail.employee.name : 'Employee' };
}

export default async function EmployeeDetailPage({ params }: { params: Promise<{ employeeId: string }> }) {
  const user = await requireAdminApi(['employee.read']);
  const { employeeId } = await params;
  const id = Number(employeeId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const detail = await getEmployeeDetail(id);
  if (!detail) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title={detail.employee.name}
        breadcrumbs={[
          { label: 'Dashboard', href: '/admin/dashboard' },
          { label: 'Employees', href: '/admin/employees' },
          { label: detail.employee.employee_number },
        ]}
      />
      <EmployeeDetailView
        detail={detail}
        permissions={{
          create: hasPermission(user.permissions, 'employee.create'),
          update: hasPermission(user.permissions, 'employee.update'),
          remove: hasPermission(user.permissions, 'employee.delete'),
        }}
      />
    </div>
  );
}
