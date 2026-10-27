import type { Metadata } from 'next';
import { requirePanel } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { WaterNocRegister } from '@/components/water/water-noc-register';

export const metadata: Metadata = { title: 'Groundwater NOC' };
export const dynamic = 'force-dynamic';

export default async function EmployerWaterNocPage() {
  await requirePanel(['employer']);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Groundwater NOC"
        description="Your groundwater NOC, the conditions it carries and how much water the meters show you are drawing against the approved quantity."
        breadcrumbs={[{ label: 'Dashboard', href: '/employer/dashboard' }, { label: 'Groundwater NOC' }]}
      />
      <WaterNocRegister panel="employer" />
    </div>
  );
}
