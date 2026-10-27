'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardBody } from '@/components/ui/card';
import { Button, LinkButton } from '@/components/ui/button';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { Textarea, Input, Checkbox } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Tabs } from '@/components/ui/tabs';
import { DataTable, DescriptionGrid, DetailRow, type Column } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/empty-state';
import { ProgressBar } from '@/components/ui/progress-bar';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/utils/api-client';
import { formatDate, formatDateTime } from '@/lib/utils/dates';
import { formatNumber, truncate } from '@/lib/utils/formatting';
import { FINDING_SEVERITIES } from '@/lib/validations/audit-report.validation';

interface VersionRow extends Record<string, unknown> {
  id: number; version: number; change_summary: string | null; created_at: string;
  created_by_name: string | null; pdf_file_id: number | null; pdf_original_name: string | null;
}
interface CommentRow extends Record<string, unknown> {
  id: number; version: number | null; comment_type: string; comment: string;
  section_ref: string | null; field_ref: string | null; severity: string; is_resolved: number;
  resolved_at: string | null; parent_id: number | null; created_at: string;
  author_name: string | null; author_role: string | null; author_email: string | null;
}
interface VerificationRow extends Record<string, unknown> {
  id: number; verifier_id: number; status: string; assigned_at: string; due_date: string | null;
  completed_at: string | null; remarks: string | null; verifier_name: string | null;
  verifier_email: string | null; assigned_by_name: string | null;
}
interface DecisionRow extends Record<string, unknown> {
  id: number; action: string; comments: string; reason: string | null; created_at: string; verifier_name: string | null;
}
interface Finding {
  reference?: string | null; severity: string; clause?: string | null; description: string;
  evidence?: string | null; recommendation?: string | null; employer_response?: string | null;
  status?: string | null; due_date?: string | null;
}
interface ScoreRow { section: string; max_score: number; obtained_score: number; remarks?: string | null }

export interface ReportDetailProps {
  report: Record<string, unknown>;
  body: {
    executive_summary: string | null; methodology: string | null; findings: Finding[];
    scorecard: ScoreRow[]; observations: string[]; regulatory_references: string[]; recommendations: string[];
  };
  versions: VersionRow[];
  comments: CommentRow[];
  verification: VerificationRow[];
  decisions: DecisionRow[];
  commentCounts: { total: number; corrections: number; openCorrections: number };
  verifiers: { id: number; name: string; email: string; pending_reviews: number }[];
  permissions: { update: boolean; remove: boolean; approve: boolean; assign: boolean; download: boolean; submit: boolean };
}

/**
 * Report detail.
 *
 * Five tabs: the report itself (summary, scorecard, findings), the version
 * history with a revision diff, the auditor ↔ verifier conversation with
 * resolvable correction requests, the verification trail (who had it, when, what
 * they decided), and the record tab with the audit identity behind the report.
 *
 * Actions are status-aware: a draft can be submitted, a submitted report
 * reviewed, an approved report archived, and all of it exported as PDF.
 */
