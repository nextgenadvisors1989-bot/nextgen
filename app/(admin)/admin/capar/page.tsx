import type { Metadata } from 'next';
import { requirePanel } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { CaparRegister } from '@/components/capar/capar-register';

export const metadata: Metadata = { title: 'CAPAR Reports' };
export const dynamic = 'force-dynamic';

export default async function AdminCaparPage() {
  await requirePanel(['admin']);
  return (
    <div className="space-y-6">
      <PageHeader
        title="CAPAR Reports"
        description="Every Corrective Action Plan Acknowledgement Report: who wrote it, who is verifying it, and where it stands."
        breadcrumbs={[{ label: 'Dashboard', href: '/admin/dashboard' }, { label: 'CAPAR Reports' }]}
      />
      <CaparRegister panel="admin" />
    </div>
  );
}
