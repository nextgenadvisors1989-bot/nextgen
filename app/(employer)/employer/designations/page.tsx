import type { Metadata } from 'next';
import { requirePanel } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { DesignationMaster } from '@/components/designation/designation-master';

export const metadata: Metadata = { title: 'Designations' };
export const dynamic = 'force-dynamic';

export default async function EmployerDesignationsPage() {
  await requirePanel(['employer']);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Designations"
        description="Choose from the shared master when you add an employee, and keep your own designations here."
        breadcrumbs={[{ label: 'Dashboard', href: '/employer/dashboard' }, { label: 'Designations' }]}
      />
      <DesignationMaster panel="employer" />
    </div>
  );
}
