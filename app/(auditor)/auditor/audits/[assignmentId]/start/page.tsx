import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { requireAuditorApi } from '@/lib/auth/api-guards';
import { hasPermission } from '@/lib/auth/rbac';
import { PageHeader } from '@/components/ui/breadcrumb';
import { AuditStartPanel } from '@/components/audit/audit-start-panel';
import { auditWorkspace, identityFor } from '@/services/auditor-workspace.service';
import * as reportRepo from '@/repositories/audit-report.repository';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Start Audit' };

export default async function StartAuditPage({ params }: { params: Promise<{ assignmentId: string }> }) {
  const user = await requireAuditorApi(['audit_assignment.read']);
  const { assignmentId } = await params;
  const id = Number(assignmentId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const me = await identityFor(user.id);
  const bundle = await auditWorkspace(id, me.id);
  if (!bundle) notFound();

  // Already under way? Take the auditor straight to the right view instead of
  // asking them to start something that is running.
  const status = String(bundle.assignment.status);
  if (['Submitted', 'Under Review', 'Approved', 'Changes Requested'].includes(status)) {
    redirect(`/auditor/audits/${id}${['Submitted', 'Under Review', 'Approved'].includes(status) ? '/preview' : '/draft'}`);
  }

  const linked = await reportRepo.findReportByAssignment(id);
  const canCreate = hasPermission(user.permissions, 'audit_report.create');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Start Audit"
        description={`${me.name} · ${me.auditor_code}`}
        breadcrumbs={[
          { label: 'Dashboard', href: '/auditor/dashboard' },
          { label: 'Assigned Audits', href: '/auditor/audits' },
          { label: String(bundle.assignment.assignment_number), href: `/auditor/audits/${id}` },
          { label: 'Start' },
        ]}
      />
      {canCreate ? (
        <AuditStartPanel
          assignment={bundle.assignment as unknown as Record<string, unknown>}
          existingReport={linked ? { id: Number(linked.id), report_number: linked.report_number } : null}
        />
      ) : (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Your account can view this audit but cannot create reports. Ask an administrator to grant you
          <code className="mx-1 rounded bg-white px-1">audit_report.create</code>.
        </p>
      )}
    </div>
  );
}
