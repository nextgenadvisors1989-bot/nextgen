import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePanel } from '@/lib/auth/permission-check';
import { queryOne, type RowDataPacket } from '@/lib/db/mysql';
import { PageHeader } from '@/components/ui/breadcrumb';
import { ReportReview } from '@/components/reports/report-review';
import { getReportDetail } from '@/services/audit-report.service';

export const metadata: Metadata = { title: 'Review Report' };
export const dynamic = 'force-dynamic';

/**
 * The verifier's decision screen. Permission gates mirror the seeded verifier
 * permissions (`verifier.approve` / `verifier.reject`), so a verifier who may
 * only comment still gets the return-for-correction path.
 */
export default async function VerifierReviewPage({ params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  const user = await requirePanel(['verifier', 'admin', 'super_admin']);

  const id = Number(reportId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const isAdmin = user.roles.some((role) => ['admin', 'super_admin'].includes(role.slug));
  if (!isAdmin) {
    const assigned = await queryOne<RowDataPacket>(
      'SELECT id FROM verifier_assignments WHERE report_id = ? AND verifier_id = ? LIMIT 1',
      [id, user.id]
    );
    if (!assigned) notFound();
  }

  const detail = await getReportDetail(id);
  if (!detail) notFound();

  const report = detail.report as unknown as Record<string, unknown>;
  const anchor = (report.audit_date ?? report.audit_period_to ?? report.submitted_at) as string | null;
  const nextAuditSuggestion = anchor ? addYears(String(anchor).slice(0, 10), 1) : null;

  const canApprove = isAdmin
    ? user.permissions.includes('audit_report.approve')
    : user.permissions.includes('verifier.approve');
  const canReject = isAdmin
    ? user.permissions.includes('audit_report.reject')
    : user.permissions.includes('verifier.reject');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Review & Decide"
        description={`${String(report.report_number)} · ${String(report.audit_title)}`}
        breadcrumbs={[
          { label: 'Dashboard', href: '/verifier/dashboard' },
          { label: 'Verification Queue', href: '/verifier/reports' },
          { label: String(report.report_number), href: `/verifier/reports/${id}` },
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
        canApprove={canApprove}
        canReject={canReject}
        nextAuditSuggestion={nextAuditSuggestion}
        endpoint={`/api/verifier/reports/${id}`}
      />
    </div>
  );
}

function addYears(isoDate: string, years: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const target = new Date(Date.UTC(year + years, (month ?? 1) - 1, day ?? 1));
  return target.toISOString().slice(0, 10);
}
