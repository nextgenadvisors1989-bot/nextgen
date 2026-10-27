import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/breadcrumb';
import { requirePageUser } from '@/lib/auth/permission-check';
import { MyDetails } from '@/components/employee/my-details';

export const metadata: Metadata = { title: 'Personal Details' };
export const dynamic = 'force-dynamic';

export default async function EmployeePage() {
  await requirePageUser();
  return (
    <div className="space-y-6">
      <PageHeader
        title='Personal Details'
        description='Contact, address, family, identity and bank details — yours to keep current. Everything the establishment owns is shown beside them.'
        breadcrumbs={[
          { label: 'Dashboard', href: '/employee/dashboard' },
          { label: 'Personal Details' },
        ]}
      />
      <MyDetails />
    </div>
  );
}
