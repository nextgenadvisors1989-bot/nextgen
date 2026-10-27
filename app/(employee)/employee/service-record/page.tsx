import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/breadcrumb';
import { requirePageUser } from '@/lib/auth/permission-check';
import { MyServiceRecord } from '@/components/employee/my-service-record';

export const metadata: Metadata = { title: 'Service Record' };
export const dynamic = 'force-dynamic';

export default async function EmployeePage() {
  await requirePageUser();
  return (
    <div className="space-y-6">
      <PageHeader
        title='Service Record'
        description='Every period of employment the platform holds about you, with your qualifications and your previous experience.'
        breadcrumbs={[
          { label: 'Dashboard', href: '/employee/dashboard' },
          { label: 'Service Record' },
        ]}
      />
      <MyServiceRecord />
    </div>
  );
}
