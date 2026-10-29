import type { Metadata } from 'next';
import { requirePanel } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { ComplianceRegister } from '@/components/compliance/compliance-register';

export const metadata: Metadata = { title: 'Audit and Assessment' };
export const dynamic = 'force-dynamic';

export default async function AuditorComplianceRegisterPage() {
  await requirePanel(['auditor']);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit and Assessment"
        description="Search an audit or assessment to read its Acts, Sections, Amendments and the Legal Compliance Register (Forms, Returns, Statements)."
        breadcrumbs={[{ label: 'Dashboard', href: '/auditor/dashboard' }, { label: 'Audit and Assessment' }]}
      />
      <ComplianceRegister mode="auditor" />
    </div>
  );
}
