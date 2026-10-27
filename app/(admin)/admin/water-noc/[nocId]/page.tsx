import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePanel } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { WaterNocWorkspace } from '@/components/water/water-noc-workspace';

export const metadata: Metadata = { title: 'Groundwater NOC' };
export const dynamic = 'force-dynamic';

export default async function AdminWaterNocDetailPage({ params }: { params: Promise<{ nocId: string }> }) {
  await requirePanel(['admin']);
  const id = Number((await params).nocId);
  if (!Number.isInteger(id) || id <= 0) notFound();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Groundwater NOC"
        description="The NOC, its conditions checklist and the water meter log."
        breadcrumbs={[{ label: 'Dashboard', href: '/admin/dashboard' }, { label: 'Groundwater NOC', href: '/admin/water-noc' }, { label: 'NOC' }]}
      />
      <WaterNocWorkspace nocId={id} panel="admin" />
    </div>
  );
}
