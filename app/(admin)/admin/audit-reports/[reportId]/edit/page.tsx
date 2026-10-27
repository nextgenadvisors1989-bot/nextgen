import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireAdminApi } from '@/lib/auth/api-guards';
import { PageHeader } from '@/components/ui/breadcrumb';
import { ReportForm } from '@/components/reports/report-form';
import { getReportDetail, reportLookups } from '@/services/audit-report.service';

export const metadata: Metadata = { title: 'Edit Audit Report' };
export const dynamic = 'force-dynamic';

export default async function EditReportPage({ params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  await requireAdminApi(['audit_report.update']);

  const id = Number(reportId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const [detail, lookups] = await Promise.all([getReportDetail(id), reportLookups()]);
  if (!detail) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Edit Report"
        description={`${String(detail.report.report_number)} · version ${String(detail.report.current_version)} — saving the body creates a new revision so approvals stay reproducible.`}
        breadcrumbs={[
          { label: 'Dashboard', href: '/admin/dashboard' },
          { label: 'Audit Reports', href: '/admin/audit-reports' },
          { label: String(detail.report.report_number), href: `/admin/audit-reports/${id}` },
          { label: 'Edit' },
        ]}
      />
      <ReportForm
        mode="edit"
        report={detail.report as unknown as Record<string, unknown>}
        initialBody={{
          executive_summary: detail.body.executive_summary,
          methodology: detail.body.methodology,
          findings: detail.body.findings.map((finding) => ({
            reference: finding.reference ?? '', severity: finding.severity, clause: finding.clause ?? '',
            description: finding.description, evidence: finding.evidence ?? '',
            recommendation: finding.recommendation ?? '', employer_response: finding.employer_response ?? '',
            status: finding.status ?? 'Open', due_date: finding.due_date ?? '',
          })),
          scorecard: detail.body.scorecard.map((row) => ({
            section: row.section, max_score: String(row.max_score ?? ''),
            obtained_score: String(row.obtained_score ?? ''), remarks: row.remarks ?? '',
          })),
          observations: detail.body.observations,
          regulatory_references: detail.body.regulatory_references,
          recommendations: detail.body.recommendations,
        }}
        lookups={lookups}
      />
    </div>
  );
}
