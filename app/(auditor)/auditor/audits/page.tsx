import type { Metadata } from 'next';
import { requireAuditorApi } from '@/lib/auth/api-guards';
import { PageHeader } from '@/components/ui/breadcrumb';
import { AuditorAuditTable } from '@/components/audit/auditor-audit-table';
import { identityFor, myAuditStats } from '@/services/auditor-workspace.service';
import { employerOptionsBySearch } from '@/services/employer-options';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Assigned Audits' };

export default async function AuditorAuditsPage() {
  const user = await requireAuditorApi(['audit_assignment.read']);
  const me = await identityFor(user.id);

  const [stats, employers] = await Promise.all([
    myAuditStats(me.id),
    employerOptionsBySearch(undefined, 200),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Assigned Audits"
        description={`${me.name} · ${me.auditor_code} — every audit assigned to you, with its schedule, scope and verifier.`}
        breadcrumbs={[
          { label: 'Dashboard', href: '/auditor/dashboard' },
          { label: 'Assigned Audits' },
        ]}
      />
      <AuditorAuditTable stats={stats} employers={employers} />
    </div>
  );
}
