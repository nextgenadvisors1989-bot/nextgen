import type { Metadata } from 'next';
import { requirePanel } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { Card, CardBody } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { WaterNocRegister } from '@/components/water/water-noc-register';
import { isWaterAuditorUser } from '@/services/water-noc.service';

export const metadata: Metadata = { title: 'Groundwater NOC' };
export const dynamic = 'force-dynamic';

export default async function AuditorWaterNocPage() {
  const user = await requirePanel(['auditor']);
  const allowed = await isWaterAuditorUser(user.id);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Groundwater NOC"
        description="The groundwater NOCs of the companies you audit: approved quantity, conditions to tick on a visit, and the meter readings that show how much water is really drawn."
        breadcrumbs={[{ label: 'Dashboard', href: '/auditor/dashboard' }, { label: 'Groundwater NOC' }]}
      />
      {allowed ? (
        <WaterNocRegister panel="auditor" canCreate />
      ) : (
        <Card>
          <CardBody>
            <EmptyState title="Kept by Water auditors" subtitle="The groundwater NOC register and the water meter log are handled by auditors of the Water type. Ask an administrator if you should have access." />
          </CardBody>
        </Card>
      )}
    </div>
  );
}
