import type { Metadata } from 'next';
import { requirePanel } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { ComplianceRegister } from '@/components/compliance/compliance-register';

export const metadata: Metadata = { title: 'Audit and Assessment' };
export const dynamic = 'force-dynamic';

export default async function AdminComplianceRegisterPage() {
  await requirePanel(['admin']);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit and Assessment"
        description="For each audit or assessment: its Acts, Chapters, Sections, Amendments and the Legal Compliance Register of Forms, Returns and Statements."
        breadcrumbs={[{ label: 'Dashboard', href: '/admin/dashboard' }, { label: 'Acts & Compliance', href: '/admin/compliance/acts' }, { label: 'Audit and Assessment' }]}
      />
      <ComplianceRegister mode="admin" />
    </div>
  );
}
