import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireAllPermissions } from '@/lib/auth/permission-check';
import { hasPermission } from '@/lib/auth/rbac';
import { getEmployerDetail } from '@/services/employer.service';
import { PageHeader } from '@/components/ui/breadcrumb';
import { EmployerDetailView } from '@/components/employer/employer-detail';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ employerId: string }> }): Promise<Metadata> {
  const { employerId } = await params;
  const detail = await getEmployerDetail(Number(employerId));
  return { title: detail ? detail.employer.company_name : 'Employer' };
}

export default async function EmployerDetailPage({ params }: { params: Promise<{ employerId: string }> }) {
  const user = await requireAllPermissions(['employer.read']);
  const { employerId } = await params;
  const id = Number(employerId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const detail = await getEmployerDetail(id);
  if (!detail) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title={detail.employer.company_name}
        breadcrumbs={[
          { label: 'Dashboard', href: '/admin/dashboard' },
          { label: 'Employers', href: '/admin/employers' },
          { label: detail.employer.employer_code },
        ]}
      />
      <EmployerDetailView
        detail={detail}
        permissions={{
          updateEmployer: hasPermission(user.permissions, 'employer.update'),
          createUnit: hasPermission(user.permissions, 'company_unit.create'),
          updateUnit: hasPermission(user.permissions, 'company_unit.update'),
          deleteUnit: hasPermission(user.permissions, 'company_unit.delete'),
          createDepartment: hasPermission(user.permissions, 'department.create'),
          updateDepartment: hasPermission(user.permissions, 'department.update'),
          deleteDepartment: hasPermission(user.permissions, 'department.delete'),
        }}
      />
    </div>
  );
}