export function ReportDetail({
  report, body, versions, comments, verification, decisions, commentCounts, verifiers, permissions,
}: ReportDetailProps) {
  const router = useRouter();
  const { success, error: errorToast } = useToast();
  const [working, setWorking] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitForm, setSubmitForm] = useState({ verifier_id: '', change_summary: 'Initial submission' });
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignForm, setAssignForm] = useState({ verifier_id: '', due_date: '', remarks: '' });
  const [commentText, setCommentText] = useState('');
  const [commentType, setCommentType] = useState('comment');
  const [commentSeverity, setCommentSeverity] = useState('info');
  const [compareWith, setCompareWith] = useState('');
  const [diff, setDiff] = useState<{ field: string; from: unknown; to: unknown }[] | null>(null);

  const status = String(report.status);
  const score = report.score_percentage === null || report.score_percentage === undefined
    ? null
    : Number(report.score_percentage);
  const isOpen = !['Approved', 'Rejected', 'Archived'].includes(status);
  const canSubmit = permissions.submit && ['Draft', 'Changes Requested'].includes(status);
  const canReview = permissions.approve && ['Submitted', 'Under Review'].includes(status);

  async function submitReport() {
    setWorking(true);
    const result = await api.post<{ version: number; warnings: string[] }>(`/api/admin/audit-reports/${report.id}/submit`, {
      verifier_id: submitForm.verifier_id ? Number(submitForm.verifier_id) : null,
      send_to_verifier: true,
      change_summary: submitForm.change_summary,
    });
    setWorking(false);
    if (result.ok) {
      const raw = result.raw as { version: number; warnings: string[] };
      success('Report submitted', `Version ${raw.version} was filed with its PDF and sent to the verifier.`);
      for (const warning of raw.warnings ?? []) errorToast('Heads up', warning);
      setSubmitOpen(false);
      router.refresh();
    } else {
      errorToast('Could not submit report', result.message);
    }
  }

  async function archiveReport() {
    setWorking(true);
    const result = await api.post(`/api/admin/audit-reports/${report.id}/archive`, {});
    setWorking(false);
    if (result.ok) {
      success('Report archived', 'It stays in the register and can be reopened as a draft.');
      setArchiveOpen(false);
      router.refresh();
    } else {
      errorToast('Could not archive report', result.message);
    }
  }

  async function restoreReport() {
    setWorking(true);
    const result = await api.post(`/api/admin/audit-reports/${report.id}/restore`, {});
    setWorking(false);
    if (result.ok) {
      success('Report reopened', 'It is back to Draft and can be edited.');
      router.refresh();
    } else {
      errorToast('Could not reopen report', result.message);
    }
  }

  async function deleteReport() {
    setWorking(true);
    const result = await api.delete(`/api/admin/audit-reports/${report.id}`);
    setWorking(false);
    if (result.ok) {
      success('Report deleted', `${String(report.report_number)} was removed.`);
      router.push('/admin/audit-reports');
    } else {
      errorToast('Could not delete report', result.message);
      setDeleteOpen(false);
    }
  }

  async function assignVerifier() {
    setWorking(true);
    const result = await api.post(`/api/admin/audit-reports/${report.id}/verifier`, {
      verifier_id: Number(assignForm.verifier_id),
      due_date: assignForm.due_date || null,
      remarks: assignForm.remarks || null,
    });
    setWorking(false);
    if (result.ok) {
      success('Verifier assigned', 'They have been notified and the report is in their queue.');
      setAssignOpen(false);
      router.refresh();
    } else {
      errorToast('Could not assign verifier', result.message);
    }
  }

  async function addComment() {
    if (commentText.trim().length < 2) return;
    setWorking(true);
    const result = await api.post(`/api/admin/audit-reports/${report.id}/comments`, {
      comment: commentText,
      comment_type: commentType,
      severity: commentSeverity,
    });
    setWorking(false);
    if (result.ok) {
      success('Comment added', commentType === 'correction_request' ? 'The auditor sees it as a correction to clear.' : 'Everyone on the thread was notified.');
      setCommentText('');
      router.refresh();
    } else {
      errorToast('Could not add comment', result.message);
    }
  }

  async function toggleResolved(comment: CommentRow) {
    setWorking(true);
    const result = await api.put(`/api/admin/audit-reports/${report.id}/comments/${comment.id}`, {
      is_resolved: Number(comment.is_resolved) !== 1,
    });
    setWorking(false);
    if (result.ok) {
      success(Number(comment.is_resolved) === 1 ? 'Correction reopened' : 'Correction resolved', 'The thread was updated.');
      router.refresh();
    } else {
      errorToast('Could not update comment', result.message);
    }
  }

  async function loadDiff(otherVersion: number) {
    if (!otherVersion) {
      setDiff(null);
      return;
    }
    const latest = versions[0]?.version ?? 1;
    const result = await api.get<{ diff: { field: string; from: unknown; to: unknown }[] }>(
      `/api/admin/audit-reports/${report.id}/versions/compare?against=${otherVersion}&with=${latest}`
    );
    if (result.ok && Array.isArray(result.data)) {
      setDiff(result.data);
    } else {
      setDiff([]);
      errorToast('Could not compare versions', result.message);
    }
  }

  const versionColumns: Column<VersionRow>[] = [
    { key: 'version', header: 'Version', width: 90, render: (row) => <Badge tone={Number(row.version) === Number(report.current_version) ? 'brand' : 'slate'}>v{row.version}{Number(row.version) === Number(report.current_version) ? ' current' : ''}</Badge> },
    { key: 'change_summary', header: 'Change', render: (row) => <span className="text-ink-soft">{row.change_summary ?? '—'}</span> },
    { key: 'created_by_name', header: 'By', width: 160, hideOnMobile: true, render: (row) => <span className="text-xs text-ink-muted">{row.created_by_name ?? '—'}</span> },
    { key: 'created_at', header: 'When', width: 170, render: (row) => <span className="text-xs text-ink-muted">{formatDateTime(row.created_at)}</span> },
    {
      key: 'actions', header: '', width: 150, align: 'right',
      render: (row) => (
        <span className="flex items-center justify-end gap-2">
          <button type="button" className="text-xs text-brand-600 hover:underline"
            onClick={() => loadDiff(Number(row.version))}>
            Compare
          </button>
          {row.pdf_file_id && (
            <a className="text-xs text-brand-600 hover:underline" href={`/api/files/${row.pdf_file_id}/download`} target="_blank" rel="noreferrer">
              PDF
            </a>
          )}
        </span>
      ),
    },
  ];

  const decisionColumns: Column<DecisionRow>[] = [
    { key: 'created_at', header: 'When', width: 170, render: (row) => <span className="text-xs text-ink-muted">{formatDateTime(row.created_at)}</span> },
    { key: 'action', header: 'Action', width: 110, render: (row) => <Badge tone={row.action === 'approved' ? 'success' : row.action === 'rejected' ? 'danger' : 'warning'}>{row.action}</Badge> },
    { key: 'comments', header: 'Feedback', render: (row) => <span className="text-ink-soft">{truncate(row.comments, 120)}</span> },
    { key: 'verifier_name', header: 'By', width: 170, hideOnMobile: true, render: (row) => <span className="text-xs text-ink-muted">{row.verifier_name ?? '—'}</span> },
  ];

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <StatusBadge status={status} />
            <Badge tone="slate">{String(report.report_type)}</Badge>
            <Badge tone="brand">v{String(report.current_version)}</Badge>
            {score !== null && <Badge tone={score >= 90 ? 'success' : score >= 75 ? 'brand' : score >= 60 ? 'warning' : 'danger'}>{score.toFixed(2)}% compliance</Badge>}
            {Number(report.critical_findings) > 0 && <Badge tone="danger">{Number(report.critical_findings)} critical finding(s)</Badge>}
            {commentCounts.openCorrections > 0 && <Badge tone="warning">{commentCounts.openCorrections} open correction(s)</Badge>}
          </div>
          <h1 className="text-xl font-semibold text-ink">{String(report.audit_title)}</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {String(report.report_number)} · {String(report.employer_name ?? '')}
            {report.unit_name ? ` · ${String(report.unit_name)}` : ''}
            {report.assignment_number ? ` · ${String(report.assignment_number)}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {permissions.download && (
            <a className="btn btn-outline btn-sm" href={`/api/pdf/audit-report/${report.id}`} target="_blank" rel="noreferrer">
              Download PDF
            </a>
          )}
          {canSubmit && <Button size="sm" onClick={() => setSubmitOpen(true)}>Submit for Verification</Button>}
          {canReview && <LinkButton href={`/admin/audit-reports/${report.id}/review`} size="sm">Review & Decide</LinkButton>}
          {permissions.assign && isOpen && <Button variant="outline" size="sm" onClick={() => { setAssignOpen(true); setAssignForm({ verifier_id: '', due_date: '', remarks: '' }); }}>Assign Verifier</Button>}
          {permissions.update && isOpen && <LinkButton href={`/admin/audit-reports/${report.id}/edit`} variant="outline" size="sm">Edit</LinkButton>}
          {permissions.update && status === 'Approved' && <Button variant="outline" size="sm" onClick={() => setArchiveOpen(true)}>Archive</Button>}
          {permissions.update && status === 'Archived' && <Button variant="outline" size="sm" onClick={restoreReport} loading={working}>Reopen as Draft</Button>}
          {permissions.remove && status !== 'Approved' && <Button variant="danger" size="sm" onClick={() => setDeleteOpen(true)}>Delete</Button>}
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Compliance Score</p>
          <p className="mt-1 text-lg font-semibold text-ink">{score === null ? 'Not scored' : `${score.toFixed(2)}%`}</p>
          {score !== null && <div className="mt-2"><ProgressBar value={score} height={6} /></div>}
          <p className="mt-1 text-xs text-ink-muted">
            {report.score_obtained === null ? 'No points recorded' : `${Number(report.score_obtained).toFixed(2)} of ${Number(report.score_max ?? 0).toFixed(2)} points`}
          </p>
        </Card>
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Findings</p>
          <p className="mt-1 text-lg font-semibold text-ink">{findingsTotal(body.findings)}</p>
          <p className="mt-1 text-xs text-ink-muted">
            {Number(report.critical_findings)} critical · {Number(report.major_findings)} major · {Number(report.minor_findings)} minor
          </p>
        </Card>
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Audit Period</p>
          <p className="mt-1 text-sm font-semibold text-ink">
            {formatDate(report.audit_period_from as string)} → {formatDate(report.audit_period_to as string)}
          </p>
          <p className="mt-1 text-xs text-ink-muted">Audit date {formatDate(report.audit_date as string)}</p>
        </Card>
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Verification</p>
          <p className="mt-1 text-sm font-semibold text-ink">{String(report.verifier_name ?? 'Not assigned')}</p>
          <p className="mt-1 text-xs text-ink-muted">
            {report.submitted_at ? `Submitted ${formatDate(report.submitted_at as string)}` : 'Not submitted yet'}
            {report.approved_at ? ` · approved ${formatDate(report.approved_at as string)}` : ''}
          </p>
        </Card>
      </div>

      <Card padded={false}>
        <Tabs
          defaultTab="report"
          items={[
            { key: 'report', label: 'Report', content: <ReportTab body={body} report={report} /> },
            {
              key: 'versions',
              label: `Versions (${versions.length})`,
              content: (
                <CardBody className="space-y-4">
                  <div className="flex flex-wrap items-end gap-3">
                    <Select label="Compare an older version against the current one" size="sm" clearable
                      value={compareWith} onChange={(value) => { setCompareWith(value); loadDiff(Number(value || 0)); }}
                      options={versions.slice(1).map((version) => ({
                        value: String(version.version),
                        label: `v${version.version} — ${version.change_summary ?? 'no summary'}`,
                      }))} />
                    {diff && <Badge tone="brand">{diff.length} field(s) changed</Badge>}
                  </div>

                  {diff && (
                    <div className="rounded-lg border border-line">
                      {diff.length === 0 ? (
                        <p className="px-4 py-3 text-sm text-ink-muted">The two revisions hold identical content.</p>
                      ) : (
                        <table className="w-full text-sm">
                          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-ink-muted">
                            <tr><th className="px-4 py-2">Field</th><th className="px-4 py-2">Before</th><th className="px-4 py-2">After</th></tr>
                          </thead>
                          <tbody className="divide-y divide-line">
                            {diff.map((row) => (
                              <tr key={row.field}>
                                <td className="px-4 py-2 font-medium text-ink">{row.field.replace(/_/g, ' ')}</td>
                                <td className="px-4 py-2 text-ink-muted">{summary(row.from)}</td>
                                <td className="px-4 py-2 text-ink-soft">{summary(row.to)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}

                  <DataTable<VersionRow>
                    columns={versionColumns}
                    data={versions.map((version) => ({ ...version, id: Number(version.id) }))}
                    rowKey={(row) => row.id}
                    emptyTitle="No versions yet"
                    emptySubtitle="Every submission, correction and approval is preserved here."
                  />
                </CardBody>
              ),
            },
            {
              key: 'comments',
              label: `Comments (${commentCounts.total})`,
              content: (
                <CardBody className="space-y-5">
                  {comments.length === 0 ? (
                    <EmptyState
                      title="No comments yet"
                      subtitle="Correction requests raised here become a checklist the auditor must clear before resubmitting."
                    />
                  ) : (
                    <ul className="space-y-3">
                      {comments.map((comment) => (
                        <li key={comment.id} className={`rounded-lg border p-4 ${Number(comment.is_resolved) === 1 ? 'border-line bg-slate-50' : 'border-line'}`}>
                          <div className="mb-1 flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium text-ink">{comment.author_name ?? 'Unknown'}</span>
                            <Badge tone="slate">{(comment.author_role ?? '').split(',')[0] || 'user'}</Badge>
                            <Badge tone={commentTypeTone(comment.comment_type)}>{comment.comment_type.replace(/_/g, ' ')}</Badge>
                            {comment.severity !== 'info' && <Badge tone={comment.severity === 'critical' ? 'danger' : 'warning'}>{comment.severity}</Badge>}
                            {Number(comment.is_resolved) === 1 && <Badge tone="success">resolved</Badge>}
                            <span className="ml-auto text-xs text-ink-muted">{formatDateTime(comment.created_at)}</span>
                          </div>
                          <p className="whitespace-pre-line text-sm text-ink-soft">{comment.comment}</p>
                          {(comment.section_ref || comment.field_ref) && (
                            <p className="mt-1 text-xs text-ink-muted">
                              {comment.section_ref ? `Section: ${comment.section_ref}` : ''}
                              {comment.field_ref ? ` · Field: ${comment.field_ref}` : ''}
                            </p>
                          )}
                          {permissions.update && comment.comment_type === 'correction_request' && (
                            <div className="mt-2">
                              <button type="button" className="text-xs text-brand-600 hover:underline" disabled={working}
                                onClick={() => toggleResolved(comment)}>
                                {Number(comment.is_resolved) === 1 ? 'Reopen this correction' : 'Mark as resolved'}
                              </button>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}

                  {permissions.update && (
                    <div className="rounded-lg border border-line p-4">
                      <h3 className="mb-3 text-sm font-semibold text-ink">Add to the conversation</h3>
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                        <Select label="Type" value={commentType} onChange={setCommentType}
                          options={[
                            { value: 'comment', label: 'Comment' },
                            { value: 'correction_request', label: 'Correction request' },
                            { value: 'auditor_reply', label: 'Auditor reply' },
                            { value: 'approval_note', label: 'Approval note' },
                            { value: 'rejection_note', label: 'Rejection note' },
                          ]} />
                        <Select label="Severity" value={commentSeverity} onChange={setCommentSeverity}
                          options={JSON_SEVERITIES().map((severity) => ({ value: severity, label: severity }))} />
                        <div className="flex items-end">
                          <p className="text-xs text-ink-muted">
                            Correction requests stay open until someone resolves them, and are listed in the return email.
                          </p>
                        </div>
                      </div>
                      <div className="mt-3">
                        <Textarea label="Comment" rows={3} value={commentText} onChange={(event) => setCommentText(event.target.value)}
                          placeholder="What needs attention, and where in the report." />
                      </div>
                      <div className="mt-3 flex justify-end">
                        <Button size="sm" onClick={addComment} loading={working} disabled={commentText.trim().length < 2}>
                          Post Comment
                        </Button>
                      </div>
                    </div>
                  )}
                </CardBody>
              ),
            },
            {
              key: 'verification',
              label: `Verification (${verification.length})`,
              content: (
                <CardBody className="space-y-5">
                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-ink">Assignment history</h3>
                    {verification.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-line bg-slate-50 px-4 py-4 text-sm text-ink-muted">
                        No verifier has been assigned yet.
                      </p>
                    ) : (
                      <ul className="divide-y divide-line rounded-lg border border-line">
                        {verification.map((row) => (
                          <li key={row.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-ink">{row.verifier_name}</p>
                              <p className="text-xs text-ink-muted">
                                {row.verifier_email} · assigned {formatDateTime(row.assigned_at)}
                                {row.assigned_by_name ? ` by ${row.assigned_by_name}` : ''}
                                {row.due_date ? ` · due ${formatDate(row.due_date)}` : ''}
                              </p>
                              {row.remarks && <p className="mt-1 text-xs text-ink-soft">{truncate(row.remarks, 160)}</p>}
                            </div>
                            <Badge tone={row.status === 'completed' ? 'success' : row.status === 'in_review' ? 'brand' : row.status === 'reassigned' ? 'slate' : 'warning'}>
                              {String(row.status).replace('_', ' ')}
                            </Badge>
                            {row.completed_at && <span className="text-xs text-ink-muted">closed {formatDate(row.completed_at)}</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-ink">Decisions</h3>
                    {decisions.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-line bg-slate-50 px-4 py-4 text-sm text-ink-muted">
                        No decision has been recorded yet.
                      </p>
                    ) : (
                      <DataTable<DecisionRow>
                        columns={decisionColumns}
                        data={decisions.map((row) => ({ ...row, id: Number(row.id) }))}
                        rowKey={(row) => row.id}
                      />
                    )}
                  </div>

                  {Boolean(report.rejection_reason) && (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                      <h3 className="text-sm font-semibold text-red-700">Rejection reason</h3>
                      <p className="mt-1 text-sm text-red-700">{String(report.rejection_reason ?? '')}</p>
                    </div>
                  )}
                </CardBody>
              ),
            },
            {
              key: 'record',
              label: 'Record',
              content: (
                <CardBody>
                  <DescriptionGrid columns={3}>
                    <DetailRow label="Report No." value={<span className="font-mono text-xs">{String(report.report_number)}</span>} />
                    <DetailRow label="Report Type" value={String(report.report_type)} />
                    <DetailRow label="Current Version" value={`v${String(report.current_version)}`} />
                    <DetailRow label="Employer" value={
                      <Link className="text-brand-600 hover:underline" href={`/admin/employers/${String(report.employer_id)}`}>
                        {String(report.employer_name ?? '')}
                      </Link>
                    } />
                    <DetailRow label="Unit" value={String(report.unit_name ?? 'All units')} />
                    <DetailRow label="Department" value={String(report.department_name ?? 'All departments')} />
                    <DetailRow label="Auditor" value={
                      report.auditor_id ? (
                        <Link className="text-brand-600 hover:underline" href={`/admin/auditors/${String(report.auditor_id)}`}>
                          {String(report.auditor_name ?? '')}
                        </Link>
                      ) : '—'
                    } />
                    <DetailRow label="Assignment" value={
                      report.assignment_id ? (
                        <Link className="text-brand-600 hover:underline" href={`/admin/audit-assignments/${String(report.assignment_id)}`}>
                          {String(report.assignment_number ?? `#${report.assignment_id}`)}
                        </Link>
                      ) : 'Not linked to an assignment'
                    } />
                    <DetailRow label="Module" value={String(report.module_name ?? 'Standard audit')} />
                    <DetailRow label="Submitted" value={report.submitted_at ? formatDateTime(report.submitted_at as string) : 'Not submitted'} />
                    <DetailRow label="Approved" value={report.approved_at ? `${formatDateTime(report.approved_at as string)}${report.approved_by_name ? ` · ${String(report.approved_by_name)}` : ''}` : 'Pending'} />
                    <DetailRow label="Next Audit Due" value={report.next_audit_due ? formatDate(report.next_audit_due as string) : 'Not scheduled'} />
                    <DetailRow label="PDF" value={report.pdf_file_id ? (
                      <a className="text-brand-600 hover:underline" href={`/api/files/${String(report.pdf_file_id)}/download`} target="_blank" rel="noreferrer">
                        Stored {report.pdf_generated_at ? `· ${formatDate(report.pdf_generated_at as string)}` : ''}
                      </a>
                    ) : 'Not generated yet'} />
                    <DetailRow label="Comments" value={`${commentCounts.total} (${commentCounts.corrections} correction(s))`} />
                    <DetailRow label="Versions" value={formatNumber(versions.length)} />
                  </DescriptionGrid>
                </CardBody>
              ),
            },
          ]}
        />
      </Card>

      {/* ------------------------------------------------------------- modals */}
      <Modal
        open={submitOpen}
        onClose={() => setSubmitOpen(false)}
        title="Submit this report for verification"
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setSubmitOpen(false)}>Cancel</Button>
            <Button onClick={submitReport} loading={working}>Submit & Notify</Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-ink-soft">
            The current body is frozen as a new version, the report PDF is generated and attached, the audit assignment moves to
            Submitted and the verifier is emailed, texted and notified in-app.
          </p>
          <Select label="Send to verifier" searchable clearable value={submitForm.verifier_id}
            placeholder="Use the assignment's verifier"
            onChange={(value) => setSubmitForm((current) => ({ ...current, verifier_id: value }))}
            options={verifiers.map((verifier) => ({
              value: String(verifier.id), label: verifier.name,
              hint: `${verifier.pending_reviews} pending · ${verifier.email}`,
            }))} />
          <Input label="Change summary" value={submitForm.change_summary}
            onChange={(event) => setSubmitForm((current) => ({ ...current, change_summary: event.target.value }))}
            helper="Shown in the version history." />
          {commentCounts.openCorrections > 0 && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              {commentCounts.openCorrections} correction request(s) are still marked open. Resolve them first so the verifier can see
              each one was addressed.
            </p>
          )}
        </div>
      </Modal>

      <Modal
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        title="Assign a verifier"
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setAssignOpen(false)}>Cancel</Button>
            <Button onClick={assignVerifier} loading={working} disabled={!assignForm.verifier_id}>Assign & Notify</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Select label="Verifier" required searchable value={assignForm.verifier_id}
            onChange={(value) => setAssignForm((current) => ({ ...current, verifier_id: value }))}
            options={verifiers.map((verifier) => ({
              value: String(verifier.id), label: verifier.name,
              hint: `${verifier.pending_reviews} pending · ${verifier.email}`,
            }))} />
          <Input label="Review due date" type="date" value={assignForm.due_date}
            onChange={(event) => setAssignForm((current) => ({ ...current, due_date: event.target.value }))} />
          <Textarea label="Note for the verifier" rows={2} value={assignForm.remarks}
            onChange={(event) => setAssignForm((current) => ({ ...current, remarks: event.target.value }))} />
        </div>
      </Modal>

      <ConfirmDialog
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        onConfirm={archiveReport}
        loading={working}
        title="Archive this report?"
        message={`${String(report.report_number)} drops out of the active pipeline but stays in the register and can be reopened as a draft.`}
        confirmLabel="Archive Report"
      />

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={deleteReport}
        loading={working}
        title="Delete this report?"
        message={`${String(report.report_number)} and its ${versions.length} version(s) will be removed. Approved reports can only be archived.`}
        confirmLabel="Delete Report"
        variant="danger"
      />
    </>
  );
}

