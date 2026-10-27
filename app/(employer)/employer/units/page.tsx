import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/breadcrumb';
import { requirePageUser, hasPermission } from '@/lib/auth/permission-check';
import { EmployerUnits } from '@/components/employer/employer-units';

export const metadata: Metadata = { title: 'Units' };
export const dynamic = 'force-dynamic';

export default async function EmployerUnitsPage() {
  const user = await requirePageUser();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Units"
        description="Every place your establishment operates from. Staff are posted to a unit, so a unit that still holds employees cannot be removed."
        breadcrumbs={[{ label: 'Dashboard', href: '/employer/dashboard' }, { label: 'Units' }]}
      />
      <EmployerUnits
        canCreate={hasPermission(user.permissions, 'company_unit.create')}
        canUpdate={hasPermission(user.permissions, 'company_unit.update')}
        canRemove={hasPermission(user.permissions, 'company_unit.delete')}
      />
    </div>
  );
}
