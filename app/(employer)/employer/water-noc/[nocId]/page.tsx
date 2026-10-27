import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePanel } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { WaterNocWorkspace } from '@/components/water/water-noc-workspace';

export const metadata: Metadata = { title: 'Groundwater NOC' };
export const dynamic = 'force-dynamic';

export default async function EmployerWaterNocDetailPage({ params }: { params: Promise<{ nocId: string }> }) {
  await requirePanel(['employer']);
  const id = Number((await params).nocId);
  if (!Number.isInteger(id) || id <= 0) notFound();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Groundwater NOC"
        description="The NOC, its conditions and the water drawn against the approved quantity."
        breadcrumbs={[{ label: 'Dashboard', href: '/employer/dashboard' }, { label: 'Groundwater NOC', href: '/employer/water-noc' }, { label: 'NOC' }]}
      />
      <WaterNocWorkspace nocId={id} panel="employer" />
    </div>
  );
}
