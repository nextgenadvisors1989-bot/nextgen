import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePanel } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { CaparWorkspace } from '@/components/capar/capar-workspace';

export const metadata: Metadata = { title: 'CAPAR Report' };
export const dynamic = 'force-dynamic';

export default async function AuditorCaparReportPage({ params }: { params: Promise<{ reportId: string }> }) {
  await requirePanel(['auditor']);
  const id = Number((await params).reportId);
  if (!Number.isInteger(id) || id <= 0) notFound();
  return (
    <div className="space-y-6">
      <PageHeader
        title="CAPAR Report"
        description="Check each document, record what you found, then submit the report to the verifier. You can keep correcting it after submitting."
        breadcrumbs={[{ label: 'Dashboard', href: '/auditor/dashboard' }, { label: 'CAPAR Reports', href: '/auditor/capar' }, { label: 'Report' }]}
      />
      <CaparWorkspace reportId={id} panel="auditor" />
    </div>
  );
}
