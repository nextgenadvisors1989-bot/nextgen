import type { Metadata } from 'next';
import { requireAdminApi } from '@/lib/auth/api-guards';
import { hasPermission } from '@/lib/auth/rbac';
import { PageHeader } from '@/components/ui/breadcrumb';
import { AssignmentsTable } from '@/components/audit/assignment-table';
import { assignmentLookups, assignmentStats } from '@/services/audit-assignment.service';

export const metadata: Metadata = { title: 'Audit Assignments' };
export const dynamic = 'force-dynamic';

export default async function AuditAssignmentsPage() {
  const user = await requireAdminApi(['audit_assignment.read']);
  const [lookups, stats] = await Promise.all([assignmentLookups(), assignmentStats()]);

  const verifiers = await verifierOptionsForFilter();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Assignments"
        description="Every audit, assessment, risk study, work-permit inspection and advisory engagement with its auditor, verifier, schedule and live progress."
        breadcrumbs={[{ label: 'Dashboard', href: '/admin/dashboard' }, { label: 'Audit Assignments' }]}
      />
      <AssignmentsTable
        stats={stats}
        employers={lookups.employers.map((employer) => ({
          value: String(employer.id),
          label: `${employer.company_name}${employer.employer_code ? ` (${employer.employer_code})` : ''}`,
        }))}
        auditors={lookups.auditors.map((auditor) => ({
          value: String(auditor.id),
          label: `${auditor.name} (${auditor.auditor_code})`,
        }))}
        verifiers={verifiers}
        permissions={{
          create: hasPermission(user.permissions, 'audit_assignment.create'),
          update: hasPermission(user.permissions, 'audit_assignment.update'),
          remove: hasPermission(user.permissions, 'audit_assignment.delete'),
        }}
      />
    </div>
  );
}

/** Verifier picker for the register filter — same source as the assignment form. */
async function verifierOptionsForFilter() {
  const { verifierOptions } = await import('@/repositories/audit-assignment.repository');
  const rows = await verifierOptions();
  return rows.map((row) => ({ value: String(row.id), label: String(row.name) }));
}
