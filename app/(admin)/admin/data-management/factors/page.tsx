import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/breadcrumb';
import { hasPermission, requirePanel } from '@/lib/auth/permission-check';
import { EmissionFactors } from '@/components/data-management/dm-factors';

export const metadata: Metadata = { title: 'Emission factors' };
export const dynamic = 'force-dynamic';

export default async function EmissionFactorsPage() {
  const user = await requirePanel(['admin', 'super_admin']);
  return (
    <div className="space-y-5">
      <PageHeader
        title="Emission factors"
        description="The values the carbon calculation multiplies the activity data by. Enter the client's own official factors with their source; nothing is pre-filled."
        breadcrumbs={[{ label: 'Dashboard', href: '/admin/dashboard' }, { label: 'Data Management', href: '/admin/data-management' }, { label: 'Emission factors' }]}
      />
      <EmissionFactors canEdit={hasPermission(user.permissions, 'data_management.update')} />
    </div>
  );
}
