import type { Metadata } from 'next';
import { requirePanel } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { ActCompliance } from '@/components/compliance/act-compliance';

export const metadata: Metadata = { title: 'Act & Compliance' };
export const dynamic = 'force-dynamic';

export default async function AdminActCompliancePage() {
  await requirePanel(['admin']);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Act & Compliance"
        description="Acts with their Chapters, Sections and Amendments, and the Legal Compliance Register of Forms, Returns and Statements."
        breadcrumbs={[{ label: 'Dashboard', href: '/admin/dashboard' }, { label: 'Act & Compliance' }]}
      />
      <ActCompliance mode="admin" />
    </div>
  );
}
