import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireAdminApi } from '@/lib/auth/api-guards';
import { hasPermission } from '@/lib/auth/rbac';
import { PageHeader } from '@/components/ui/breadcrumb';
import { ReportDetail } from '@/components/reports/report-detail';
import { getReportDetail, reportLookups } from '@/services/audit-report.service';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ reportId: string }> }): Promise<Metadata> {
  const { reportId } = await params;
  const detail = await getReportDetail(Number(reportId));
  return { title: detail ? String(detail.report.report_number) : 'Audit Report' };
}

export default async function ReportDetailPage({ params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  const user = await requireAdminApi(['audit_report.read']);

  const id = Number(reportId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const [detail, lookups] = await Promise.all([getReportDetail(id), reportLookups()]);
  if (!detail) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title={String(detail.report.audit_title)}
        description={`${String(detail.report.report_number)} · ${String(detail.report.employer_name ?? '')} · version ${String(detail.report.current_version)}`}
        breadcrumbs={[
          { label: 'Dashboard', href: '/admin/dashboard' },
          { label: 'Audit Reports', href: '/admin/audit-reports' },
          { label: String(detail.report.report_number) },
        ]}
      />
      <ReportDetail
        report={detail.report as unknown as Record<string, unknown>}
        body={detail.body}
        versions={detail.versions.map((version) => ({
          id: Number(version.id), version: Number(version.version), change_summary: version.change_summary,
          created_at: String(version.created_at), created_by_name: version.created_by_name ?? null,
          pdf_file_id: version.pdf_file_id === null ? null : Number(version.pdf_file_id),
          pdf_original_name: version.pdf_original_name ?? null,
        }))}
        comments={detail.comments.map((comment) => ({
          id: Number(comment.id), version: comment.version === null ? null : Number(comment.version),
          comment_type: String(comment.comment_type), comment: String(comment.comment),
          section_ref: comment.section_ref, field_ref: comment.field_ref, severity: String(comment.severity),
          is_resolved: Number(comment.is_resolved), resolved_at: comment.resolved_at,
          parent_id: comment.parent_id === null ? null : Number(comment.parent_id),
          created_at: String(comment.created_at), author_name: comment.author_name ?? null,
          author_role: comment.author_role ?? null, author_email: comment.author_email ?? null,
        }))}
        verification={detail.verification.map((row) => ({
          id: Number(row.id), verifier_id: Number(row.verifier_id), status: String(row.status),
          assigned_at: String(row.assigned_at), due_date: row.due_date, completed_at: row.completed_at,
          remarks: row.remarks, verifier_name: row.verifier_name ?? null,
          verifier_email: row.verifier_email ?? null, assigned_by_name: row.assigned_by_name ?? null,
        }))}
        decisions={detail.decisions.map((row) => ({
          id: Number(row.id), action: String(row.action), comments: String(row.comments),
          reason: row.reason, created_at: String(row.created_at), verifier_name: row.verifier_name ?? null,
        }))}
        commentCounts={detail.commentCounts}
        verifiers={lookups.verifiers}
        permissions={{
          update: hasPermission(user.permissions, 'audit_report.update'),
          remove: hasPermission(user.permissions, 'audit_report.delete'),
          approve: hasPermission(user.permissions, 'audit_report.approve'),
          assign: hasPermission(user.permissions, 'audit_report.update'),
          download: hasPermission(user.permissions, 'audit_report.download'),
          submit: hasPermission(user.permissions, 'audit_report.update'),
        }}
      />
    </div>
  );
}
