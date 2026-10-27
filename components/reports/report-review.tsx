'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { Button, LinkButton } from '@/components/ui/button';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Input, Textarea, Checkbox } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { ProgressBar } from '@/components/ui/progress-bar';
import { useToast } from '@/components/ui/toast';
import { api, fieldErrors } from '@/lib/utils/api-client';
import { formatDate, formatDateTime } from '@/lib/utils/dates';
import { FINDING_SEVERITIES } from '@/lib/validations/audit-report.validation';

interface Finding {
  reference?: string | null; severity: string; clause?: string | null; description: string;
  evidence?: string | null; recommendation?: string | null; status?: string | null; due_date?: string | null;
}
interface Correction { section_ref: string; field_ref: string; severity: string; note: string }

export interface ReportReviewProps {
  report: Record<string, unknown>;
  body: {
    executive_summary: string | null; methodology: string | null; findings: Finding[];
    scorecard: { section: string; max_score: number; obtained_score: number; remarks?: string | null }[];
    observations: string[]; regulatory_recommendation?: unknown; regulatory_references: string[]; recommendations: string[];
  };
  comments: { id: number; comment_type: string; comment: string; author_name: string | null; created_at: string; is_resolved: number; severity: string }[];
  versions: { version: number; change_summary: string | null; created_at: string; created_by_name: string | null; pdf_file_id: number | null }[];
  canApprove: boolean;
  canReject: boolean;
  nextAuditSuggestion: string | null;
  endpoint?: string;
}

/**
 * The verifier's decision screen.
 *
 * Left: the whole report — summary, scorecard with per-section bars, every
 * finding with its clause and evidence, observations and recommendations.
 * Right: the decision panel — approve, reject or return, with structured
 * correction requests (section, field, severity, note) that become the
 * auditor's checklist, plus the notification switches and the suggested next
 * audit date derived from the audit frequency.
 */
