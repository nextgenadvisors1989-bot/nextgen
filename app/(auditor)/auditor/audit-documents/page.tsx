import type { Metadata } from 'next';
import { requirePanel } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { AuditorPacks } from '@/components/evidence/auditor-packs';

export const metadata: Metadata = { title: 'Audit Documents' };
export const dynamic = 'force-dynamic';

export default async function AuditorAuditDocumentsPage() {
  await requirePanel(['auditor']);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Documents"
        description="The document packs employers have submitted. Download a company's latest pack before you start its audit."
        breadcrumbs={[{ label: 'Dashboard', href: '/auditor/dashboard' }, { label: 'Audit Documents' }]}
      />
      <AuditorPacks basePath="/auditor/audit-documents" />
    </div>
  );
}
