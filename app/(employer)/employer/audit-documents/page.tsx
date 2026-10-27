import type { Metadata } from 'next';
import { requirePanel } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { EvidenceChecklist } from '@/components/evidence/evidence-checklist';

export const metadata: Metadata = { title: 'Audit Documents' };
export const dynamic = 'force-dynamic';

export default async function EmployerAuditDocumentsPage() {
  await requirePanel(['employer']);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Documents"
        description="List the documents your auditor will ask for, attach the files and submit the pack. Each submission is saved with its date and time."
        breadcrumbs={[{ label: 'Dashboard', href: '/employer/dashboard' }, { label: 'Audit Documents' }]}
      />
      <EvidenceChecklist employerId="me" />
    </div>
  );
}
