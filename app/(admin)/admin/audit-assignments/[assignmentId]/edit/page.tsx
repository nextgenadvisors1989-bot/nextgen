import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireAdminApi } from '@/lib/auth/api-guards';
import { PageHeader } from '@/components/ui/breadcrumb';
import { AssignmentForm } from '@/components/audit/assignment-form';
import { assignmentLookups, getAssignmentDetail } from '@/services/audit-assignment.service';

export const metadata: Metadata = { title: 'Edit Audit Assignment' };
export const dynamic = 'force-dynamic';

export default async function EditAssignmentPage({ params }: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = await params;
  await requireAdminApi(['audit_assignment.update']);

  const id = Number(assignmentId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const [detail, lookups] = await Promise.all([getAssignmentDetail(id), assignmentLookups()]);
  if (!detail) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Edit Assignment"
        description={`${detail.assignment.assignment_number} · schedule changes update the shared calendar automatically.`}
        breadcrumbs={[
          { label: 'Dashboard', href: '/admin/dashboard' },
          { label: 'Audit Assignments', href: '/admin/audit-assignments' },
          { label: String(detail.assignment.assignment_number), href: `/admin/audit-assignments/${id}` },
          { label: 'Edit' },
        ]}
      />
      <AssignmentForm mode="edit" assignment={detail.assignment} lookups={lookups} />
    </div>
  );
}
