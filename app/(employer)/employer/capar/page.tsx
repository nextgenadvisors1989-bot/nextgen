import type { Metadata } from 'next';
import { requirePanel } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { CaparRegister } from '@/components/capar/capar-register';

export const metadata: Metadata = { title: 'CAPAR Reports' };
export const dynamic = 'force-dynamic';

export default async function EmployerCaparPage() {
  await requirePanel(['employer']);
  return (
    <div className="space-y-6">
      <PageHeader
        title="CAPAR Reports"
        description="Corrective Action and Preventive Action Reports about your establishment, with the action plan and timeline for each finding."
        breadcrumbs={[{ label: 'Dashboard', href: '/employer/dashboard' }, { label: 'CAPAR Reports' }]}
      />
      <CaparRegister panel="employer" />
    </div>
  );
}
