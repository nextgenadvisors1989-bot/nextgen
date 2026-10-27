import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePanel } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { CaparWorkspace } from '@/components/capar/capar-workspace';

export const metadata: Metadata = { title: 'CAPAR Report' };
export const dynamic = 'force-dynamic';

export default async function AdminCaparReportPage({ params }: { params: Promise<{ reportId: string }> }) {
  await requirePanel(['admin']);
  const id = Number((await params).reportId);
  if (!Number.isInteger(id) || id <= 0) notFound();
  return (
    <div className="space-y-6">
      <PageHeader
        title="CAPAR Report"
        description="Review the findings, verify them, or reopen an approved report for correction."
        breadcrumbs={[{ label: 'Dashboard', href: '/admin/dashboard' }, { label: 'CAPAR Reports', href: '/admin/capar' }, { label: 'Report' }]}
      />
      <CaparWorkspace reportId={id} panel="admin" />
    </div>
  );
}
