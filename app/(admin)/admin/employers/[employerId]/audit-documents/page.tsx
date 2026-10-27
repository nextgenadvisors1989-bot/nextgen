import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePanel } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { EvidenceChecklist } from '@/components/evidence/evidence-checklist';

export const metadata: Metadata = { title: 'Audit Documents' };
export const dynamic = 'force-dynamic';

export default async function AdminEmployerAuditDocumentsPage({ params }: { params: Promise<{ employerId: string }> }) {
  await requirePanel(['admin']);
  const id = Number((await params).employerId);
  if (!Number.isInteger(id) || id <= 0) notFound();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Documents"
        description="The company's document pack. Administrators can read it and update it for the company."
        breadcrumbs={[{ label: 'Dashboard', href: '/admin/dashboard' }, { label: 'Employers', href: '/admin/employers' }, { label: 'Company', href: `/admin/employers/${id}` }, { label: 'Audit Documents' }]}
      />
      <EvidenceChecklist employerId={id} />
    </div>
  );
}
