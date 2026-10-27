import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/breadcrumb';
import { requirePageUser } from '@/lib/auth/permission-check';
import { EmployerAuditReports } from '@/components/employer/employer-audit-reports';

export const metadata: Metadata = { title: 'Audit Reports' };
export const dynamic = 'force-dynamic';

export default async function EmployerAuditReportsPage() {
  await requirePageUser();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Reports"
        description="The reports auditors have filed about your establishment, and where each one stands with the verifier."
        breadcrumbs={[{ label: 'Dashboard', href: '/employer/dashboard' }, { label: 'Audit Reports' }]}
      />
      <EmployerAuditReports />
    </div>
  );
}
