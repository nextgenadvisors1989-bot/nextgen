import type { Metadata } from 'next';
import { requirePanel } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { EvidenceAdmin } from '@/components/evidence/evidence-admin';

export const metadata: Metadata = { title: 'Audit Documents' };
export const dynamic = 'force-dynamic';

export default async function AdminAuditDocumentsPage() {
  await requirePanel(['admin']);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Documents"
        description="The document checklist employers fill before an audit, and the sections each auditor receives."
        breadcrumbs={[{ label: 'Dashboard', href: '/admin/dashboard' }, { label: 'Audit Documents' }]}
      />
      <EvidenceAdmin />
    </div>
  );
}
