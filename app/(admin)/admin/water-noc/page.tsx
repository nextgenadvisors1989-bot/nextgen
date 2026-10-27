import type { Metadata } from 'next';
import { requirePanel } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { WaterNocRegister } from '@/components/water/water-noc-register';

export const metadata: Metadata = { title: 'Groundwater NOC' };
export const dynamic = 'force-dynamic';

export default async function AdminWaterNocPage() {
  await requirePanel(['admin']);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Groundwater NOC"
        description="Every company's groundwater NOC with its validity, conditions and the water actually drawn. Each NOC is also filed in the Legal Register."
        breadcrumbs={[{ label: 'Dashboard', href: '/admin/dashboard' }, { label: 'Groundwater NOC' }]}
      />
      <WaterNocRegister panel="admin" canCreate />
    </div>
  );
}
