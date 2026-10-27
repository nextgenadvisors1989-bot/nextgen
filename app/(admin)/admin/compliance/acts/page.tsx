import type { Metadata } from 'next';
import { requirePageUser } from '@/lib/auth/permission-check';
import { hasPermission } from '@/lib/auth/rbac';
import { ActsTable } from '@/components/compliance/acts-table';

export const metadata: Metadata = { title: 'Compliance Acts' };
export const dynamic = 'force-dynamic';

export default async function ComplianceActsPage() {
  const user = await requirePageUser();
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-ink">Compliance Acts</h1>
        <p className="mt-1 text-sm text-ink-muted">
          The legislation the platform audits against — Central and state acts with the obligations,
          instruments and gazette notifications that sit under them. The same register is published on the
          public Acts &amp; Compliance page.
        </p>
      </header>
      <ActsTable
        canCreate={hasPermission(user.permissions, 'compliance_act.create')}
        canUpdate={hasPermission(user.permissions, 'compliance_act.update')}
        canDelete={hasPermission(user.permissions, 'compliance_act.delete')}
      />
    </div>
  );
}
