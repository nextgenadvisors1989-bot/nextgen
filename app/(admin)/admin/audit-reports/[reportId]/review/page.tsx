import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireAdminApi } from '@/lib/auth/api-guards';
import { hasPermission } from '@/lib/auth/rbac';
import { PageHeader } from '@/components/ui/breadcrumb';
import { ReportReview } from '@/components/reports/report-review';
import { getReportDetail } from '@/services/audit-report.service';

export const metadata: Metadata = { title: 'Review Report' };
export const dynamic = 'force-dynamic';

/**
 * Review & decide. Suggests the next audit date from the audit frequency that
 * applied to the assignment (annual by default) so the re-audit reminder ladder
 * has something to hang off the moment the report is approved.
 */
export default async function ReviewReportPage({ params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  const user = await requireAdminApi(['audit_report.read']);

  const id = Number(reportId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const detail = await getReportDetail(id);
  if (!detail) notFound();

  const report = detail.report as unknown as Record<string, unknown>;
  const anchor = (report.audit_date ?? report.audit_period_to ?? report.submitted_at) as string | null;
  const nextAuditSuggestion = anchor ? addYears(String(anchor).slice(0, 10), 1) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Review & Decide"
        description={`${String(report.report_number)} · ${String(report.audit_title)}`}
        breadcrumbs={[
          { label: 'Dashboard', href: '/admin/dashboard' },
          { label: 'Audit Reports', href: '/admin/audit-reports' },
          { label: String(report.report_number), href: `/admin/audit-reports/${id}` },
          { label: 'Review' },
        ]}
      />
      <ReportReview
        report={report}
        body={detail.body}
        comments={detail.comments.map((comment) => ({
          id: Number(comment.id), comment_type: String(comment.comment_type), comment: String(comment.comment),
          author_name: comment.author_name ?? null, created_at: String(comment.created_at),
          is_resolved: Number(comment.is_resolved), severity: String(comment.severity),
        }))}
        versions={detail.versions.map((version) => ({
          version: Number(version.version), change_summary: version.change_summary,
          created_at: String(version.created_at), created_by_name: version.created_by_name ?? null,
          pdf_file_id: version.pdf_file_id === null ? null : Number(version.pdf_file_id),
        }))}
        canApprove={hasPermission(user.permissions, 'audit_report.approve')}
        canReject={hasPermission(user.permissions, 'audit_report.reject')}
        nextAuditSuggestion={nextAuditSuggestion}
      />
    </div>
  );
}

/** Plain date arithmetic on an ISO date — no timezone surprises. */
function addYears(isoDate: string, years: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const target = new Date(Date.UTC(year + years, (month ?? 1) - 1, day ?? 1));
  return target.toISOString().slice(0, 10);
}
