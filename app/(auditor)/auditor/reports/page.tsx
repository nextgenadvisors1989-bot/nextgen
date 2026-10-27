import type { Metadata } from 'next';
import { requireAuditorApi } from '@/lib/auth/api-guards';
import { PageHeader } from '@/components/ui/breadcrumb';
import { AuditorReportTable } from '@/components/audit/auditor-report-table';
import { identityFor, myReportStats } from '@/services/auditor-workspace.service';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'My Reports' };

export default async function AuditorReportsPage() {
  const user = await requireAuditorApi(['audit_report.read']);
  const me = await identityFor(user.id);
  const stats = await myReportStats(me.id);

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Reports"
        description={`${me.name} · ${me.auditor_code} — every report you have drafted, submitted, had returned or had approved.`}
        breadcrumbs={[
          { label: 'Dashboard', href: '/auditor/dashboard' },
          { label: 'My Reports' },
        ]}
      />
      <AuditorReportTable stats={stats} />
    </div>
  );
}
