import type { Metadata } from 'next';
import { requireAdminApi } from '@/lib/auth/api-guards';
import { hasPermission } from '@/lib/auth/rbac';
import { PageHeader } from '@/components/ui/breadcrumb';
import { AssignmentForm } from '@/components/audit/assignment-form';
import { assignmentLookups } from '@/services/audit-assignment.service';

export const metadata: Metadata = { title: 'Create Audit Assignment' };
export const dynamic = 'force-dynamic';

export default async function CreateAssignmentPage() {
  const user = await requireAdminApi(['audit_assignment.create']);
  const lookups = await assignmentLookups();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Create Audit Assignment"
        description="Assignment numbers are allocated automatically as AUD/<year>/<serial>. The auditor, verifier, employer and administrators are notified as soon as you save."
        breadcrumbs={[
          { label: 'Dashboard', href: '/admin/dashboard' },
          { label: 'Audit Assignments', href: '/admin/audit-assignments' },
          { label: 'Create Assignment' },
        ]}
      />
      <AssignmentForm
        mode="create"
        lookups={lookups}
        canBulk={hasPermission(user.permissions, 'audit_assignment.create')}
      />
    </div>
  );
}
