import type { Metadata } from 'next';
import { requireAdminApi } from '@/lib/auth/api-guards';
import { PageHeader } from '@/components/ui/breadcrumb';
import { ReportForm } from '@/components/reports/report-form';
import { reportLookups } from '@/services/audit-report.service';

export const metadata: Metadata = { title: 'Create Audit Report' };
export const dynamic = 'force-dynamic';

export default async function CreateReportPage() {
  await requireAdminApi(['audit_report.create']);
  const lookups = await reportLookups();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Create Audit Report"
        description="Report numbers are allocated as RPT/<year>/<serial>. Saving creates version 1; submitting generates the PDF and queues the verifier."
        breadcrumbs={[
          { label: 'Dashboard', href: '/admin/dashboard' },
          { label: 'Audit Reports', href: '/admin/audit-reports' },
          { label: 'Create Report' },
        ]}
      />
      <ReportForm mode="create" lookups={lookups} canSubmit />
    </div>
  );
}