function ReportTab({ body, report }: { body: ReportDetailProps['body']; report: Record<string, unknown> }) {
  const findings = body.findings ?? [];
  const scorecard = body.scorecard ?? [];

  return (
    <CardBody className="space-y-6">
      {body.executive_summary && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-ink">Executive summary</h3>
          <p className="whitespace-pre-line rounded-lg border border-line bg-slate-50 p-4 text-sm text-ink-soft">{body.executive_summary}</p>
        </div>
      )}
      {body.methodology && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-ink">Scope &amp; methodology</h3>
          <p className="whitespace-pre-line rounded-lg border border-line bg-slate-50 p-4 text-sm text-ink-soft">{body.methodology}</p>
        </div>
      )}

      {scorecard.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-ink">Section-wise scorecard</h3>
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-[13px] font-semibold text-ink-soft">
                <tr>
                  <th className="px-4 py-2">Section</th>
                  <th className="px-4 py-2 text-right">Max</th>
                  <th className="px-4 py-2 text-right">Obtained</th>
                  <th className="px-4 py-2 text-right">%</th>
                  <th className="px-4 py-2">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {scorecard.map((row, index) => {
                  const percentage = Number(row.max_score) > 0 ? (Number(row.obtained_score) / Number(row.max_score)) * 100 : 0;
                  return (
                    <tr key={index} className="hover:bg-slate-50">
                      <td className="px-4 py-2 text-ink-soft">{row.section}</td>
                      <td className="px-4 py-2 text-right text-ink-muted">{Number(row.max_score).toFixed(2)}</td>
                      <td className="px-4 py-2 text-right text-ink-soft">{Number(row.obtained_score).toFixed(2)}</td>
                      <td className="px-4 py-2 text-right font-medium text-ink">{percentage.toFixed(1)}%</td>
                      <td className="px-4 py-2 text-xs text-ink-muted">{row.remarks ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-slate-50 text-sm font-semibold text-ink">
                <tr>
                  <td className="px-4 py-2">Total</td>
                  <td className="px-4 py-2 text-right">{scorecard.reduce((sum, row) => sum + Number(row.max_score), 0).toFixed(2)}</td>
                  <td className="px-4 py-2 text-right">{scorecard.reduce((sum, row) => sum + Number(row.obtained_score), 0).toFixed(2)}</td>
                  <td className="px-4 py-2 text-right">
                    {Number(report.score_percentage ?? 0).toFixed(2)}%
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      <div>
        <h3 className="mb-2 text-sm font-semibold text-ink">Findings ({findings.length})</h3>
        {findings.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line bg-slate-50 px-4 py-4 text-sm text-ink-muted">
            No findings were recorded against this report.
          </p>
        ) : (
          <ul className="space-y-3">
            {findings.map((finding, index) => (
              <li key={index} className="rounded-lg border border-line p-4">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <Badge tone={severityTone(finding.severity)}>{finding.severity}</Badge>
                  {finding.reference && <Badge tone="slate">{finding.reference}</Badge>}
                  {finding.status && <Badge tone={finding.status === 'Closed' ? 'success' : finding.status === 'In Progress' ? 'brand' : 'warning'}>{finding.status}</Badge>}
                  {finding.due_date && <span className="text-xs text-ink-muted">due {formatDate(finding.due_date)}</span>}
                  <span className="ml-auto text-xs text-ink-muted">F-{String(index + 1).padStart(2, '0')}</span>
                </div>
                {finding.clause && <p className="text-xs text-ink-muted">Reference: {finding.clause}</p>}
                <p className="mt-1 whitespace-pre-line text-sm text-ink-soft">{finding.description}</p>
                {finding.evidence && <p className="mt-2 text-xs text-ink-muted"><strong>Evidence:</strong> {finding.evidence}</p>}
                {finding.recommendation && <p className="mt-1 text-xs text-emerald-700"><strong>Action required:</strong> {finding.recommendation}</p>}
                {finding.employer_response && <p className="mt-1 text-xs text-ink-soft"><strong>Employer reply:</strong> {finding.employer_response}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {(body.observations.length > 0 || body.recommendations.length > 0 || body.regulatory_references.length > 0) && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <ListBlock title="Observations" items={body.observations} />
          <ListBlock title="Recommendations" items={body.recommendations} />
          <ListBlock title="Regulatory references" items={body.regulatory_references} />
        </div>
      )}
    </CardBody>
  );
}

function ListBlock({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-ink">{title}</h3>
      <ul className="list-disc space-y-1 rounded-lg border border-line bg-slate-50 p-4 pl-8 text-sm text-ink-soft">
        {items.map((item, index) => <li key={index}>{item}</li>)}
      </ul>
    </div>
  );
}

/** Renders a diff value compactly: strings as-is, everything else as JSON. */
function summary(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return truncate(value, 90);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return truncate(JSON.stringify(value), 90);
}

function findingsTotal(findings: Finding[]): string {
  return formatNumber(findings.length);
}

function severityTone(severity: string): 'slate' | 'brand' | 'warning' | 'danger' | 'success' {
  switch (severity) {
    case 'Critical': return 'danger';
    case 'Major': return 'warning';
    case 'Minor': return 'brand';
    default: return 'slate';
  }
}

function commentTypeTone(type: string): 'slate' | 'brand' | 'warning' | 'danger' | 'success' {
  switch (type) {
    case 'correction_request': return 'warning';
    case 'approval_note': return 'success';
    case 'rejection_note': return 'danger';
    case 'auditor_reply': return 'brand';
    default: return 'slate';
  }
}

/** Severity options reused by the conversation composer. */
function JSON_SEVERITIES(): string[] {
  return ['info', 'minor', 'major', 'critical'];
}
