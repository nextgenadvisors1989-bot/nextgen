import type { Metadata } from 'next';
import { requirePanel } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { DesignationMaster } from '@/components/designation/designation-master';

export const metadata: Metadata = { title: 'Designation Master' };
export const dynamic = 'force-dynamic';

export default async function AdminDesignationsPage() {
  await requirePanel(['admin']);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Designation Master"
        description="The shared list of designations (about a thousand, across ten industries) that companies pick from when they add an employee."
        breadcrumbs={[{ label: 'Dashboard', href: '/admin/dashboard' }, { label: 'Designation Master' }]}
      />
      <DesignationMaster panel="admin" />
    </div>
  );
}
