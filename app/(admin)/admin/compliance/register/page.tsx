import type { Metadata } from 'next';
import { requirePanel } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { AuditAssessment } from '@/components/compliance/audit-assessment';

export const metadata: Metadata = { title: 'Audit and Assessment' };
export const dynamic = 'force-dynamic';

export default async function AdminAuditAssessmentPage() {
  await requirePanel(['admin']);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit and Assessment"
        description="The audits and assessments we offer. Each one will open its own form."
        breadcrumbs={[{ label: 'Dashboard', href: '/admin/dashboard' }, { label: 'Audit and Assessment' }]}
      />
      <AuditAssessment mode="admin" />
    </div>
  );
}
