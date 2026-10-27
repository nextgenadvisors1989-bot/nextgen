import type { Metadata } from 'next';
import { requirePageUser } from '@/lib/auth/permission-check';
import { hasPermission } from '@/lib/auth/permission-check';
import { RegulationsTable } from '@/components/compliance/regulations-table';

export const metadata: Metadata = { title: 'Compliance Regulations' };
export const dynamic = 'force-dynamic';

export default async function ComplianceRegulationsPage() {
  const user = await requirePageUser();
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-ink">Compliance Regulations</h1>
        <p className="mt-1 text-sm text-ink-muted">
          The rules, schemes and orders issued under each act, with the authority they report to and how
          often that reporting falls due.
        </p>
      </header>
      <RegulationsTable
        canCreate={hasPermission(user.permissions, 'compliance_regulation.create')}
        canUpdate={hasPermission(user.permissions, 'compliance_regulation.update')}
        canDelete={hasPermission(user.permissions, 'compliance_regulation.delete')}
      />
    </div>
  );
}
