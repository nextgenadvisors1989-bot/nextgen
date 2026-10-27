import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/breadcrumb';
import { requirePageUser } from '@/lib/auth/permission-check';
import { MyDetails } from '@/components/employee/my-details';
import { MyWorkday } from '@/components/employee/my-workday';

export const metadata: Metadata = { title: 'My Profile' };
export const dynamic = 'force-dynamic';

export default async function EmployeePage() {
  await requirePageUser();
  return (
    <div className="space-y-6">
      <PageHeader
        title='My Profile'
        description='Your position on the register, the particulars you keep current and where your personal file stands.'
        breadcrumbs={[
          { label: 'Dashboard', href: '/employee/dashboard' },
          { label: 'My Profile' },
        ]}
      />
      <MyWorkday />
      <MyDetails />
    </div>
  );
}
