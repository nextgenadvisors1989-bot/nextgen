import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePanel } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { CaparWorkspace } from '@/components/capar/capar-workspace';

export const metadata: Metadata = { title: 'Review CAPAR Report' };
export const dynamic = 'force-dynamic';

export default async function VerifierCaparReportPage({ params }: { params: Promise<{ reportId: string }> }) {
  await requirePanel(['verifier']);
  const id = Number((await params).reportId);
  if (!Number.isInteger(id) || id <= 0) notFound();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Review CAPAR Report"
        description="Check each finding against its photo and the Act or Rule, then approve the report or return it with comments."
        breadcrumbs={[{ label: 'Dashboard', href: '/verifier/dashboard' }, { label: 'CAPAR Reports', href: '/verifier/capar' }, { label: 'Review' }]}
      />
      <CaparWorkspace reportId={id} panel="verifier" />
    </div>
  );
}
