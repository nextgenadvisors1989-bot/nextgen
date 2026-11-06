import type { Metadata } from 'next';
import { requirePanel } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { AuditAssessment } from '@/components/compliance/audit-assessment';

export const metadata: Metadata = { title: 'Audit and Assessment' };
export const dynamic = 'force-dynamic';

export default async function AuditorAuditAssessmentPage() {
  await requirePanel(['auditor']);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit and Assessment"
        description="The audits and assessments we offer. Choose the audit, the form and the company; the form opens below and the report downloads as PDF or Word."
        breadcrumbs={[{ label: 'Dashboard', href: '/auditor/dashboard' }, { label: 'Audit and Assessment' }]}
      />
      <AuditAssessment mode="auditor" />
    </div>
  );
}
