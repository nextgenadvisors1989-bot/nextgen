import type { Metadata } from 'next';
import { requireAdminApi } from '@/lib/auth/api-guards';
import { hasPermission } from '@/lib/auth/rbac';
import { PageHeader } from '@/components/ui/breadcrumb';
import { ReportsTable } from '@/components/reports/reports-table';
import { reportLookups, reportStats } from '@/services/audit-report.service';

export const metadata: Metadata = { title: 'Audit Reports' };
export const dynamic = 'force-dynamic';

export default async function AuditReportsPage() {
  const user = await requireAdminApi(['audit_report.read']);
  const [lookups, stats] = await Promise.all([reportLookups(), reportStats()]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Reports"
        description="Every report filed by an auditor with its score, findings, verification state and version history — the register the specification calls for."
        breadcrumbs={[{ label: 'Dashboard', href: '/admin/dashboard' }, { label: 'Audit Reports' }]}
      />
      <ReportsTable
        stats={stats}
        employers={lookups.employers.map((employer) => ({ value: String(employer.id), label: employer.company_name }))}
        auditors={lookups.auditors.map((auditor) => ({ value: String(auditor.id), label: `${auditor.name} (${auditor.auditor_code})` }))}
        verifiers={lookups.verifiers.map((verifier) => ({ value: String(verifier.id), label: verifier.name }))}
        permissions={{
          create: hasPermission(user.permissions, 'audit_report.create'),
          update: hasPermission(user.permissions, 'audit_report.update'),
          remove: hasPermission(user.permissions, 'audit_report.delete'),
          approve: hasPermission(user.permissions, 'audit_report.approve'),
          download: hasPermission(user.permissions, 'audit_report.download'),
        }}
      />
    </div>
  );
}
