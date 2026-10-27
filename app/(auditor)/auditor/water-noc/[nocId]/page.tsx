import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePanel } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { Card, CardBody } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { WaterNocWorkspace } from '@/components/water/water-noc-workspace';
import { isWaterAuditorUser } from '@/services/water-noc.service';

export const metadata: Metadata = { title: 'Groundwater NOC' };
export const dynamic = 'force-dynamic';

export default async function AuditorWaterNocDetailPage({ params }: { params: Promise<{ nocId: string }> }) {
  const user = await requirePanel(['auditor']);
  const id = Number((await params).nocId);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const allowed = await isWaterAuditorUser(user.id);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Groundwater NOC"
        description="Tick the conditions on each visit and keep the meter readings; the usage chart shows the water drawn against the approved quantity."
        breadcrumbs={[{ label: 'Dashboard', href: '/auditor/dashboard' }, { label: 'Groundwater NOC', href: '/auditor/water-noc' }, { label: 'NOC' }]}
      />
      {allowed ? (
        <WaterNocWorkspace nocId={id} panel="auditor" />
      ) : (
        <Card><CardBody><EmptyState title="Kept by Water auditors" subtitle="This register is handled by auditors of the Water type." /></CardBody></Card>
      )}
    </div>
  );
}
