import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/breadcrumb';
import { requirePageUser } from '@/lib/auth/permission-check';
import { EmployerAudits } from '@/components/employer/employer-audits';
import { assignmentStats } from '@/services/audit-assignment.service';

export const metadata: Metadata = { title: 'Audits' };
export const dynamic = 'force-dynamic';

export default async function EmployerAuditsPage() {
  const user = await requirePageUser();
  const stats = await assignmentStats(Number(user.employerId ?? 0));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audits"
        description="Every audit scheduled against your establishment, with its auditor, its dates and where it has got to."
        breadcrumbs={[{ label: 'Dashboard', href: '/employer/dashboard' }, { label: 'Audits' }]}
      />
      <EmployerAudits stats={stats as unknown as Record<string, unknown>} />
    </div>
  );
}
