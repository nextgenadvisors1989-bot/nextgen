import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireAdminApi } from '@/lib/auth/api-guards';
import { hasPermission } from '@/lib/auth/rbac';
import { PageHeader } from '@/components/ui/breadcrumb';
import { AssignmentDetail } from '@/components/audit/assignment-detail';
import { getAssignmentDetail, assignmentLookups } from '@/services/audit-assignment.service';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ assignmentId: string }> }): Promise<Metadata> {
  const { assignmentId } = await params;
  const detail = await getAssignmentDetail(Number(assignmentId));
  return { title: detail ? String(detail.assignment.assignment_number) : 'Audit Assignment' };
}

export default async function AssignmentDetailPage({ params }: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = await params;
  const user = await requireAdminApi(['audit_assignment.read']);

  const id = Number(assignmentId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const [detail, lookups] = await Promise.all([getAssignmentDetail(id), assignmentLookups()]);
  if (!detail) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title={detail.assignment.audit_title}
        description={`${detail.assignment.assignment_number} · ${detail.assignment.employer_name}${detail.assignment.unit_name ? ` · ${detail.assignment.unit_name}` : ''}`}
        breadcrumbs={[
          { label: 'Dashboard', href: '/admin/dashboard' },
          { label: 'Audit Assignments', href: '/admin/audit-assignments' },
          { label: String(detail.assignment.assignment_number) },
        ]}
      />
      <AssignmentDetail
        assignment={detail.assignment}
        history={detail.history.map((row) => ({
          id: Number(row.id), action: String(row.action), description: String(row.description ?? ''),
          user_name: String(row.user_name ?? '—'), user_role: String(row.user_role ?? ''), created_at: String(row.created_at),
        }))}
        files={detail.files.map((row) => ({
          id: Number(row.id), original_name: String(row.original_name), mime_type: String(row.mime_type),
          size_bytes: Number(row.size_bytes), version: Number(row.version ?? 1), category: row.category ?? null,
          created_at: String(row.created_at), uploaded_by_name: row.uploaded_by_name ?? null,
        }))}
        auditors={lookups.auditors}
        verifiers={lookups.verifiers}
        permissions={{
          update: hasPermission(user.permissions, 'audit_assignment.update'),
          remove: hasPermission(user.permissions, 'audit_assignment.delete'),
          reassign: hasPermission(user.permissions, 'audit_assignment.update'),
          generatePdf: hasPermission(user.permissions, 'audit_report.download'),
        }}
      />
    </div>
  );
}
