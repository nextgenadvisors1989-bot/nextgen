import type { Metadata } from 'next';
import { requirePageUser } from '@/lib/auth/permission-check';
import { hasPermission } from '@/lib/auth/permission-check';
import { RulesTable } from '@/components/compliance/rules-table';

export const metadata: Metadata = { title: 'Compliance Obligations' };
export const dynamic = 'force-dynamic';

export default async function ComplianceRulesPage() {
  const user = await requirePageUser();
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-ink">Compliance Obligations</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Every rule an establishment has to satisfy: how often it falls due, who owns it, the evidence an
          auditor asks for and the penalty for missing it.
        </p>
      </header>
      <RulesTable
        canCreate={hasPermission(user.permissions, 'compliance_rule.create')}
        canUpdate={hasPermission(user.permissions, 'compliance_rule.update')}
        canDelete={hasPermission(user.permissions, 'compliance_rule.delete')}
      />
    </div>
  );
}
