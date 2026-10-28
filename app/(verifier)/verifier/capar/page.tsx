import type { Metadata } from 'next';
import { requirePanel } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { CaparRegister } from '@/components/capar/capar-register';

export const metadata: Metadata = { title: 'CAPAR Reports' };
export const dynamic = 'force-dynamic';

export default async function VerifierCaparPage() {
  await requirePanel(['verifier']);
  return (
    <div className="space-y-6">
      <PageHeader
        title="CAPAR Reports"
        description="Corrective Action and Preventive Action Reports sent to you: mark each finding Eligible or Not Eligible, then approve or return the report."
        breadcrumbs={[{ label: 'Dashboard', href: '/verifier/dashboard' }, { label: 'CAPAR Reports' }]}
      />
      <CaparRegister panel="verifier" />
    </div>
  );
}
