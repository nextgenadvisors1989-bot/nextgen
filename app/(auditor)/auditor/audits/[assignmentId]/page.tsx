import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAuditorApi } from '@/lib/auth/api-guards';
import { hasPermission } from '@/lib/auth/rbac';
import { PageHeader } from '@/components/ui/breadcrumb';
import { Card, CardHeader, CardBody, StatCard } from '@/components/ui/card';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { LinkButton } from '@/components/ui/button';
import { FileList, type FileListEntry } from '@/components/files/file-list';
import { auditWorkspace, identityFor } from '@/services/auditor-workspace.service';
import { formatDate, formatDateTime } from '@/lib/utils/dates';
import { formatNumber } from '@/lib/utils/formatting';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ assignmentId: string }> }): Promise<Metadata> {
  const { assignmentId } = await params;
  const user = await requireAuditorApi(['audit_assignment.read']);
  const me = await identityFor(user.id);
  const bundle = await auditWorkspace(Number(assignmentId), me.id).catch(() => null);
  return { title: bundle ? String(bundle.assignment.audit_title) : 'Audit' };
}

export default async function AuditorAuditPage({ params }: { params: Promise<{ assignmentId: string }> }) {
  const user = await requireAuditorApi(['audit_assignment.read']);
  const { assignmentId } = await params;
  const id = Number(assignmentId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const me = await identityFor(user.id);
  const bundle = await auditWorkspace(id, me.id);
  if (!bundle) notFound();

  const { assignment, report, openCorrections, files, history, checklist, comments } = bundle;
  const canEdit = hasPermission(user.permissions, 'audit_report.update');
  const canSubmit = hasPermission(user.permissions, 'audit_report.update');
  const blocking = checklist.filter((item) => item.required && !item.done);
  const started = Boolean(report);

  return (
    <div className="space-y-6">
      <PageHeader
        title={String(assignment.audit_title)}
        description={`${assignment.assignment_number} · ${String(assignment.employer_name ?? '')}${assignment.unit_name ? ` · ${String(assignment.unit_name)}` : ''}`}
        breadcrumbs={[
          { label: 'Dashboard', href: '/auditor/dashboard' },
          { label: 'Assigned Audits', href: '/auditor/audits' },
          { label: String(assignment.assignment_number) },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={String(assignment.status)} />
            {started ? (
              <LinkButton
                href={`/auditor/audits/${id}/${['Submitted', 'Under Review', 'Approved'].includes(String(assignment.status)) ? 'preview' : 'draft'}`}
                size="sm"
              >
                {['Submitted', 'Under Review', 'Approved'].includes(String(assignment.status)) ? 'Preview Report' : 'Open Composer'}
              </LinkButton>
            ) : (
              <LinkButton href={`/auditor/audits/${id}/start`} size="sm">Start Audit</LinkButton>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Progress" value={`${Number(assignment.progress_percent ?? 0)}%`} hint={`Revision ${Number(assignment.revision_count ?? 0)}`} tone="brand" />
        <StatCard
          label="Compliance"
          value={report?.score_percentage === null || report?.score_percentage === undefined ? '—' : `${Number(report.score_percentage).toFixed(1)}%`}
          hint={report ? `Version ${Number(report.current_version ?? 1)}` : 'Not scored yet'}
          tone="emerald"
        />
        <StatCard label="Findings" value={formatNumber(Number(report?.critical_findings ?? 0) + Number(report?.major_findings ?? 0) + Number(report?.minor_findings ?? 0))}
          hint={`${formatNumber(report?.critical_findings ?? 0)} critical · ${formatNumber(report?.observations ?? 0)} observation(s)`}
          tone={Number(report?.critical_findings ?? 0) ? 'red' : 'amber'} />
        <StatCard label="Open Corrections" value={formatNumber(openCorrections.length)} hint={`${formatNumber(comments.length)} comment(s) on the report`} tone={openCorrections.length ? 'red' : 'emerald'} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title="Audit Particulars" description="The brief recorded by the administrators when this audit was assigned." />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Fact label="Employer" value={String(assignment.employer_name ?? '—')} />
            <Fact label="Unit" value={String(assignment.unit_name ?? 'All units')} />
            <Fact label="Department" value={String(assignment.department_name ?? 'All departments')} />
            <Fact label="Type" value={String(assignment.assignment_type ?? '—').replace('_', ' ')} />
            <Fact label="Priority" value={String(assignment.priority ?? '—')} />
            <Fact label="Verifier" value={String(assignment.verifier_name ?? 'Not assigned')} />
            <Fact label="Audit window" value={`${formatDate(assignment.start_date as string)} → ${formatDate(assignment.end_date as string)}`} />
            <Fact label="Due date" value={formatDate(assignment.due_date as string)} />
            <Fact label="Closing meeting" value={formatDateTime(assignment.audit_end_meeting_at as string)} />
            <Fact label="Fee" value={assignment.fee_amount ? `₹ ${Number(assignment.fee_amount).toLocaleString('en-IN')}` : '—'} />
          </CardBody>
          {assignment.scope ? (
            <div className="border-t border-line px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Scope</p>
              <p className="mt-1 text-sm text-ink-soft">{String(assignment.scope)}</p>
            </div>
          ) : null}
          {assignment.instructions ? (
            <div className="border-t border-line px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Instructions</p>
              <p className="mt-1 text-sm text-ink-soft">{String(assignment.instructions)}</p>
            </div>
          ) : null}
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Before you submit" description="Required items must be complete." />
            <CardBody className="space-y-3">
              {checklist.map((item) => (
                <div key={item.key} className="flex items-start gap-2">
                  <span
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                      item.done ? 'bg-emerald-100 text-emerald-700' : item.required ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500'
                    }`}
                    aria-hidden
                  >
                    {item.done ? '✓' : item.required ? '!' : '·'}
                  </span>
                  <div className="min-w-0">
                    <p className={`text-sm ${item.done ? 'text-ink-soft' : 'font-medium text-ink-strong'}`}>{item.label}</p>
                    {!item.done ? <p className="text-xs text-ink-muted">{item.hint}</p> : null}
                  </div>
                </div>
              ))}
            </CardBody>
            <div className="border-t border-line px-4 py-3">
              {started ? (
                <LinkButton
                  href={`/auditor/audits/${id}/${['Submitted', 'Under Review', 'Approved'].includes(String(assignment.status)) ? 'preview' : 'draft'}`}
                  className="w-full"
                >
                  {blocking.length && canSubmit ? `${blocking.length} item(s) outstanding — continue` : 'Continue the report'}
                </LinkButton>
              ) : (
                canEdit
                  ? <LinkButton href={`/auditor/audits/${id}/start`} className="w-full">Start this audit</LinkButton>
                  : <p className="text-sm text-ink-muted">Your account cannot create reports — ask an administrator for the report permission.</p>
              )}
            </div>
          </Card>

          <Card padded={false}>
            <CardHeader title="Evidence" description="Files filed against this audit." action={<Badge tone="slate">{files.length}</Badge>} />
            <CardBody>
              <FileList
                files={files as unknown as FileListEntry[]}
                canDelete={false}
                emptyMessage="Evidence you upload in the composer appears here."
              />
            </CardBody>
          </Card>

          <Card padded={false}>
            <CardHeader title="Recent Activity" description="Status changes and notifications on this audit." />
            <CardBody className="space-y-3">
              {history.length === 0 ? (
                <p className="text-sm text-ink-muted">Nothing recorded yet.</p>
              ) : history.slice(0, 8).map((entry) => (
                <div key={entry.id} className="border-l-2 border-line pl-3">
                  <p className="text-sm text-ink-soft">{entry.description ?? String(entry.action)}</p>
                  <p className="text-xs text-ink-muted">
                    {entry.user_name ? `${entry.user_name} · ` : ''}{formatDateTime(entry.created_at)}
                  </p>
                </div>
              ))}
              <Link href={`/auditor/audits/${id}/draft`} className="text-sm text-brand-600 hover:underline">
                Open the workspace for the full history →
              </Link>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
      <p className="mt-0.5 text-sm text-ink-strong">{value}</p>
    </div>
  );
}
