import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePanel } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { EvidenceChecklist } from '@/components/evidence/evidence-checklist';

export const metadata: Metadata = { title: 'Audit Documents' };
export const dynamic = 'force-dynamic';

export default async function AuditorEmployerDocumentsPage({ params }: { params: Promise<{ employerId: string }> }) {
  await requirePanel(['auditor']);
  const id = Number((await params).employerId);
  if (!Number.isInteger(id) || id <= 0) notFound();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Employer documents"
        description="What the company has listed, limited to the sections the administrator gave you."
        breadcrumbs={[{ label: 'Dashboard', href: '/auditor/dashboard' }, { label: 'Audit Documents', href: '/auditor/audit-documents' }, { label: 'Company' }]}
      />
      <EvidenceChecklist employerId={id} />
    </div>
  );
}
