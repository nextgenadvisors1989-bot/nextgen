import type { Metadata } from 'next';
import { requirePanel } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { CaparManagement } from '@/components/capar/capar-management';

export const metadata: Metadata = { title: 'CAPAR Management' };
export const dynamic = 'force-dynamic';

export default async function AdminCaparManagementPage() {
  await requirePanel(['admin']);
  return (
    <div className="space-y-6">
      <PageHeader
        title="CAPAR Management"
        description="The six categories every CAPAR report has, and the category each document belongs to."
        breadcrumbs={[{ label: 'Dashboard', href: '/admin/dashboard' }, { label: 'CAPAR Reports', href: '/admin/capar' }, { label: 'Management' }]}
      />
      <CaparManagement />
    </div>
  );
}
