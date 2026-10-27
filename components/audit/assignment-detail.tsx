'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { Button, LinkButton } from '@/components/ui/button';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/input';
import { Tabs } from '@/components/ui/tabs';
import { DataTable, DescriptionGrid, DetailRow, type Column } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/empty-state';
import { FileList } from '@/components/files/file-list';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/utils/api-client';
import { formatDate, formatDateTime, daysRemaining } from '@/lib/utils/dates';
import { formatCurrency, formatNumber } from '@/lib/utils/formatting';
import type { AssignmentListRow } from '@/repositories/audit-assignment.repository';

interface HistoryRow extends Record<string, unknown> {
  id: number; action: string; description: string; user_name: string; user_role: string; created_at: string;
}
interface FileRow extends Record<string, unknown> {
  id: number; original_name: string; mime_type: string; size_bytes: number; version: number;
  category: string | null; created_at: string; uploaded_by_name: string | null;
}

/**
 * Audit assignment detail: what the audit covers, live progress, the report it
 * produced, evidence files and the full activity trail. Reassign and cancel are
 * inline modals because both need a reason that gets emailed to the auditor.
 */
export function AssignmentDetail({
  assignment, history, files, auditors, verifiers, permissions,
}: {
  assignment: AssignmentListRow;
  history: HistoryRow[];
  files: FileRow[];
  auditors: {
    id: number; name: string; auditor_code: string; email: string; specialization: string | null;
    max_concurrent_audits: number; open_assignments: number;
  }[];
  verifiers: { id: number; name: string; email: string; pending_reviews: number }[];
  permissions: { update: boolean; remove: boolean; reassign: boolean; generatePdf: boolean };
}) {
  const router = useRouter();
  const { success, error: errorToast } = useToast();
  const [, setTab] = useState('overview');
  const [reassignOpen, setReassignOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [reassignForm, setReassignForm] = useState({ auditor_id: String(assignment.auditor_id ?? ''), verifier_id: assignment.verifier_id ? String(assignment.verifier_id) : '', reason: '', notify: true,
  });
  const [cancelReason, setCancelReason] = useState('');

  const remaining = daysRemaining(assignment.due_date);
  const isOpen = !['Approved', 'Cancelled', 'Rejected'].includes(assignment.status);
  const overdue = remaining !== null && remaining < 0 && isOpen;

  async function submitReassign() {
    setWorking(true);
    const result = await api.post<{ capacity: { auditorName: string }; warnings: string[] }>(
      `/api/admin/audit-assignments/${assignment.id}/reassign`,
      { ...reassignForm, auditor_id: Number(reassignForm.auditor_id), verifier_id: reassignForm.verifier_id ? Number(reassignForm.verifier_id) : null }
    );
    setWorking(false);
    if (result.ok) {
      const raw = result.raw as { capacity: { auditorName: string }; warnings: string[] };
      success('Assignment reassigned', `Now with ${raw.capacity.auditorName}. Both auditors and the verifier were notified.`);
      for (const warning of raw.warnings ?? []) errorToast('Heads up', warning);
      setReassignOpen(false);
      router.refresh();
    } else {
      errorToast('Could not reassign', result.message);
    }
  }

  async function submitCancel() {
    setWorking(true);
    const result = await api.post(`/api/admin/audit-assignments/${assignment.id}/cancel`, { reason: cancelReason });
    setWorking(false);
    if (result.ok) {
      success('Assignment cancelled', 'The auditor has been notified with your reason.');
      setCancelOpen(false);
      router.refresh();
    } else {
      errorToast('Could not cancel', result.message);
    }
  }

  async function submitDelete() {
    setWorking(true);
    const result = await api.delete(`/api/admin/audit-assignments/${assignment.id}`);
    setWorking(false);
    if (result.ok) {
      success('Assignment deleted', `${assignment.assignment_number} was removed.`);
      router.push('/admin/audit-assignments');
    } else {
      errorToast('Could not delete', result.message);
      setDeleteOpen(false);
    }
  }

  const historyColumns: Column<HistoryRow>[] = [
    { key: 'created_at', header: 'When', width: 170, render: (row) => <span className="text-xs text-ink-muted">{formatDateTime(row.created_at)}</span> },
    { key: 'action', header: 'Action', width: 110, render: (row) => <Badge tone="slate">{row.action}</Badge> },
    { key: 'description', header: 'Detail', render: (row) => <span className="text-ink-soft">{row.description}</span> },
    { key: 'user', header: 'By', width: 180, hideOnMobile: true, render: (row) => (
      <span className="text-xs text-ink-muted">{row.user_name}<span className="block">{row.user_role}</span></span>
    ) },
  ];

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <StatusBadge status={assignment.status} />
            <Badge tone={priorityTone(assignment.priority)}>{assignment.priority} priority</Badge>
            <Badge tone="slate">{assignment.assignment_type.replace('_', ' ')}</Badge>
            {overdue && <Badge tone="danger">{Math.abs(remaining as number)} day(s) overdue</Badge>}
            {assignment.report_number && <Badge tone="brand">{assignment.report_number}</Badge>}
          </div>
          <h1 className="text-xl font-semibold text-ink">{assignment.audit_title}</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {assignment.assignment_number} · {assignment.employer_name}
            {assignment.unit_name ? ` · ${assignment.unit_name}` : ''}
            {assignment.department_name ? ` · ${assignment.department_name}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {permissions.generatePdf && assignment.report_id && (
            <a className="btn btn-outline btn-sm" href={`/api/pdf/audit-report/${assignment.report_id}`} target="_blank" rel="noreferrer">
              Download Report PDF
            </a>
          )}
          {permissions.reassign && isOpen && (
            <Button variant="outline" size="sm" onClick={() => setReassignOpen(true)}>Reassign</Button>
          )}
          {permissions.update && isOpen && (
            <LinkButton href={`/admin/audit-assignments/${assignment.id}/edit`} size="sm">Edit</LinkButton>
          )}
          {permissions.update && isOpen && (
            <Button variant="danger" size="sm" onClick={() => { setCancelOpen(true); setCancelReason(''); }}>Cancel Audit</Button>
          )}
          {permissions.remove && !assignment.report_id && (
            <Button variant="outline" size="sm" onClick={() => setDeleteOpen(true)}>Delete</Button>
          )}
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card><Metric label="Progress" value={`${Number(assignment.progress_percent ?? 0)}%`} hint={`${assignment.revision_count ?? 0} revision(s)`} /></Card>
        <Card><Metric label="Due" value={formatDate(assignment.due_date)} hint={remaining === null ? '—' : remaining >= 0 ? `${remaining} day(s) left` : `${Math.abs(remaining)} day(s) late`} danger={overdue} /></Card>
        <Card><Metric label="Audit Period" value={`${formatDate(assignment.start_date)} → ${formatDate(assignment.end_date)}`} hint={assignment.audit_end_meeting_at ? `Closing meeting ${formatDateTime(assignment.audit_end_meeting_at)}` : 'No closing meeting set'} /></Card>
        <Card><Metric label="Fee" value={assignment.fee_amount ? formatCurrency(Number(assignment.fee_amount)) : 'Not set'} hint={assignment.module_name ?? 'Standard audit'} /></Card>
      </div>

      <Card padded={false}>
        <Tabs
          defaultTab="overview"
          onChange={setTab}
          items={[
            {
              key: 'overview',
              label: 'Overview',
              content: (
        <CardBody className="space-y-6">
          <DescriptionGrid columns={3}>
            <DetailRow label="Assignment No." value={<span className="font-mono text-xs">{assignment.assignment_number}</span>} />
            <DetailRow label="Assignment Type" value={assignment.assignment_type.replace('_', ' ')} />
            <DetailRow label="Audit Module" value={assignment.module_name ?? 'Standard audit'} />
            <DetailRow label="Employer" value={
              <Link className="text-brand-600 hover:underline" href={`/admin/employers/${assignment.employer_id}`}>
                {assignment.employer_name} {assignment.employer_code ? `(${assignment.employer_code})` : ''}
              </Link>
            } />
            <DetailRow label="Unit" value={assignment.unit_name ?? 'All units'} />
            <DetailRow label="Department" value={assignment.department_name ?? 'All departments'} />
            <DetailRow label="Auditor" value={
              <span>
                <Link className="text-brand-600 hover:underline" href={`/admin/auditors/${assignment.auditor_id}`}>{assignment.auditor_name}</Link>
                <span className="block text-xs text-ink-muted">{assignment.auditor_email}{assignment.auditor_mobile ? ` · ${assignment.auditor_mobile}` : ''}</span>
              </span>
            } />
            <DetailRow label="Verifier" value={assignment.verifier_name ?? 'Not assigned'} />
            <DetailRow label="Assigned By" value={assignment.assigned_by_name ?? '—'} />
            <DetailRow label="Priority" value={<Badge tone={priorityTone(assignment.priority)}>{assignment.priority}</Badge>} />
            <DetailRow label="Status" value={<StatusBadge status={assignment.status} />} />
            <DetailRow label="Revisions" value={formatNumber(Number(assignment.revision_count ?? 0))} />
          </DescriptionGrid>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-ink">Scope</h3>
            <p className="whitespace-pre-line rounded-lg border border-line bg-slate-50 p-3 text-sm text-ink-soft">
              {assignment.scope || 'No scope recorded for this assignment.'}
            </p>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-ink">Instructions to the auditor</h3>
            <p className="whitespace-pre-line rounded-lg border border-line bg-slate-50 p-3 text-sm text-ink-soft">
              {assignment.instructions || 'No specific instructions were given.'}
            </p>
          </div>
        </CardBody>
      
              ),
            },
            {
              key: 'progress',
              label: `Progress (${Number(assignment.progress_percent ?? 0)}%)`,
              content: (
        <CardBody className="space-y-6">
          <div>
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-medium text-ink">Completion</span>
              <span className="text-ink-muted">{Number(assignment.progress_percent ?? 0)}% of the checklist submitted</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.min(100, Number(assignment.progress_percent ?? 0))}%` }} />
            </div>
          </div>

          <DescriptionGrid columns={2}>
            <DetailRow label="Status" value={<StatusBadge status={assignment.status} />} />
            <DetailRow label="Completed At" value={assignment.completed_at ? formatDateTime(assignment.completed_at) : 'Not yet completed'} />
            <DetailRow label="Started" value={formatDate(assignment.start_date)} />
            <DetailRow label="Due" value={formatDate(assignment.due_date)} />
            <DetailRow label="Submitted" value={assignment.report_status ? `Report ${assignment.report_status}` : 'No submission yet'} />
            <DetailRow label="Report No." value={assignment.report_number ?? '—'} />
          </DescriptionGrid>

          <div className="rounded-lg border border-line bg-slate-50 p-4 text-sm text-ink-soft">
            Auditors update progress from their own workspace (<span className="font-mono text-xs">/auditor/audits/{assignment.id}</span>).
            Everything recorded there — checklist answers, findings, evidence — flows into this assignment and, on submission,
            into the verifier queue for review.
          </div>
        </CardBody>
      
              ),
            },
            {
              key: 'files',
              label: `Documents (${files.length})`,
              content: (
        <CardBody>
          {files.length ? (
            <FileList files={files.map((file) => ({
              id: Number(file.id), original_name: String(file.original_name), mime_type: String(file.mime_type),
              size_bytes: Number(file.size_bytes), version: Number(file.version ?? 1), category: file.category ?? null,
              created_at: String(file.created_at), uploaded_by_name: file.uploaded_by_name ?? null,
              download_url: `/api/files/${file.id}/download`,
            }))} />
          ) : (
            <EmptyState
              title="No documents yet"
              subtitle="Evidence uploaded by the auditor against this assignment appears here, with every version kept."
            />
          )}
        </CardBody>
      
              ),
            },
            {
              key: 'history',
              label: `History (${history.length})`,
              content: (
        <div>
          <DataTable<HistoryRow>
            columns={historyColumns}
            data={history.map((row) => ({ ...row, id: Number(row.id) }))}
            rowKey={(row) => row.id}
            emptyTitle="No activity recorded yet"
            emptySubtitle="Every create, update, reassign and status change is logged here with the user who made it."
          />
        </div>
      
              ),
            },
            {
              key: 'report',
              label: 'Report',
              content: (
        <CardBody className="space-y-4">
          {assignment.report_id ? (
            <>
              <DescriptionGrid columns={2}>
                <DetailRow label="Report No." value={<span className="font-mono text-xs">{assignment.report_number}</span>} />
                <DetailRow label="Report Status" value={<StatusBadge status={assignment.report_status ?? 'Draft'} />} />
                <DetailRow label="Generated" value={'—'} />
                <DetailRow label="Next Audit Due" value={'—'} />
              </DescriptionGrid>
              <div className="flex flex-wrap gap-2">
                <LinkButton href={`/admin/audit-reports/${assignment.report_id}`} size="sm">Open Report</LinkButton>
                <a className="btn btn-outline btn-sm" href={`/api/pdf/audit-report/${assignment.report_id}`} target="_blank" rel="noreferrer">
                  Download PDF
                </a>
              </div>
            </>
          ) : (
            <EmptyState
              title={isOpen ? 'No report submitted yet' : 'No report was filed'}
              subtitle="When the auditor submits this assignment the platform generates version 1 of the report, saves the PDF and emails the verifier, administrators and employer."
            />
          )}
        </CardBody>
      
              ),
            },
          ]}
        />
      </Card>

      {/* ------------------------------------------------------------- modals */}
      <Modal
        open={reassignOpen}
        onClose={() => setReassignOpen(false)}
        title="Reassign this audit"
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setReassignOpen(false)}>Keep Auditor</Button>
            <Button onClick={submitReassign} loading={working}
              disabled={!reassignForm.auditor_id || reassignForm.reason.trim().length < 4 || reassignForm.auditor_id === String(assignment.auditor_id)}>
              Reassign
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-ink-soft">
            Currently with <strong>{assignment.auditor_name}</strong>. Both the outgoing and incoming auditor are notified,
            and the calendar entry moves to the new auditor.
          </p>
          <Select
            label="New Auditor" required searchable
            value={reassignForm.auditor_id}
            onChange={(value) => setReassignForm((current) => ({ ...current, auditor_id: value }))}
            options={auditors.map((entry) => ({
              value: String(entry.id),
              label: `${entry.name} (${entry.auditor_code})`,
              hint: `${entry.open_assignments}/${entry.max_concurrent_audits} open${entry.specialization ? ` · ${entry.specialization}` : ''}`,
            }))}
          />
          <Select
            label="Verifier" clearable searchable placeholder="Keep the current verifier"
            value={reassignForm.verifier_id}
            onChange={(value) => setReassignForm((current) => ({ ...current, verifier_id: value }))}
            options={verifiers.map((verifier) => ({
              value: String(verifier.id), label: verifier.name,
              hint: `${verifier.pending_reviews} awaiting review · ${verifier.email}`,
            }))}
          />
          <Textarea label="Reason" required rows={3} value={reassignForm.reason}
            onChange={(event) => setReassignForm((current) => ({ ...current, reason: event.target.value }))}
            helper="Shared with the auditor in the notification and stored on the assignment." />
        </div>
      </Modal>

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Cancel this audit"
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>Keep Assignment</Button>
            <Button variant="danger" onClick={submitCancel} loading={working} disabled={cancelReason.trim().length < 4}>Cancel Audit</Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-ink-soft">
            {assignment.assignment_number} — {assignment.audit_title}. The status becomes Cancelled, calendar entries are
            marked cancelled and the auditor is told why. The record itself is kept for the audit trail.
          </p>
          <Textarea label="Reason" required rows={3} value={cancelReason}
            onChange={(event) => setCancelReason(event.target.value)} />
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={submitDelete}
        loading={working}
        title="Delete this assignment?"
        message={`${assignment.assignment_number} — ${assignment.audit_title} will be removed along with its calendar entries. This cannot be undone.`}
        confirmLabel="Delete Assignment"
        variant="danger"
      />
    </>
  );
}

function Metric({ label, value, hint, danger }: { label: string; value: string; hint: string; danger?: boolean }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</p>
      <p className={danger ? 'mt-1 text-lg font-semibold text-red-600' : 'mt-1 text-lg font-semibold text-ink'}>{value}</p>
      <p className="mt-0.5 text-xs text-ink-muted">{hint}</p>
    </div>
  );
}

function priorityTone(priority: string): 'slate' | 'brand' | 'warning' | 'danger' {
  switch (priority) {
    case 'Urgent': return 'danger';
    case 'High': return 'warning';
    case 'Medium': return 'brand';
    default: return 'slate';
  }
}
