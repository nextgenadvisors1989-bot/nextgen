import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/breadcrumb';
import { requirePageUser } from '@/lib/auth/permission-check';
import { PermissionRequests } from '@/components/payroll/permission-requests';

export const metadata: Metadata = { title: 'Permission Requests' };
export const dynamic = 'force-dynamic';

export default async function EmployerPermissionRequestsPage() {
  await requirePageUser();
  return (
    <div className="space-y-5">
      <PageHeader
        title="Permission Requests"
        description="Employees ask for a few hours away from work from their profile. Approve or reject here."
        breadcrumbs={[{ label: 'Dashboard', href: '/employer/dashboard' }, { label: 'Attendance', href: '/employer/attendance' }, { label: 'Permission Requests' }]}
      />
      <PermissionRequests />
    </div>
  );
}
