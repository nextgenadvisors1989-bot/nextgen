import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePanel } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { CaparWorkspace } from '@/components/capar/capar-workspace';

export const metadata: Metadata = { title: 'CAPAR Report' };
export const dynamic = 'force-dynamic';

export default async function EmployerCaparReportPage({ params }: { params: Promise<{ reportId: string }> }) {
  await requirePanel(['employer']);
  const id = Number((await params).reportId);
  if (!Number.isInteger(id) || id <= 0) notFound();
  return (
    <div className="space-y-6">
      <PageHeader
        title="CAPAR Report"
        description="The verified findings for your establishment and the action plan for each one."
        breadcrumbs={[{ label: 'Dashboard', href: '/employer/dashboard' }, { label: 'CAPAR Reports', href: '/employer/capar' }, { label: 'Report' }]}
      />
      <CaparWorkspace reportId={id} panel="employer" />
    </div>
  );
}
