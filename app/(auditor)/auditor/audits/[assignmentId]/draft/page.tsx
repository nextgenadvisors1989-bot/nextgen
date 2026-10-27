import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { requireAuditorApi } from '@/lib/auth/api-guards';
import { hasPermission } from '@/lib/auth/rbac';
import { PageHeader } from '@/components/ui/breadcrumb';
import { AuditWorkspace } from '@/components/audit/audit-workspace';
import { auditWorkspace, identityFor } from '@/services/auditor-workspace.service';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Audit Composer' };

export default async function AuditDraftPage({ params }: { params: Promise<{ assignmentId: string }> }) {
  const user = await requireAuditorApi(['audit_assignment.read']);
  const { assignmentId } = await params;
  const id = Number(assignmentId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const me = await identityFor(user.id);
  const bundle = await auditWorkspace(id, me.id);
  if (!bundle) notFound();

  // Nothing to compose until the audit has been started.
  if (!bundle.report) redirect(`/auditor/audits/${id}/start`);

  // A report already with the verifier (or closed) is read-only here.
  const status = String(bundle.report.status);
  if (['Submitted', 'Under Review', 'Approved', 'Archived'].includes(status)) {
    redirect(`/auditor/audits/${id}/preview`);
  }

  const canEdit = hasPermission(user.permissions, 'audit_report.update')
    && ['Draft', 'Changes Requested'].includes(status);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Composer"
        description={`${me.name} · ${me.auditor_code}`}
        breadcrumbs={[
          { label: 'Dashboard', href: '/auditor/dashboard' },
          { label: 'Assigned Audits', href: '/auditor/audits' },
          { label: String(bundle.assignment.assignment_number), href: `/auditor/audits/${id}` },
          { label: 'Composer' },
        ]}
      />
      <AuditWorkspace workspace={bundle} mode="draft" permissions={{ canEdit, canSubmit: canEdit }} />
    </div>
  );
}