export function ReportReview({
  report, body, comments, versions, canApprove, canReject, nextAuditSuggestion, endpoint,
}: ReportReviewProps) {
  const router = useRouter();
  const { success, error: errorToast } = useToast();
  const base = endpoint ?? `/api/admin/audit-reports/${report.id}`;

  const [action, setAction] = useState<'approve' | 'reject' | 'return'>('approve');
  const [commentsText, setCommentsText] = useState('');
  const [reason, setReason] = useState('');
  const [nextAuditDue, setNextAuditDue] = useState(nextAuditSuggestion ?? '');
  const [notifyAuditor, setNotifyAuditor] = useState(true);
  const [notifyEmployer, setNotifyEmployer] = useState(false);
  const [corrections, setCorrections] = useState<Correction[]>([{ section_ref: '', field_ref: '', severity: 'major', note: '' }]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const score = report.score_percentage === null || report.score_percentage === undefined
    ? null : Number(report.score_percentage);

  async function submit() {
    setSaving(true);
    setErrors({});

    const payload = {
      action,
      comments: commentsText,
      reason: action === 'reject' ? reason : null,
      corrections: action === 'return'
        ? corrections
            .filter((correction) => correction.note.trim().length >= 4)
            .map((correction) => ({
              section_ref: correction.section_ref || null,
              field_ref: correction.field_ref || null,
              severity: correction.severity,
              note: correction.note,
            }))
        : [],
      notify_auditor: notifyAuditor,
      notify_employer: notifyEmployer && action === 'approve',
      next_audit_due: action === 'approve' ? nextAuditDue || null : null,
    };

    const result = await api.post<{ status: string; corrections: number; warnings: string[] }>(`${base}/review`, payload);
    setSaving(false);

    if (!result.ok) {
      setErrors(fieldErrors(result));
      errorToast('Decision could not be recorded', result.message);
      return;
    }

    const raw = result.raw as { status: string; corrections: number; warnings: string[] };
    success(
      action === 'approve' ? 'Report approved' : action === 'reject' ? 'Report rejected' : 'Report returned for correction',
      action === 'approve'
        ? `The audit is closed${nextAuditDue ? ` and the next audit is pencilled in for ${formatDate(nextAuditDue)}` : ''}.`
        : action === 'reject'
          ? 'The auditor has been told why it was rejected.'
          : `${raw.corrections} correction request(s) were sent to the auditor.`
    );
    for (const warning of raw.warnings ?? []) errorToast('Heads up', warning);
    router.push('/admin/audit-reports');
    router.refresh();
  }

  const blocking = action === 'reject' ? reason.trim().length < 4 : commentsText.trim().length < 10;

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      <div className="space-y-6 xl:col-span-2">
        <Card padded={false}>
          <CardHeader
            title="Report under review"
            description={`${String(report.report_number)} · version ${String(report.current_version)} · submitted ${report.submitted_at ? formatDateTime(report.submitted_at as string) : '—'}`}
            action={<StatusBadge status={String(report.status)} />}
          />
          <CardBody className="space-y-5">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Metric label="Score" value={score === null ? 'Not scored' : `${score.toFixed(2)}%`} />
              <Metric label="Critical" value={String(Number(report.critical_findings ?? 0))} danger={Number(report.critical_findings ?? 0) > 0} />
              <Metric label="Major" value={String(Number(report.major_findings ?? 0))} />
              <Metric label="Minor" value={String(Number(report.minor_findings ?? 0))} />
            </div>
            {score !== null && <ProgressBar value={score} height={8} />}

            {body.executive_summary && (
              <div>
                <h3 className="mb-1 text-sm font-semibold text-ink">Executive summary</h3>
                <p className="whitespace-pre-line rounded-lg border border-line bg-slate-50 p-3 text-sm text-ink-soft">
                  {body.executive_summary}
                </p>
              </div>
            )}
            {body.methodology && (
              <div>
                <h3 className="mb-1 text-sm font-semibold text-ink">Scope &amp; methodology</h3>
                <p className="whitespace-pre-line rounded-lg border border-line bg-slate-50 p-3 text-sm text-ink-soft">
                  {body.methodology}
                </p>
              </div>
            )}
          </CardBody>
        </Card>

        {(body.scorecard ?? []).length > 0 && (
          <Card padded={false}>
            <CardHeader title="Scorecard" description="Per-section performance — spot the section that dragged the score down" />
            <CardBody className="space-y-3">
              {body.scorecard.map((row, index) => {
                const percentage = Number(row.max_score) > 0 ? (Number(row.obtained_score) / Number(row.max_score)) * 100 : 0;
                return (
                  <div key={index}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="text-ink-soft">{row.section}</span>
                      <span className="text-ink-muted">
                        {Number(row.obtained_score).toFixed(2)} / {Number(row.max_score).toFixed(2)} · {percentage.toFixed(1)}%
                      </span>
                    </div>
                    <ProgressBar value={percentage} height={6}
                      tone={percentage >= 90 ? 'emerald' : percentage >= 75 ? 'brand' : percentage >= 60 ? 'amber' : 'red'} />
                    {row.remarks && <p className="mt-1 text-xs text-ink-muted">{row.remarks}</p>}
                  </div>
                );
              })}
            </CardBody>
          </Card>
        )}

        <Card padded={false}>
          <CardHeader title={`Findings (${(body.findings ?? []).length})`} description="Each finding with the clause it breaches and the action the employer must take" />
          <CardBody>
            {(body.findings ?? []).length === 0 ? (
              <p className="rounded-lg border border-dashed border-line bg-slate-50 px-4 py-4 text-sm text-ink-muted">
                The auditor recorded no findings against this audit.
              </p>
            ) : (
              <ul className="space-y-3">
                {body.findings.map((finding, index) => (
                  <li key={index} className="rounded-lg border border-line p-4">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <Badge tone={finding.severity === 'Critical' ? 'danger' : finding.severity === 'Major' ? 'warning' : finding.severity === 'Minor' ? 'brand' : 'slate'}>
                        {finding.severity}
                      </Badge>
                      {finding.reference && <Badge tone="slate">{finding.reference}</Badge>}
                      {finding.status && <Badge tone={finding.status === 'Closed' ? 'success' : 'warning'}>{finding.status}</Badge>}
                      <span className="ml-auto text-xs text-ink-muted">
                        F-{String(index + 1).padStart(2, '0')}{finding.due_date ? ` · due ${formatDate(finding.due_date)}` : ''}
                      </span>
                    </div>
                    {finding.clause && <p className="text-xs text-ink-muted">{finding.clause}</p>}
                    <p className="mt-1 whitespace-pre-line text-sm text-ink-soft">{finding.description}</p>
                    {finding.evidence && <p className="mt-1 text-xs text-ink-muted"><strong>Evidence:</strong> {finding.evidence}</p>}
                    {finding.recommendation && <p className="mt-1 text-xs text-emerald-700"><strong>Action:</strong> {finding.recommendation}</p>}
                    <div className="mt-2 flex gap-2">
                      <button type="button" className="text-xs text-brand-600 hover:underline"
                        onClick={() => {
                          setAction('return');
                          setCorrections((rows) => [...rows, {
                            section_ref: finding.reference ?? `Finding ${index + 1}`,
                            field_ref: 'description',
                            severity: finding.severity === 'Observation' ? 'minor' : finding.severity.toLowerCase(),
                            note: '',
                          }]);
                        }}>
                        Ask for a correction here
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        {((body.observations ?? []).length > 0 || (body.recommendations ?? []).length > 0) && (
          <Card padded={false}>
            <CardHeader title="Observations & recommendations" />
            <CardBody className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <ListBlock title="Observations" items={body.observations ?? []} />
              <ListBlock title="Recommendations" items={body.recommendations ?? []} />
            </CardBody>
          </Card>
        )}

        <Card padded={false}>
          <CardHeader title="Version history" description="What each revision changed, and the PDF filed with it" />
          <CardBody>
            <ul className="divide-y divide-line rounded-lg border border-line">
              {versions.map((version) => (
                <li key={version.version} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <Badge tone={version.version === Number(report.current_version) ? 'brand' : 'slate'}>v{version.version}</Badge>
                  <span className="min-w-0 flex-1 text-sm text-ink-soft">{version.change_summary ?? '—'}</span>
                  <span className="text-xs text-ink-muted">{version.created_by_name ?? '—'} · {formatDateTime(version.created_at)}</span>
                  {version.pdf_file_id && (
                    <a className="text-xs text-brand-600 hover:underline" href={`/api/files/${version.pdf_file_id}/download`} target="_blank" rel="noreferrer">
                      PDF
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        {comments.length > 0 && (
          <Card padded={false}>
            <CardHeader title="Conversation so far" description="Open corrections are listed for you before you decide" />
            <CardBody>
              <ul className="space-y-3">
                {comments.map((comment) => (
                  <li key={comment.id} className="rounded-lg border border-line p-3">
                    <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-medium text-ink">{comment.author_name ?? 'Unknown'}</span>
                      <Badge tone={comment.comment_type === 'correction_request' ? 'warning' : 'slate'}>
                        {comment.comment_type.replace(/_/g, ' ')}
                      </Badge>
                      {Number(comment.is_resolved) === 1 ? <Badge tone="success">resolved</Badge> : null}
                      <span className="ml-auto text-ink-muted">{formatDateTime(comment.created_at)}</span>
                    </div>
                    <p className="whitespace-pre-line text-sm text-ink-soft">{comment.comment}</p>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        )}
      </div>

      {/* ------------------------------------------------------- decision panel */}
      <div className="space-y-6">
        <Card padded={false}>
          <CardHeader title="Your decision" description="Approve, reject, or send it back with corrections" />
          <CardBody className="space-y-5">
            <div className="space-y-2" role="radiogroup" aria-label="Verification decision">
              {[
                { value: 'approve' as const, label: 'Approve — closes the audit and notifies everyone', disabled: !canApprove },
                { value: 'return' as const, label: 'Return for correction — the auditor fixes and resubmits', disabled: false },
                { value: 'reject' as const, label: 'Reject — terminal, requires a reason', disabled: !canReject },
              ].map((option) => (
                <label key={option.value}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition-colors ${
                    action === option.value ? 'border-brand-400 bg-brand-50' : 'border-line hover:bg-surface-muted'
                  } ${option.disabled ? 'cursor-not-allowed opacity-50' : ''}`}>
                  <input
                    type="radio"
                    name="review-action"
                    className="mt-0.5 h-4 w-4 accent-brand-500"
                    checked={action === option.value}
                    disabled={option.disabled}
                    onChange={() => setAction(option.value)}
                  />
                  <span className="text-ink-soft">{option.label}</span>
                </label>
              ))}
            </div>

            <Textarea
              label="Verifier comments"
              required
              rows={5}
              value={commentsText}
              onChange={(event) => setCommentsText(event.target.value)}
              error={errors.comments}
              helper="At least a sentence. Shared with the auditor, administrators and stored on the report."
            />

            {action === 'reject' && (
              <Textarea label="Reason for rejection" required rows={3} value={reason}
                onChange={(event) => setReason(event.target.value)} error={errors.reason}
                helper="Printed in the PDF and emailed to the auditor." />
            )}

            {action === 'approve' && (
              <>
                <Input label="Next audit due" type="date" value={nextAuditDue}
                  onChange={(event) => setNextAuditDue(event.target.value)} error={errors.next_audit_due}
                  helper={nextAuditSuggestion ? `Suggested from the audit frequency: ${formatDate(nextAuditSuggestion)}` : 'Drives the re-audit reminder ladder.'} />
                <Checkbox label="Tell the employer's portal users the report is released" checked={notifyEmployer}
                  onChange={(event) => setNotifyEmployer((event.target as HTMLInputElement).checked)} />
              </>
            )}

            <Checkbox label="Notify the auditor (in-app + email + SMS + WhatsApp)" checked={notifyAuditor}
              onChange={(event) => setNotifyAuditor((event.target as HTMLInputElement).checked)} />
          </CardBody>
        </Card>

        {action === 'return' && (
          <Card padded={false}>
            <CardHeader
              title="Correction requests"
              description="Each line becomes a tick-box item the auditor must clear"
              action={<Button type="button" variant="outline" size="sm" onClick={() => setCorrections((rows) => [...rows, { section_ref: '', field_ref: '', severity: 'major', note: '' }])}>Add</Button>}
            />
            <CardBody className="space-y-3">
              {corrections.map((correction, index) => (
                <div key={index} className="rounded-lg border border-line p-3">
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                    <Input label="Section" value={correction.section_ref} placeholder="e.g. Finding F-02"
                      onChange={(event) => setCorrections((rows) => rows.map((item, i) => i === index ? { ...item, section_ref: event.target.value } : item))} />
                    <Input label="Field" value={correction.field_ref} placeholder="e.g. description, scorecard"
                      onChange={(event) => setCorrections((rows) => rows.map((item, i) => i === index ? { ...item, field_ref: event.target.value } : item))} />
                    <Select label="Severity" value={correction.severity}
                      onChange={(value) => setCorrections((rows) => rows.map((item, i) => i === index ? { ...item, severity: value } : item))}
                      options={[
                        { value: 'critical', label: 'Critical' },
                        { value: 'major', label: 'Major' },
                        { value: 'minor', label: 'Minor' },
                        { value: 'info', label: 'Info' },
                      ]} />
                  </div>
                  <div className="mt-2">
                    <Textarea label="What must change" rows={2} value={correction.note}
                      placeholder="Be specific — the auditor has to clear this before resubmitting."
                      onChange={(event) => setCorrections((rows) => rows.map((item, i) => i === index ? { ...item, note: event.target.value } : item))} />
                  </div>
                  {corrections.length > 1 && (
                    <div className="mt-2 text-right">
                      <button type="button" className="text-xs text-red-600 hover:underline"
                        onClick={() => setCorrections((rows) => rows.filter((_, i) => i !== index))}>
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </CardBody>
          </Card>
        )}

        <Card padded={false}>
          <CardHeader title="Summary of what happens" />
          <CardBody className="space-y-2 text-sm text-ink-soft">
            {action === 'approve' && (
              <p>
                The report becomes <strong>Approved</strong>, the audit assignment closes at 100% with a completion timestamp,
                the employer sees the score of <strong>{score === null ? '—' : `${score.toFixed(2)}%`}</strong> and the next audit
                date is set for <strong>{nextAuditDue ? formatDate(nextAuditDue) : 'not scheduled'}</strong>.
              </p>
            )}
            {action === 'return' && (
              <p>
                The report becomes <strong>Changes Requested</strong>, the assignment drops to 75%, and{' '}
                <strong>{corrections.filter((correction) => correction.note.trim()).length}</strong> correction request(s) land in the
                auditor&apos;s queue. They can resubmit, which files a new version alongside this one.
              </p>
            )}
            {action === 'reject' && (
              <p>
                The report becomes <strong>Rejected</strong> and the assignment is marked rejected. The reason is printed in the PDF
                and emailed to the auditor.
              </p>
            )}
            <p className="text-xs text-ink-muted">
              Filing a decision writes to the audit trail, the activity log, the verifier history and a new report revision, so the
              approved copy can always be reproduced.
            </p>
          </CardBody>
        </Card>

        <div className="flex items-center justify-between gap-3">
          <LinkButton href={String(report.assignment_id) ? `/admin/audit-assignments/${String(report.assignment_id)}` : '/admin/audit-reports'} variant="outline">
            Back
          </LinkButton>
          <Button
            onClick={submit}
            loading={saving}
            disabled={blocking || (action === 'approve' && !canApprove) || (action === 'reject' && !canReject)}
            variant={action === 'reject' ? 'danger' : 'primary'}
          >
            {action === 'approve' ? 'Approve Report' : action === 'reject' ? 'Reject Report' : 'Return for Correction'}
          </Button>
        </div>

        <p className="text-xs text-ink-muted">
          Permissions: {canApprove ? 'approve' : 'no approve'} · {canReject ? 'reject' : 'no reject'} · severity scale{' '}
          {FINDING_SEVERITIES.join(' / ')}. Reports awaiting your decision:{' '}
          <Link className="text-brand-600 hover:underline" href="/admin/audit-reports?pendingVerification=true">open the queue</Link>.
        </p>
      </div>
    </div>
  );
}

function Metric({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</p>
      <p className={danger ? 'mt-0.5 text-lg font-semibold text-red-600' : 'mt-0.5 text-lg font-semibold text-ink'}>{value}</p>
    </div>
  );
}

function ListBlock({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <h3 className="mb-1 text-sm font-semibold text-ink">{title}</h3>
      <ul className="list-disc space-y-1 rounded-lg border border-line bg-slate-50 p-3 pl-8 text-sm text-ink-soft">
        {items.map((item, index) => <li key={index}>{item}</li>)}
      </ul>
    </div>
  );
}
