'use client';

/**
 * The auditor's audit workspace — the screen where an audit is actually executed.
 *
 * One component drives all three views the specification asks for:
 *   • `draft`   — the composer: write the summary, score the sections, record the
 *                 findings, attach the evidence, tick the corrections off.
 *   • `preview` — the document exactly as it will be printed, plus the submit panel.
 *   • `view`    — read-only, for audits that are with the verifier or closed.
 *
 * Saving is explicit *and* automatic: a debounce timer writes the working copy
 * after a few seconds of inactivity, so a lost tab never costs a paragraph, and
 * `Save Draft` gives the auditor the same thing on demand. Submitting is gated on
 * the checklist the service computes — every required item green, no open
 * corrections — so the API's rules are visible before the button is pressed.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Card, CardHeader, CardBody, StatCard } from '@/components/ui/card';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button, LinkButton } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Tabs } from '@/components/ui/tabs';
import { ProgressBar } from '@/components/ui/progress-bar';
import { EmptyState } from '@/components/ui/empty-state';
import { FileList, type FileListEntry } from '@/components/files/file-list';
import { MultiFileUpload } from '@/components/ui/multi-file-upload';
import { ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/utils/api-client';
import { formatDate, formatDateTime } from '@/lib/utils/dates';
import { formatNumber, truncate } from '@/lib/utils/formatting';
import { FINDING_SEVERITIES, FINDING_STATUSES, type ReportBody, type FindingInput } from '@/lib/validations/audit-report.validation';
import type { AuditWorkspaceBundle } from '@/services/auditor-workspace.service';

export type WorkspaceMode = 'draft' | 'preview' | 'view';

export interface WorkspacePermissions {
  canEdit: boolean;
  canSubmit: boolean;
}

interface WorkspaceProps {
  workspace: AuditWorkspaceBundle;
  mode: WorkspaceMode;
  permissions: WorkspacePermissions;
}

const EMPTY_BODY: ReportBody = {
  executive_summary: null, methodology: null, findings: [],
  scorecard: [], observations: [], recommendations: [], regulatory_references: [],
};

export function AuditWorkspace({ workspace, mode, permissions }: WorkspaceProps) {
  const router = useRouter();
  const { success, error: errorToast } = useToast();
  const { assignment, report, versions, comments, decisions, openCorrections, files, history, checklist } = workspace;

  const [body, setBody] = useState<ReportBody>(() => (workspace.body ?? EMPTY_BODY) as ReportBody);
  const [period, setPeriod] = useState({
    audit_period_from: (report?.audit_period_from ?? '') as string,
    audit_period_to: (report?.audit_period_to ?? '') as string,
    audit_date: (report?.audit_date ?? '') as string,
  });
  const [savedAt, setSavedAt] = useState<string | null>(workspace.draftSavedAt ?? null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [tab, setTab] = useState(mode === 'preview' ? 'document' : 'composer');
  const autosave = useRef<ReturnType<typeof setTimeout> | null>(null);

  const editable = permissions.canEdit && mode === 'draft';
  const reportId = report?.id ? Number(report.id) : null;
  const endpoint = `/api/auditor/audits/${assignment.id}`;

  /* --------------------------------------------------------------- saving */

  const save = useCallback(async (silent = false) => {
    if (!editable) return;
    setSaving(true);
    const result = await api.put(`${endpoint}/draft`, { body, ...period });
    setSaving(false);

    if (result.ok) {
      setDirty(false);
      setSavedAt(new Date().toISOString().slice(0, 19).replace('T', ' '));
      if (!silent) success('Draft saved', result.message);
      router.refresh();
    } else {
      // Name the offending fields (e.g. body.findings.0.due_date) instead of a bare "Validation failed".
      const issues = Array.isArray(result.errors)
        ? result.errors.slice(0, 3).map((issue) => `${issue.field}: ${issue.message}`).join(' · ')
        : '';
      errorToast('Could not save the draft', issues || result.message);
    }
  }, [editable, endpoint, body, period, success, errorToast, router]);

  // Autosave: three seconds after the last keystroke, quietly.
  useEffect(() => {
    if (!editable || !dirty) return undefined;
    if (autosave.current) clearTimeout(autosave.current);
    autosave.current = setTimeout(() => { void save(true); }, 3000);
    return () => { if (autosave.current) clearTimeout(autosave.current); };
  }, [dirty, editable, save]);

  // A closing tab mid-edit still gets the work written once.
  useEffect(() => {
    if (!editable) return undefined;
    const flush = () => { if (dirty) void save(true); };
    window.addEventListener('beforeunload', flush);
    return () => window.removeEventListener('beforeunload', flush);
  }, [dirty, editable, save]);

  function patch(next: Partial<ReportBody>) {
    setBody((current) => ({ ...current, ...next }));
    setDirty(true);
  }

  /* ------------------------------------------------------------- submitting */

  const blocking = checklist.filter((item) => item.required && !item.done);
  const canSubmitNow = editable && permissions.canSubmit && blocking.length === 0
    && ['Draft', 'Changes Requested', undefined].includes(String(report?.status ?? 'Draft'));

  async function submit() {
    setSubmitting(true);
    if (dirty) await save(true);
    const result = await api.post(`${endpoint}/submit`, {
      change_summary: report?.status === 'Changes Requested'
        ? 'Resubmission after the verifier’s corrections'
        : 'Initial submission',
      send_to_verifier: true,
    });
    setSubmitting(false);
    setConfirmSubmit(false);

    if (result.ok) {
      success('Report submitted', result.message);
      router.refresh();
    } else {
      errorToast('Could not submit the report', result.message);
    }
  }

  /* --------------------------------------------------------------- sections */

  const totals = useMemo(() => {
    const rows = body.scorecard ?? [];
    const max = rows.reduce((sum, row) => sum + Number(row.max_score ?? 0), 0);
    const obtained = rows.reduce((sum, row) => sum + Number(row.obtained_score ?? 0), 0);
    return { max, obtained, percentage: max > 0 ? Math.round((obtained / max) * 10000) / 100 : null };
  }, [body.scorecard]);

  const findings = body.findings ?? [];

  function updateFinding(index: number, next: Partial<FindingInput>) {
    const list = [...findings];
    list[index] = { ...list[index], ...next };
    patch({ findings: list });
  }

  function addFinding() {
    patch({
      findings: [...findings, {
        severity: 'Minor', clause: null, description: '', evidence: null,
        recommendation: null, status: 'Open', due_date: null,
      } as FindingInput],
    });
  }

  function removeFinding(index: number) {
    patch({ findings: findings.filter((_, position) => position !== index) });
  }

  function moveFinding(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= findings.length) return;
    const list = [...findings];
    [list[index], list[target]] = [list[target], list[index]];
    patch({ findings: list });
  }

  function updateScorecard(index: number, next: Partial<ReportBody['scorecard'][number]>) {
    const rows = [...(body.scorecard ?? [])];
    rows[index] = { ...rows[index], ...next };
    patch({ scorecard: rows });
  }

  const stringSections: { key: 'observations' | 'recommendations' | 'regulatory_references'; title: string; hint: string; placeholder: string }[] = [
    { key: 'observations', title: 'Observations', hint: 'Things worth recording that are not breaches.', placeholder: 'Housekeeping in the press shop has improved since the last audit' },
    { key: 'recommendations', title: 'Recommendations', hint: 'What the employer should do next.', placeholder: 'Fit tamper-proof interlock housings' },
    { key: 'regulatory_references', title: 'Regulatory References', hint: 'The statutes and rules this audit relies on.', placeholder: 'Factories Act, 1948 — s.21' },
  ];

  /* ----------------------------------------------------------------- views */

  const composer = (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-5">
        <Card>
          <CardHeader
            title="Audit Particulars"
            description={`${assignment.assignment_number} · ${String(assignment.assignment_type).replace('_', ' ')}`}
            action={<StatusBadge status={String(assignment.status)} />}
          />
          <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Employer" value={String(assignment.employer_name ?? '—')} />
            <Field label="Unit / Department" value={[assignment.unit_name, assignment.department_name].filter(Boolean).join(' · ') || 'All units'} />
            <Field label="Verifier" value={String(assignment.verifier_name ?? 'Not assigned')} />
            <Field label="Audit Window" value={`${formatDate(assignment.start_date as string)} → ${formatDate(assignment.end_date as string)}`} />
            <Field label="Due" value={formatDate(assignment.due_date as string)} />
            <Field label="Priority" value={String(assignment.priority ?? '—')} />
            {editable ? (
              <>
                <Input label="Period from" type="date" value={period.audit_period_from ?? ''}
                  onChange={(event) => { setPeriod((p) => ({ ...p, audit_period_from: event.target.value })); setDirty(true); }} />
                <Input label="Period to" type="date" value={period.audit_period_to ?? ''}
                  onChange={(event) => { setPeriod((p) => ({ ...p, audit_period_to: event.target.value })); setDirty(true); }} />
                <Input label="Audit date" type="date" value={period.audit_date ?? ''}
                  onChange={(event) => { setPeriod((p) => ({ ...p, audit_date: event.target.value })); setDirty(true); }} />
              </>
            ) : (
              <>
                <Field label="Period" value={`${formatDate(report?.audit_period_from as string)} → ${formatDate(report?.audit_period_to as string)}`} />
                <Field label="Audit date" value={formatDate(report?.audit_date as string)} />
                <Field label="Report" value={String(report?.report_number ?? 'Not started')} />
              </>
            )}
          </CardBody>
          {assignment.scope ? (
            <div className="border-t border-line px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Scope</p>
              <p className="mt-1 text-sm text-ink-soft">{String(assignment.scope)}</p>
              {assignment.instructions ? (
                <>
                  <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">Instructions</p>
                  <p className="mt-1 text-sm text-ink-soft">{String(assignment.instructions)}</p>
                </>
              ) : null}
            </div>
          ) : null}
        </Card>

        <Card>
          <CardHeader title="Executive Summary" description="What the audit found, in two or three sentences." />
          <CardBody className="space-y-4">
            <Textarea
              label="Summary"
              rows={5}
              required
              disabled={!editable}
              value={body.executive_summary ?? ''}
              onChange={(event) => patch({ executive_summary: event.target.value })}
              helper={`${(body.executive_summary ?? '').length} / 8000 characters — at least 40 to submit.`}
            />
            <Textarea
              label="Scope & Methodology"
              rows={5}
              required
              disabled={!editable}
              value={body.methodology ?? ''}
              onChange={(event) => patch({ methodology: event.target.value })}
              helper="What was inspected, who was interviewed, which records were verified."
            />
          </CardBody>
        </Card>

        <Card padded={false}>
          <CardHeader
            title="Section-wise Scorecard"
            description="The percentage is derived from these rows and drives the compliance grading."
            action={editable ? (
              <Button size="sm" variant="outline"
                onClick={() => patch({ scorecard: [...(body.scorecard ?? []), { section: '', max_score: 0, obtained_score: 0, remarks: null }] })}>
                Add Section
              </Button>
            ) : undefined}
          />
          <CardBody className="space-y-3">
            {(body.scorecard ?? []).length === 0 ? (
              <EmptyState
                title="No sections scored yet"
                subtitle="Add a section per area audited — machine guarding, PPE, records — with its maximum and obtained score."
              />
            ) : (body.scorecard ?? []).map((row, index) => (
              <div key={index} className="grid gap-3 rounded-lg border border-line bg-surface-muted p-3 lg:grid-cols-[minmax(0,2fr)_110px_120px_minmax(0,2fr)_40px]">
                <Input label={index === 0 ? 'Section' : undefined} placeholder="Machine guarding" disabled={!editable}
                  value={row.section ?? ''} onChange={(event) => updateScorecard(index, { section: event.target.value })} />
                <Input label={index === 0 ? 'Max' : undefined} type="number" min={0} disabled={!editable}
                  value={String(row.max_score ?? 0)} onChange={(event) => updateScorecard(index, { max_score: Number(event.target.value) })} />
                <Input label={index === 0 ? 'Obtained' : undefined} type="number" min={0} disabled={!editable}
                  value={String(row.obtained_score ?? 0)} onChange={(event) => updateScorecard(index, { obtained_score: Number(event.target.value) })} />
                <Input label={index === 0 ? 'Remarks' : undefined} placeholder="Two interlocks bypassed" disabled={!editable}
                  value={row.remarks ?? ''} onChange={(event) => updateScorecard(index, { remarks: event.target.value })} />
                {editable ? (
                  <button
                    type="button"
                    className="btn-icon btn-icon-danger self-end"
                    title="Remove section"
                    aria-label={`Remove ${row.section || 'section'}`}
                    onClick={() => patch({ scorecard: (body.scorecard ?? []).filter((_, position) => position !== index) })}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                    </svg>
                  </button>
                ) : null}
              </div>
            ))}

            <div className="flex flex-wrap items-center gap-6 rounded-lg border border-line px-4 py-3">
              <span className="text-sm text-ink-soft">
                Maximum <strong className="text-ink-strong">{totals.max.toFixed(2)}</strong>
              </span>
              <span className="text-sm text-ink-soft">
                Obtained <strong className="text-ink-strong">{totals.obtained.toFixed(2)}</strong>
              </span>
              <span className="text-sm text-ink-soft">
                Compliance <strong className="text-ink-strong">{totals.percentage === null ? '—' : `${totals.percentage.toFixed(2)}%`}</strong>
              </span>
              <div className="min-w-[160px] flex-1">
                <ProgressBar value={totals.percentage ?? 0} tone={toneFor(totals.percentage)} showValue />
              </div>
            </div>
          </CardBody>
        </Card>

        <Card padded={false}>
          <CardHeader
            title="Findings Register"
            description="Every breach or gap, with the clause it breaches, the evidence relied on and what has to change."
            action={editable ? <Button size="sm" onClick={addFinding}>Add Finding</Button> : undefined}
          />
          <CardBody className="space-y-4">
            {findings.length === 0 ? (
              <EmptyState
                title="No findings recorded"
                subtitle="Add a finding for each breach — severity, the clause it breaches, the evidence and the recommendation."
              />
            ) : findings.map((finding, index) => (
              <motion.div
                key={`finding-${index}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="rounded-lg border border-line"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface-muted px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Badge tone={severityTone(finding.severity ?? 'Minor')}>F-{String(index + 1).padStart(2, '0')} · {finding.severity ?? 'Minor'}</Badge>
                    {editable ? null : <Badge tone="slate">{finding.status ?? 'Open'}</Badge>}
                  </div>
                  {editable ? (
                    <div className="flex items-center gap-1">
                      <button type="button" className="btn-icon" title="Move up" aria-label="Move finding up"
                        disabled={index === 0} onClick={() => moveFinding(index, -1)}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M12 19V5M5 12l7-7 7 7" /></svg>
                      </button>
                      <button type="button" className="btn-icon" title="Move down" aria-label="Move finding down"
                        disabled={index === findings.length - 1} onClick={() => moveFinding(index, 1)}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M12 5v14M19 12l-7 7-7-7" /></svg>
                      </button>
                      <button type="button" className="btn-icon btn-icon-danger" title="Remove finding" aria-label="Remove finding"
                        onClick={() => removeFinding(index)}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg>
                      </button>
                    </div>
                  ) : null}
                </div>
                <div className="grid gap-3 p-3 lg:grid-cols-2">
                  <Select label="Severity" disabled={!editable} value={finding.severity ?? 'Minor'}
                    onChange={(value) => updateFinding(index, { severity: value as FindingInput['severity'] })}
                    options={FINDING_SEVERITIES.map((severity) => ({ value: severity, label: severity }))} />
                  <Input label="Clause / reference" placeholder="Factories Act 1948 — s.21" disabled={!editable}
                    value={finding.clause ?? ''} onChange={(event) => updateFinding(index, { clause: event.target.value })} />
                  <div className="lg:col-span-2">
                    <Textarea label="Description" maxLength={4000} rows={3} required disabled={!editable}
                      value={finding.description ?? ''} onChange={(event) => updateFinding(index, { description: event.target.value })}
                      helper="At least 10 characters. Describe what was found and why it matters." />
                  </div>
                  <Textarea label="Evidence" maxLength={2000} rows={2} disabled={!editable} placeholder="Photograph P-07-1; register page 42"
                    value={finding.evidence ?? ''} onChange={(event) => updateFinding(index, { evidence: event.target.value })} />
                  <Textarea label="Recommendation" maxLength={2000} rows={2} disabled={!editable} placeholder="Restore the interlock and lock out the machine until done."
                    value={finding.recommendation ?? ''} onChange={(event) => updateFinding(index, { recommendation: event.target.value })} />
                  <Textarea label="Employer response" maxLength={2000} rows={2} disabled={!editable} placeholder="Recorded at the closing meeting."
                    value={finding.employer_response ?? ''} onChange={(event) => updateFinding(index, { employer_response: event.target.value })} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Select label="Status" disabled={!editable} value={finding.status ?? 'Open'}
                      onChange={(value) => updateFinding(index, { status: value as FindingInput['status'] })}
                      options={FINDING_STATUSES.map((status) => ({ value: status, label: status }))} />
                    <Input label="Target date" type="date" disabled={!editable}
                      value={(finding.due_date as string) ?? ''} onChange={(event) => updateFinding(index, { due_date: event.target.value })} />
                  </div>
                </div>
              </motion.div>
            ))}
          </CardBody>
        </Card>

        {stringSections.map((section) => (
          <Card key={section.key}>
            <CardHeader
              title={section.title}
              description={section.hint}
              action={editable ? (
                <Button size="sm" variant="outline"
                  onClick={() => patch({ [section.key]: [...(body[section.key] ?? []), ''] } as Partial<ReportBody>)}>
                  Add Line
                </Button>
              ) : undefined}
            />
            <CardBody className="space-y-2">
              {(body[section.key] ?? []).length === 0 ? (
                <p className="text-sm text-ink-muted">Nothing recorded yet.</p>
              ) : (body[section.key] ?? []).map((entry, index) => (
                <div key={`${section.key}-${index}`} className="flex items-start gap-2">
                  <Input
                    placeholder={section.placeholder}
                    disabled={!editable}
                    value={entry}
                    onChange={(event) => {
                      const list = [...(body[section.key] ?? [])];
                      list[index] = event.target.value;
                      patch({ [section.key]: list } as Partial<ReportBody>);
                    }}
                  />
                  {editable ? (
                    <button type="button" className="btn-icon btn-icon-danger mt-2" title={`Remove ${section.title} line`}
                      aria-label={`Remove ${section.title} line`}
                      onClick={() => patch({
                        [section.key]: (body[section.key] ?? []).filter((_, position) => position !== index),
                      } as Partial<ReportBody>)}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                        <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                      </svg>
                    </button>
                  ) : null}
                </div>
              ))}
            </CardBody>
          </Card>
        ))}
      </div>

      <aside className="space-y-5">
        <Card>
          <CardHeader title="Submission Checklist" description="Everything marked required must be green." />
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
                  {!item.done && <p className="text-xs text-ink-muted">{item.hint}</p>}
                </div>
              </div>
            ))}
          </CardBody>
          <div className="border-t border-line px-4 py-3">
            <Button
              className="w-full"
              disabled={!canSubmitNow || saving}
              loading={submitting}
              onClick={() => setConfirmSubmit(true)}
            >
              {report?.status === 'Changes Requested' ? 'Resubmit for Verification' : 'Submit for Verification'}
            </Button>
            <Button className="mt-2 w-full" variant="outline" disabled={!editable || saving} loading={saving}
              onClick={() => void save(false)}>
              {dirty ? 'Save Draft' : 'Draft Saved'}
            </Button>
            <p className="mt-2 text-xs text-ink-muted">
              {savedAt ? `Last saved ${formatDateTime(savedAt)}` : 'Not saved yet'}
              {dirty ? ' · unsaved changes' : ''}
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader title="Evidence" description="Files filed against this audit." action={<Badge tone="slate">{files.length}</Badge>} />
          <CardBody>
            <FileList
              files={files as unknown as FileListEntry[]}
              canDelete={false}
              emptyMessage="No evidence filed yet — upload inspection photographs, registers and work orders from the Documents tab."
              onChanged={() => router.refresh()}
            />
            <div className="mt-3">
              {editable ? (
                <MultiFileUpload
                  label="File evidence"
                  entityType="AUDIT_ASSIGNMENT"
                  entityId={Number(assignment.id)}
                  category="Audit Evidence"
                  onUploaded={() => router.refresh()}
                />
              ) : null}
            </div>
          </CardBody>
        </Card>
      </aside>
    </div>
  );

  const documentView = <AuditDocument workspace={workspace} body={body} />;

  const correctionsPanel = (
    <div className="space-y-5">
      <Card padded={false}>
        <CardHeader
          title="Verifier Corrections"
          description={openCorrections.length
            ? `${openCorrections.length} correction${openCorrections.length === 1 ? '' : 's'} to clear before the next submission.`
            : 'Nothing outstanding.'}
        />
        <CardBody className="space-y-3">
          {openCorrections.length === 0 ? (
            <EmptyState title="No open corrections" subtitle="When the verifier returns the report, each correction appears here with the section it refers to." />
          ) : openCorrections.map((correction) => (
            <CorrectionCard
              key={correction.id}
              correction={correction}
              endpoint={endpoint}
              canEdit={editable}
              onDone={() => router.refresh()}
            />
          ))}
        </CardBody>
      </Card>

      <Card padded={false}>
        <CardHeader title="Conversation" description={`${comments.length} entr${comments.length === 1 ? 'y' : 'ies'} on this report.`} />
        <CardBody className="space-y-3">
          {comments.length === 0 ? (
            <p className="text-sm text-ink-muted">No comments yet.</p>
          ) : comments.map((comment) => (
            <div key={comment.id} className="rounded-lg border border-line p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-ink-strong">{comment.created_by_name ?? 'System'}</span>
                <span className="text-xs text-ink-muted">{formatDateTime(comment.created_at)}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Badge tone={comment.comment_type === 'correction_request' ? 'danger' : comment.comment_type === 'approval_note' ? 'success' : 'slate'}>
                  {String(comment.comment_type).replace('_', ' ')}
                </Badge>
                {comment.section_ref ? <Badge tone="info">{comment.section_ref}</Badge> : null}
                {comment.is_resolved ? <Badge tone="success">Resolved</Badge> : null}
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-ink-soft">{comment.comment}</p>
            </div>
          ))}

          {editable ? <CommentBox endpoint={`${endpoint}/comments`} onPosted={() => router.refresh()} /> : null}
        </CardBody>
      </Card>
    </div>
  );

  const historyPanel = (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card padded={false}>
        <CardHeader title="Version History" description="Every frozen revision, newest first." />
        <CardBody className="space-y-3">
          {versions.length === 0 ? <p className="text-sm text-ink-muted">No revisions yet — the first is written on submission.</p>
            : versions.map((version) => (
              <div key={version.id} className="flex items-start justify-between gap-3 rounded-lg border border-line p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink-strong">Version {version.version}</p>
                  <p className="text-xs text-ink-muted">{version.change_summary ?? 'No summary'}</p>
                  <p className="mt-1 text-xs text-ink-muted">
                    {version.created_by_name ?? 'System'} · {formatDateTime(version.created_at)}
                  </p>
                </div>
                {version.pdf_file_id ? (
                  <a className="btn-icon" title="Download this revision" aria-label={`Download version ${version.version}`}
                    href={`/api/files/${version.pdf_file_id}/download`}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                      <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 21h16" />
                    </svg>
                  </a>
                ) : null}
              </div>
            ))}
        </CardBody>
      </Card>

      <Card padded={false}>
        <CardHeader title="Audit History" description="Status changes, notifications and corrections on this audit." />
        <CardBody className="space-y-3">
          {history.length === 0 ? <p className="text-sm text-ink-muted">Nothing recorded yet.</p>
            : history.map((entry) => (
              <div key={entry.id} className="border-l-2 border-line pl-3">
                <p className="text-sm text-ink-soft">{entry.description ?? String(entry.action)}</p>
                <p className="text-xs text-ink-muted">
                  {entry.user_name ? `${entry.user_name} · ` : ''}{formatDateTime(entry.created_at)}
                </p>
              </div>
            ))}
        </CardBody>
      </Card>

      {decisions.length > 0 ? (
        <Card padded={false} className="lg:col-span-2">
          <CardHeader title="Verifier Decisions" description="Approvals, rejections and returns, newest first." />
          <CardBody className="space-y-3">
            {decisions.map((decision) => (
              <div key={decision.id} className="rounded-lg border border-line p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Badge tone={decision.action === 'approved' ? 'success' : decision.action === 'rejected' ? 'danger' : 'warning'}>
                    {String(decision.action).replace('_', ' ')}
                  </Badge>
                  <span className="text-xs text-ink-muted">{formatDateTime(decision.created_at)}</span>
                </div>
                <p className="mt-2 text-sm text-ink-soft">{decision.comments}</p>
                {decision.reason ? <p className="mt-1 text-xs text-ink-muted">Reason: {decision.reason}</p> : null}
              </div>
            ))}
          </CardBody>
        </Card>
      ) : null}
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold text-ink-strong">{String(assignment.audit_title)}</h1>
            <StatusBadge status={String(assignment.status)} />
            {report ? <Badge tone="slate">{String(report.report_number)}</Badge> : null}
            {dirty ? <Badge tone="warning">Unsaved changes</Badge> : null}
          </div>
          <p className="mt-1 text-sm text-ink-soft">
            {String(assignment.employer_name ?? '')}
            {assignment.unit_name ? ` · ${String(assignment.unit_name)}` : ''}
            {assignment.department_name ? ` · ${String(assignment.department_name)}` : ''}
            {' · '}Due {formatDate(assignment.due_date as string)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LinkButton href="/auditor/audits" variant="outline" size="sm">All Audits</LinkButton>
          {reportId ? (
            <a className="btn btn-outline btn-sm" href={`/api/pdf/audit-report/${reportId}`} target="_blank" rel="noreferrer">
              Download PDF
            </a>
          ) : null}
          {mode === 'draft' && reportId ? (
            <LinkButton href={`/auditor/audits/${assignment.id}/preview`} variant="outline" size="sm">Preview</LinkButton>
          ) : null}
          {mode !== 'draft' && editable ? (
            <LinkButton href={`/auditor/audits/${assignment.id}/draft`} size="sm">Continue Editing</LinkButton>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Compliance" value={report?.score_percentage === null || report?.score_percentage === undefined ? '—' : `${Number(report.score_percentage).toFixed(1)}%`}
          hint={totals.max ? `${totals.obtained.toFixed(0)} of ${totals.max.toFixed(0)} points` : 'Score not entered'} tone={toneFor(report?.score_percentage === null || report?.score_percentage === undefined ? null : Number(report.score_percentage))} />
        <StatCard label="Findings" value={formatNumber(findings.length)}
          hint={`${formatNumber(findings.filter((f) => f.severity === 'Critical').length)} critical · ${formatNumber(findings.filter((f) => f.severity === 'Major').length)} major`}
          tone={findings.some((f) => f.severity === 'Critical') ? 'red' : 'amber'} />
        <StatCard label="Corrections" value={formatNumber(openCorrections.length)} hint="Open verifier requests" tone={openCorrections.length ? 'red' : 'emerald'} />
        <StatCard label="Progress" value={`${Number(assignment.progress_percent ?? 0)}%`} hint={`Version ${Number(report?.current_version ?? 1)}`} tone="brand" />
      </div>

      <Tabs
        key={mode}
        defaultTab={tab}
        items={[
          {
            key: 'composer',
            label: 'Composer',
            badge: editable ? undefined : 'View only',
            disabled: mode === 'preview',
            content: composer,
          },
          { key: 'document', label: 'Document', content: documentView },
          { key: 'corrections', label: 'Corrections', badge: openCorrections.length || undefined, content: correctionsPanel },
          { key: 'history', label: 'Versions & History', content: historyPanel },
        ]}
        onChange={setTab}
      />

      <AnimatePresence>
        {mode === 'preview' && permissions.canSubmit ? (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
            <Card>
              <CardHeader
                title={report?.status === 'Changes Requested' ? 'Resubmit for verification' : 'Submit for verification'}
                description="Submitting freezes a new revision, generates the signed PDF, queues the verifier and notifies the administrators."
              />
              <CardBody className="flex flex-wrap items-center justify-between gap-3">
                <ul className="space-y-1 text-sm text-ink-soft">
                  {blocking.length === 0
                    ? <li className="text-emerald-700">All required checks complete.</li>
                    : blocking.map((item) => <li key={item.key} className="text-red-600">• {item.label} — {item.hint}</li>)}
                </ul>
                <div className="flex items-center gap-2">
                  <LinkButton href={`/auditor/audits/${assignment.id}/draft`} variant="outline" size="sm">Back to Composer</LinkButton>
                  <Button disabled={!canSubmitNow} loading={submitting} onClick={() => setConfirmSubmit(true)}>
                    {report?.status === 'Changes Requested' ? 'Resubmit' : 'Submit'}
                  </Button>
                </div>
              </CardBody>
            </Card>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <ConfirmDialog
        open={confirmSubmit}
        onClose={() => setConfirmSubmit(false)}
        onConfirm={() => void submit()}
        loading={submitting}
        title={report?.status === 'Changes Requested' ? 'Resubmit this report?' : 'Submit this report for verification?'}
        message={`${report?.report_number ?? 'The report'} will be frozen as a new revision, a PDF will be generated and filed, and the verifier will be asked to review it. You will be notified with the outcome.`}
        confirmLabel={report?.status === 'Changes Requested' ? 'Resubmit' : 'Submit'}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ pieces */

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
      <p className="mt-0.5 text-sm text-ink-strong">{value}</p>
    </div>
  );
}

function CorrectionCard({
  correction, endpoint, canEdit, onDone,
}: {
  correction: { id: number; comment: string; severity: string; section_ref?: string | null; field_ref?: string | null; created_at: string };
  endpoint: string;
  canEdit: boolean;
  onDone: () => void;
}) {
  const { success, error: errorToast } = useToast();
  const [busy, setBusy] = useState(false);

  async function resolve() {
    setBusy(true);
    const result = await api.put(`${endpoint}/comments/${correction.id}`, { is_resolved: true });
    setBusy(false);
    if (result.ok) { success('Correction marked as done', result.message); onDone(); }
    else errorToast('Could not update the correction', result.message);
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={severityTone(correction.severity === 'critical' ? 'Critial' : 'Minor')}>{correction.severity}</Badge>
          {correction.section_ref ? <Badge tone="info">{correction.section_ref}</Badge> : null}
          {correction.field_ref ? <Badge tone="slate">{correction.field_ref}</Badge> : null}
        </div>
        <span className="text-xs text-ink-muted">{formatDateTime(correction.created_at)}</span>
      </div>
      <p className="mt-2 text-sm text-ink-soft">{correction.comment}</p>
      {canEdit ? (
        <Button size="sm" variant="outline" className="mt-2" loading={busy} onClick={() => void resolve()}>
          Mark as done
        </Button>
      ) : null}
    </div>
  );
}

function CommentBox({ endpoint, onPosted }: { endpoint: string; onPosted: () => void }) {
  const { success, error: errorToast } = useToast();
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  async function post() {
    setBusy(true);
    const result = await api.post(endpoint, { comment, comment_type: 'auditor_reply' });
    setBusy(false);
    if (result.ok) { success('Comment added', result.message); setComment(''); onPosted(); }
    else errorToast('Could not add the comment', result.message);
  }

  return (
    <div className="space-y-2">
      <Textarea label="Reply to the verifier" rows={3} value={comment} onChange={(event) => setComment(event.target.value)}
        placeholder="Work order WO-2291 is filed as evidence — the interlock was tested after repair." />
      <div className="flex justify-end">
        <Button size="sm" loading={busy} disabled={comment.trim().length < 2} onClick={() => void post()}>Post Reply</Button>
      </div>
    </div>
  );
}

/** The document as it will be printed: letterhead, score summary, findings, signatures. */
function AuditDocument({ workspace, body }: { workspace: AuditWorkspaceBundle; body: ReportBody }) {
  const { assignment, report } = workspace;
  const findings = body.findings ?? [];
  const rows = body.scorecard ?? [];
  const max = rows.reduce((sum, row) => sum + Number(row.max_score ?? 0), 0);
  const obtained = rows.reduce((sum, row) => sum + Number(row.obtained_score ?? 0), 0);
  const percentage = max > 0 ? Math.round((obtained / max) * 10000) / 100 : report?.score_percentage ?? null;

  return (
    <Card className="mx-auto max-w-4xl">
      <div className="border-b border-line px-6 py-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand-600">ComplianceOS Audit Report</p>
        <h2 className="mt-1 text-lg font-semibold text-ink-strong">{String(assignment.audit_title)}</h2>
        <p className="mt-1 text-sm text-ink-soft">
          {String(assignment.employer_name ?? '')}
          {assignment.unit_name ? ` · ${String(assignment.unit_name)}` : ''}
          {assignment.department_name ? ` · ${String(assignment.department_name)}` : ''}
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <Badge tone="slate">Report {String(report?.report_number ?? '—')}</Badge>
          <Badge tone="slate">Version {Number(report?.current_version ?? 1)}</Badge>
          <Badge tone="slate">Assignment {String(assignment.assignment_number)}</Badge>
          <StatusBadge status={String(report?.status ?? 'Draft')} />
        </div>
      </div>

      <div className="grid gap-4 border-b border-line px-6 py-5 sm:grid-cols-3">
        <Field label="Audit period" value={`${formatDate(report?.audit_period_from as string)} → ${formatDate(report?.audit_period_to as string)}`} />
        <Field label="Auditor" value={String(assignment.auditor_name ?? '—')} />
        <Field label="Verifier" value={String(assignment.verifier_name ?? 'Not assigned')} />
      </div>

      <div className="grid gap-4 border-b border-line px-6 py-5 sm:grid-cols-4">
        <Field label="Compliance" value={percentage === null ? '—' : `${Number(percentage).toFixed(2)}%`} />
        <Field label="Score" value={max ? `${obtained.toFixed(2)} / ${max.toFixed(2)}` : '—'} />
        <Field label="Findings" value={`${formatNumber(findings.length)}`} />
        <Field label="Observations" value={`${formatNumber((body.observations ?? []).length)}`} />
      </div>

      {body.executive_summary ? (
        <section className="border-b border-line px-6 py-5">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Executive Summary</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm text-ink-soft">{body.executive_summary}</p>
        </section>
      ) : null}

      {body.methodology ? (
        <section className="border-b border-line px-6 py-5">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Scope & Methodology</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm text-ink-soft">{body.methodology}</p>
        </section>
      ) : null}

      {rows.length > 0 ? (
        <section className="border-b border-line px-6 py-5">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Section-wise Scorecard</h3>
          <table className="table-base mt-2">
            <thead>
              <tr>
                <th className="table-head">Section</th>
                <th className="table-head text-right">Max</th>
                <th className="table-head text-right">Obtained</th>
                <th className="table-head text-right">%</th>
                <th className="table-head">Remarks</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index}>
                  <td className="table-cell">{row.section}</td>
                  <td className="table-cell text-right">{Number(row.max_score ?? 0).toFixed(2)}</td>
                  <td className="table-cell text-right">{Number(row.obtained_score ?? 0).toFixed(2)}</td>
                  <td className="table-cell text-right">
                    {Number(row.max_score) > 0 ? `${((Number(row.obtained_score ?? 0) / Number(row.max_score)) * 100).toFixed(1)}%` : '—'}
                  </td>
                  <td className="table-cell">{row.remarks ?? '—'}</td>
                </tr>
              ))}
              <tr className="bg-surface-muted">
                <td className="table-cell font-semibold">Total</td>
                <td className="table-cell text-right font-semibold">{max.toFixed(2)}</td>
                <td className="table-cell text-right font-semibold">{obtained.toFixed(2)}</td>
                <td className="table-cell text-right font-semibold">{percentage === null ? '—' : `${Number(percentage).toFixed(2)}%`}</td>
                <td className="table-cell" />
              </tr>
            </tbody>
          </table>
        </section>
      ) : null}

      {findings.length > 0 ? (
        <section className="border-b border-line px-6 py-5">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Findings Register</h3>
          <div className="mt-3 space-y-3">
            {findings.map((finding, index) => (
              <div key={index} className="rounded-lg border border-line p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={severityTone(finding.severity ?? 'Minor')}>F-{String(index + 1).padStart(2, '0')} · {finding.severity}</Badge>
                    <Badge tone="slate">{finding.status ?? 'Open'}</Badge>
                  </div>
                  {finding.clause ? <span className="text-xs text-ink-muted">{finding.clause}</span> : null}
                </div>
                <p className="mt-2 text-sm text-ink-soft">{finding.description}</p>
                {finding.evidence ? <p className="mt-1 text-xs text-ink-muted">Evidence: {finding.evidence}</p> : null}
                {finding.recommendation ? <p className="mt-1 text-xs text-ink-muted">Action required: {finding.recommendation}</p> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {([
        ['Observations', body.observations],
        ['Recommendations', body.recommendations],
        ['Regulatory References', body.regulatory_references],
      ] as const).map(([title, items]) => (items ?? []).length ? (
        <section key={title} className="border-b border-line px-6 py-5">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">{title}</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-soft">
            {(items ?? []).map((item, index) => <li key={index}>{item}</li>)}
          </ul>
        </section>
      ) : null)}

      <div className="grid gap-6 px-6 py-6 sm:grid-cols-3">
        {['Auditor', 'Verifier', 'Authorised Signatory (Employer)'].map((role) => (
          <div key={role} className="text-center">
            <div className="h-12 border-b border-dashed border-line" />
            <p className="mt-2 text-xs font-medium text-ink-soft">{role}</p>
          </div>
        ))}
      </div>

      <div className="border-t border-line px-6 py-3 text-xs text-ink-muted">
        Report {String(report?.report_number ?? '—')} · Version {Number(report?.current_version ?? 1)} · Generated from the ComplianceOS audit register.
        {workspace.decisions.length ? ` · ${truncate(workspace.decisions[0].comments, 120)}` : ''}
      </div>
    </Card>
  );
}

function toneFor(percentage: number | null | undefined): 'brand' | 'emerald' | 'amber' | 'red' {
  if (percentage === null || percentage === undefined) return 'brand';
  if (percentage >= 75) return 'emerald';
  if (percentage >= 60) return 'amber';
  return 'red';
}

function severityTone(severity: string): 'default' | 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'violet' | 'slate' {
  switch (severity) {
    case 'Critical': return 'danger';
    case 'Major': return 'warning';
    case 'Minor': return 'info';
    default: return 'slate';
  }
}

export default AuditWorkspace;
