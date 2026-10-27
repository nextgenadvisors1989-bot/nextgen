import type { Metadata } from 'next';
import { requirePanel } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { CaparRegister } from '@/components/capar/capar-register';

export const metadata: Metadata = { title: 'CAPAR Reports' };
export const dynamic = 'force-dynamic';

export default async function AuditorCaparPage() {
  await requirePanel(['auditor']);
  return (
    <div className="space-y-6">
      <PageHeader
        title="CAPAR Reports"
        description="Corrective Action Plan Acknowledgement Reports you have written: findings with the Act or Rule, photo, root cause, action plan and timeline."
        breadcrumbs={[{ label: 'Dashboard', href: '/auditor/dashboard' }, { label: 'CAPAR Reports' }]}
      />
      <CaparRegister panel="auditor" canCreate />
    </div>
  );
}
