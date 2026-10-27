import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/breadcrumb';
import { requirePageUser } from '@/lib/auth/permission-check';
import { MyDocuments } from '@/components/employee/my-documents';

export const metadata: Metadata = { title: 'My Documents' };
export const dynamic = 'force-dynamic';

export default async function EmployeePage() {
  await requirePageUser();
  return (
    <div className="space-y-6">
      <PageHeader
        title='My Documents'
        description='Your certificates and identity papers. Upload them here and your employer sees the same file on your personal record.'
        breadcrumbs={[
          { label: 'Dashboard', href: '/employee/dashboard' },
          { label: 'Documents' },
        ]}
      />
      <MyDocuments />
    </div>
  );
}
