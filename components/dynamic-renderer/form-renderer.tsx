'use client';

/**
 * Dynamic form renderer.
 *
 * One component serves every panel and every mode:
 *   • `fill`    — the auditor / employer / employee filling the form in, with
 *                 autosaved drafts, live conditional logic, formulas, tables,
 *                 uploads and the submission checklist;
 *   • `view`    — read-only record of what was submitted (plus the reviewer's
 *                 decision panel when the caller may verify);
 *   • `preview` — the builder's live preview: identical rendering, no persistence.
 *
 * The visibility rules, formula evaluation and scoring come from
 * `services/dynamic-form-rules`, the same module the API validates with, so what
 * the browser hides the server also ignores and what the browser totals the
 * server also scores.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Checkbox, Input, Switch, Textarea } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { TimePicker } from '@/components/ui/time-picker';
import { Select, MultiSelect } from '@/components/ui/select';
import { Rating } from '@/components/ui/rating';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { SignaturePad } from '@/components/ui/signature-pad';
import { FileUpload, getCsrfToken, type UploadedFileMeta } from '@/components/ui/file-upload';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/utils/api-client';
import { formatCurrency } from '@/lib/utils/formatting';
import { formatDate, formatDateTime } from '@/lib/utils/dates';
import {
  applyFormulaFields, applyTableFormulas, computeScore, defaultValues, evaluateConditions, fieldState, isMultiValue,
  tableTotals, validateSubmission, type FormStructure, type StructureField, type TableRowMap, type ValueMap,
} from '@/services/dynamic-form-rules';
import { evaluateFormula } from '@/lib/utils/formula';
import type { ConditionalLogic, FieldOption } from '@/types/dynamic-module';

export interface RendererSpec {
  form: Record<string, unknown>;
  module: Record<string, unknown>;
  structure: {
    layoutColumns: number;
    requiresSignature: boolean;
    requiresAttachments: boolean;
    sections: {
      id: number;
      title: string;
      description: string | null;
      section_code: string | null;
      layout_columns: number;
      is_collapsible: boolean;
      is_collapsed: boolean;
      sort_order: number;
      fields: RendererField[];
      tables: RendererTable[];
    }[];
  };
  defaults?: ValueMap;
  existingDraftId?: number | null;
}

export interface RendererField {
  id: number;
  section_id: number;
  field_key: string;
  label: string;
  label_ta: string | null;
  field_type: string;
  placeholder: string | null;
  help_text: string | null;
  default_value: string | null;
  options: FieldOption[];
  validation_json: Record<string, unknown> | null;
  conditional_json: Record<string, unknown> | null;
  table_definition_id: number | null;
  formula_expression: string | null;
  is_required: boolean;
  is_readonly: boolean;
  is_unique: boolean;
  column_width: number;
  min_value: number | null;
  max_value: number | null;
  min_length: number | null;
  max_length: number | null;
  regex_pattern: string | null;
}

export interface RendererTable {
  id: number;
  table_key: string;
  table_name: string;
  description: string | null;
  is_repeatable: boolean;
  min_rows: number;
  max_rows: number | null;
  show_row_numbers: boolean;
  show_totals: boolean;
  columns: {
    id: number;
    column_key: string;
    column_label: string;
    column_label_ta: string | null;
    column_type: string;
    options: FieldOption[];
    formula_expression: string | null;
    default_value: string | null;
    is_required: boolean;
    is_editable: boolean;
    is_total: boolean;
    width_pct?: number | null;
    validation_json: Record<string, unknown> | null;
  }[];
}

interface Props {
  mode: 'fill' | 'view' | 'preview';
  spec: RendererSpec;
  /** Panel base, e.g. `/api/auditor/submissions`. Required in `fill` mode. */
  apiBase?: string;
  /** Where review decisions are sent (defaults to `apiBase`). */
  reviewBase?: string;
  submissionId?: number | null;
  values?: ValueMap;
  tableRows?: TableRowMap;
  permissions?: { canEdit: boolean; canSubmit: boolean; canReview: boolean; canDelete: boolean };
  submission?: Record<string, unknown> | null;
  onSaved?: (result: unknown) => void;
}

const AUTOSAVE_MS = 3000;

export function FormRenderer({
  mode, spec, apiBase, reviewBase, submissionId, values: initialValues, tableRows: initialRows,
  permissions, submission, onSaved,
}: Props) {
  const { success, error: errorToast } = useToast();
  const interactive = mode === 'fill' || mode === 'preview';
  /**
   * Both shapes reach this component: the API's workspace payload and the
   * builder's preview spec hand over nested sections, while the rule engine
   * wants the flat `fields` / `tables` lists as well. Deriving them here keeps
   * one renderer for every caller.
   */
  const structure = useMemo<FormStructure>(() => {
    const raw = spec.structure as unknown as FormStructure;
    if (Array.isArray(raw.fields) && Array.isArray(raw.tables)) return raw;
    const sections = (raw.sections ?? []) as unknown as FormStructure['sections'];
    return {
      ...raw,
      fields: sections.flatMap((section) => section.fields ?? []),
      tables: sections.flatMap((section) => section.tables ?? []),
    } as FormStructure;
  }, [spec.structure]);

  const [values, setValues] = useState<ValueMap>(() => ({
    ...defaultValues(structure),
    ...(spec.defaults ?? {}),
    ...(initialValues ?? {}),
  }));
  const [tableRows, setTableRows] = useState<TableRowMap>(() => initialRows ?? {});
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [issues, setIssues] = useState<{ field: string; message: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewAction, setReviewAction] = useState<'approve' | 'reject' | 'return'>('approve');
  const [reviewComments, setReviewComments] = useState('');
  const [reviewScore, setReviewScore] = useState<{ obtained: string; max: string }>({ obtained: '', max: '' });
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [localSubmissionId, setLocalSubmissionId] = useState<number | null>(submissionId ?? null);
  const dirtyRef = useRef(false);

  const editable = interactive && (mode === 'preview' || Boolean(permissions?.canEdit));
  const base = apiBase ?? '';
  const reviewApi = reviewBase ?? base;

  /* ── calculated values ─────────────────────────────────────────────── */
  // Rows with their formula columns filled in: totals, score, validation and the saved payload all use these.
  const computedRows = useMemo(() => applyTableFormulas(structure, tableRows), [structure, tableRows]);
  const computedValues = useMemo(() => applyFormulaFields(structure, values, computedRows), [structure, values, computedRows]);
  const totals = useMemo(() => {
    const out: Record<string, Record<string, number>> = {};
    for (const table of structure.tables) out[table.table_key] = tableTotals(table, computedRows[table.table_key] ?? []);
    return out;
  }, [structure, computedRows]);
  const score = useMemo(() => computeScore(structure, computedValues, computedRows), [structure, computedValues, computedRows]);
  const liveIssues = useMemo(
    () => validateSubmission(structure, computedValues, computedRows, { partial: mode === 'preview' }),
    [structure, computedValues, computedRows, mode]
  );
  const requiredFields = structure.fields.filter((field) => field.is_required && !['heading', 'paragraph', 'divider'].includes(String(field.field_type)));
  const filledRequired = requiredFields.filter((field) => {
    const value = computedValues[field.field_key];
    return value !== null && value !== undefined && value !== '' && !(Array.isArray(value) && value.length === 0);
  }).length;
  const progress = requiredFields.length === 0 ? 100 : Math.round((filledRequired / requiredFields.length) * 100);

  /* ── autosave ──────────────────────────────────────────────────────── */
  const save = useCallback(async (options: { silent?: boolean } = {}) => {
    if (!editable || mode === 'preview' || !base) return null;
    const id = localSubmissionId;
    if (!id) return null;
    setSaving(true);
    try {
      const result = await api.put(`${base}/${id}`, {
        values: computedValues,
        table_rows: computedRows,
        title: (submission?.title as string) ?? undefined,
      });
      if (!result.ok) throw new Error(result.message);
      dirtyRef.current = false;
      setDirty(false);
      setSavedAt(new Date().toLocaleTimeString());
      if (!options.silent) success('Draft saved');
      onSaved?.(result);
      return result;
    } catch (error) {
      errorToast((error as Error).message);
      return null;
    } finally {
      setSaving(false);
    }
  }, [base, computedValues, computedRows, editable, localSubmissionId, mode, onSaved, submission?.title, success, errorToast]);

  useEffect(() => {
    if (!editable || mode === 'preview' || !dirty) return;
    const timer = setTimeout(() => { void save({ silent: true }); }, AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [dirty, editable, mode, save]);

  useEffect(() => {
    const flush = () => { if (dirtyRef.current) void save({ silent: true }); };
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('beforeunload', flush);
      flush();
    };
  }, [save]);

  const setValue = (key: string, value: unknown) => {
    dirtyRef.current = true;
    setValues((current) => ({ ...current, [key]: value }));
    setDirty(true);
  };

  const setRow = (tableKey: string, rowIndex: number, columnKey: string, value: unknown) => {
    dirtyRef.current = true;
    setTableRows((current) => {
      const rows = [...(current[tableKey] ?? [])];
      rows[rowIndex] = { ...(rows[rowIndex] ?? {}), [columnKey]: value };
      return { ...current, [tableKey]: rows };
    });
    setDirty(true);
  };

  const addRow = (table: RendererTable) => {
    const template: Record<string, unknown> = {};
    for (const column of table.columns) {
      if (column.default_value !== null && column.default_value !== '') template[column.column_key] = column.default_value;
    }
    setTableRows((current) => ({ ...current, [table.table_key]: [...(current[table.table_key] ?? []), template] }));
    dirtyRef.current = true;
    setDirty(true);
  };

  const removeRow = (tableKey: string, rowIndex: number) => {
    setTableRows((current) => ({
      ...current,
      [tableKey]: (current[tableKey] ?? []).filter((_, index) => index !== rowIndex),
    }));
    dirtyRef.current = true;
    setDirty(true);
  };

  /* ── start / submit / review ───────────────────────────────────────── */
  async function ensureSubmission(): Promise<number | null> {
    if (localSubmissionId) return localSubmissionId;
    if (!base) return null;
    try {
      const result = await api.post<{ submissionId: number; submissionNumber: string }>(base, {
        form_id: Number(spec.form.id),
        title: (submission?.title as string) ?? null,
      });
      if (!result.ok) throw new Error(result.message);
      const started = result.data as { submissionId?: number } | undefined;
      if (!started?.submissionId) throw new Error('The submission could not be started');
      setLocalSubmissionId(started.submissionId);
      return started.submissionId;
    } catch (error) {
      errorToast((error as Error).message);
      return null;
    }
  }

  async function submit() {
    setSubmitting(true);
    try {
      const id = await ensureSubmission();
      if (!id) return;
      const response = await api.post<{ status: string; issues: { field: string; message: string }[] }>(
        `${base}/${id}/submit`,
        { values: computedValues, table_rows: computedRows, send_to_reviewer: true }
      );
      if (!response.ok) {
        const listed = Array.isArray(response.errors) ? response.errors : [];
        setIssues(listed.length ? listed : [{ field: 'form', message: response.message }]);
        errorToast(listed.length ? 'Please correct the highlighted answers' : response.message);
        return;
      }
      const submitted = response.data as { status?: string } | undefined;
      setIssues([]);
      setDirty(false);
      dirtyRef.current = false;
      success(submitted?.status === 'under_review' ? 'Submitted — the verifier has been notified' : 'Submitted successfully');
      onSaved?.(submitted);
    } catch (error) {
      errorToast((error as Error).message);
    } finally {
      setSubmitting(false);
      setConfirmSubmit(false);
    }
  }

  async function review() {
    if (!submission) return;
    try {
      const response = await api.put<{ status: string }>(`${reviewApi}/${submission.id}`, {
        action: reviewAction,
        comments: reviewComments,
        score_obtained: reviewScore.obtained === '' ? null : Number(reviewScore.obtained),
        score_max: reviewScore.max === '' ? null : Number(reviewScore.max),
        notify_submitter: true,
      });
      if (!response.ok) throw new Error(response.message);
      const reviewed = response.data as { status?: string } | undefined;
      success(`Submission ${(reviewed?.status ?? '').replace(/_/g, ' ')}`);
      setReviewOpen(false);
      onSaved?.(reviewed);
    } catch (error) {
      errorToast((error as Error).message);
    }
  }

  const groupedIssues = issues.reduce<Record<string, string[]>>((acc, issue) => {
    acc[issue.field] = [...(acc[issue.field] ?? []), issue.message];
    return acc;
  }, {});

  /* ── rendering ─────────────────────────────────────────────────────── */
  return (
    <div className="space-y-5">
      {mode === 'fill' && (
        <Card>
          <CardBody className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink">
                  {String(submission?.submission_number ?? 'New submission')}
                  {submission?.status ? <span className="ml-2"><StatusBadge status={String(submission.status)} /></span> : null}
                </p>
                <p className="text-xs text-ink-muted">
                  {filledRequired} of {requiredFields.length} required answer(s) captured
                  {savedAt ? ` · draft saved ${savedAt}` : ''}
                  {dirty ? ' · unsaved changes' : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => save()} loading={saving} disabled={!editable}>
                  Save draft
                </Button>
                <Button onClick={() => setConfirmSubmit(true)} disabled={!permissions?.canSubmit || liveIssues.length > 0}>
                  Submit
                </Button>
              </div>
            </div>
            <ProgressBar value={progress} tone={progress === 100 ? 'emerald' : 'brand'} />
            {liveIssues.length > 0 && (
              <p className="text-xs text-ink-muted">
                {liveIssues.length} answer(s) still to complete before the form can be submitted.
              </p>
            )}
            {Object.keys(groupedIssues).length > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                <p className="text-[13px] font-semibold text-red-700">The server rejected the submission</p>
                <ul className="mt-1 space-y-0.5 text-xs text-red-700">
                  {Object.entries(groupedIssues).map(([field, messages]) => (
                    <li key={field}>• {field}: {messages.join('; ')}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {(score.max > 0 || mode !== 'fill') && score.max > 0 && (
        <Card>
          <CardBody className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-[13px] font-medium text-ink-muted">Live score</p>
              <p className="text-2xl font-bold text-ink">
                {score.obtained} <span className="text-base font-normal text-ink-muted">/ {score.max}</span>
                {score.percentage !== null && <span className="ml-2 text-base text-brand-600">{score.percentage}%</span>}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {score.components.map((component) => (
                <Badge key={component.key} tone={component.obtained >= component.max ? 'success' : component.obtained > 0 ? 'warning' : 'slate'}>
                  {component.label}: {component.obtained}/{component.max}
                </Badge>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {structure.sections.map((section) => {
        const sectionIssue = Object.keys(groupedIssues).some((key) => section.fields.some((f) => f.field_key === key));
        return (
          <Card key={section.id}>
            <CardHeader
              title={section.title}
              description={section.description ?? undefined}
              action={section.is_collapsible ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setCollapsed((current) => ({ ...current, [String(section.id)]: !current[String(section.id)] }))}
                >
                  {collapsed[String(section.id)] ? 'Expand' : 'Collapse'}
                </Button>
              ) : undefined}
            />
            {!collapsed[String(section.id)] && (
              <CardBody className={clsx('space-y-4', sectionIssue && 'ring-1 ring-red-200')}>
                <div className={clsx('grid gap-4', section.layout_columns === 1 ? 'grid-cols-1' : section.layout_columns === 2 ? 'md:grid-cols-2' : 'md:grid-cols-3')}>
                  {section.fields.map((field) => (
                    <FieldWidget
                      key={field.id || field.field_key}
                      field={field as unknown as StructureField}
                      values={computedValues}
                      editable={editable}
                      mode={mode}
                      errors={groupedIssues[field.field_key] ?? []}
                      submissionId={localSubmissionId}
                      onChange={(value) => setValue(field.field_key, value)}
                    />
                  ))}
                </div>

                {section.tables.map((table) => (
                  <TableWidget
                    key={table.id || table.table_key}
                    table={table as unknown as RendererTable}
                    rows={tableRows[table.table_key] ?? []}
                    totals={totals[table.table_key] ?? {}}
                    editable={editable}
                    mode={mode}
                    errors={Object.entries(groupedIssues)
                      .filter(([key]) => key.startsWith(`${table.table_key}.`))
                      .flatMap(([, messages]) => messages)}
                    onChange={(rowIndex, columnKey, value) => setRow(table.table_key, rowIndex, columnKey, value)}
                    onAddRow={() => addRow(table as unknown as RendererTable)}
                    onRemoveRow={(index) => removeRow(table.table_key, index)}
                  />
                ))}
              </CardBody>
            )}
          </Card>
        );
      })}

      {mode === 'view' && submission && (permissions?.canReview || Boolean(submission.review_action)) && (
        <Card>
          <CardHeader title="Verification" description="The reviewer's decision on this submission." />
          <CardBody className="space-y-3">
            {submission.review_action ? (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  <Badge tone={submission.review_action === 'approved' ? 'success' : submission.review_action === 'rejected' ? 'danger' : 'warning'} dot>
                    {String(submission.review_action).toUpperCase()}
                  </Badge>
                  <span className="text-sm text-ink-soft">
                    {String(submission.reviewed_by_name ?? 'Reviewer')} · {submission.reviewed_at ? formatDateTime(String(submission.reviewed_at)) : ''}
                  </span>
                </div>
                {submission.review_comments && <p className="rounded-lg bg-surface-muted p-3 text-sm text-ink-soft">{String(submission.review_comments)}</p>}
                {permissions?.canReview && (
                  <Button variant="outline" onClick={() => { setReviewAction('return'); setReviewOpen(true); }}>Review again</Button>
                )}
              </>
            ) : permissions?.canReview ? (
              <div className="flex flex-wrap gap-2">
                <Button variant="success" onClick={() => { setReviewAction('approve'); setReviewOpen(true); }}>Approve</Button>
                <Button variant="warning" onClick={() => { setReviewAction('return'); setReviewOpen(true); }}>Return for corrections</Button>
                <Button variant="danger" onClick={() => { setReviewAction('reject'); setReviewOpen(true); }}>Reject</Button>
              </div>
            ) : (
              <p className="text-sm text-ink-muted">Waiting for a verifier.</p>
            )}
          </CardBody>
        </Card>
      )}

      <ConfirmDialog
        open={confirmSubmit}
        title="Submit this form?"
        message="Once submitted the answers go to the reviewer and can only be edited if the submission is returned."
        confirmLabel="Submit"
        onConfirm={submit}
        onClose={() => setConfirmSubmit(false)}
        loading={submitting}
      />

      <Modal
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        title={reviewAction === 'approve' ? 'Approve submission' : reviewAction === 'reject' ? 'Reject submission' : 'Return for corrections'}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setReviewOpen(false)}>Cancel</Button>
            <Button
              variant={reviewAction === 'approve' ? 'success' : reviewAction === 'reject' ? 'danger' : 'warning'}
              disabled={reviewComments.trim().length < 5}
              onClick={review}
            >
              Confirm
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Textarea
            label={reviewAction === 'approve' ? 'Approval note' : 'What needs to change?'}
            rows={4}
            value={reviewComments}
            onChange={(event) => setReviewComments(event.target.value)}
            helper="At least 5 characters. The submitter is notified with this text."
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Score awarded (optional)"
              type="number"
              value={reviewScore.obtained}
              onChange={(event) => setReviewScore((current) => ({ ...current, obtained: event.target.value }))}
            />
            <Input
              label="Out of"
              type="number"
              value={reviewScore.max || (score.max ? String(score.max) : '')}
              onChange={(event) => setReviewScore((current) => ({ ...current, max: event.target.value }))}
              helper={score.max ? `Calculated score is ${score.obtained}/${score.max}` : undefined}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}

/* ══════════════════════════════ field widget ═══════════════════════════════ */

function FieldWidget({
  field, values, editable, mode, errors, onChange, submissionId,
}: {
  field: StructureField;
  values: ValueMap;
  editable: boolean;
  mode: 'fill' | 'view' | 'preview';
  errors: string[];
  onChange: (value: unknown) => void;
  submissionId: number | null;
}) {
  const state = fieldState(field, values);
  const options = (field.options ?? []).map((option) => ({ value: String(option.option_key), label: String(option.option_label) }));
  const value = values[field.field_key];
  const label = field.label_ta ? `${field.label} / ${field.label_ta}` : field.label;
  const error = errors[0];
  const disabled = !editable || state.disabled || field.is_readonly;
  const spanClass = field.column_width === 6 ? 'md:col-span-1' : field.column_width <= 4 ? 'md:col-span-1' : 'md:col-span-2';

  if (field.field_type === 'heading') {
    return (
      <div className={clsx('md:col-span-2', spanClass)}>
        <h4 className="border-b border-line pb-1 text-[15px] font-semibold text-ink">{field.label}</h4>
      </div>
    );
  }
  if (field.field_type === 'divider') return <div className="md:col-span-2"><hr className="border-line" /></div>;
  if (field.field_type === 'paragraph') {
    return (
      <div className={clsx('rounded-lg bg-surface-muted p-3 text-sm text-ink-soft md:col-span-2', spanClass)}>
        {field.default_value ?? field.help_text ?? ''}
      </div>
    );
  }
  if (!state.visible) return null;

  const common = {
    label,
    error,
    helper: field.help_text ?? (field.is_unique ? 'Must be unique across submissions' : undefined),
    required: state.required,
    disabled,
  };

  const display = (() => {
    if (value === null || value === undefined || value === '') return '—';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (Array.isArray(value)) {
      const labels = value.map((entry) => options.find((option) => option.value === String(entry))?.label ?? String(entry));
      return labels.join(', ');
    }
    if (field.field_type === 'date') return formatDate(String(value));
    if (field.field_type === 'currency') return formatCurrency(Number(value));
    const option = options.find((entry) => entry.value === String(value));
    if (option) return option.label;
    return String(value);
  })();

  if (mode === 'view' || (disabled && !['signature'].includes(String(field.field_type)))) {
    return (
      <div className={spanClass}>
        <p className="label">
          {label}
          {state.required && <span className="ml-0.5 text-red-500">*</span>}
        </p>
        <p className={clsx('min-h-[38px] rounded-lg border border-line bg-surface-muted px-3 py-2 text-sm', error && 'border-red-300')}>
          {display}
        </p>
        {error && <p className="error-text">{error}</p>}
      </div>
    );
  }

  const widget = () => {
    switch (field.field_type) {
      case 'textarea':
      case 'rich_text':
        return (
          <Textarea
            {...common}
            rows={4}
            value={String(value ?? '')}
            placeholder={field.placeholder ?? undefined}
            onChange={(event) => onChange(event.target.value)}
          />
        );
      case 'number':
      case 'decimal':
      case 'currency':
      case 'rating':
        if (field.field_type === 'rating') {
          return (
            <div>
              <p className="label">{label}{state.required && <span className="ml-0.5 text-red-500">*</span>}</p>
              <Rating
                value={Number(value ?? 0)}
                max={Number(field.validation_json?.max ?? 5)}
                onChange={(next) => onChange(next)}
                readOnly={disabled}
                showValue
              />
              {error && <p className="error-text">{error}</p>}
            </div>
          );
        }
        return (
          <Input
            {...common}
            type="number"
            step={field.field_type === 'number' ? '1' : 'any'}
            value={value === null || value === undefined ? '' : String(value)}
            placeholder={field.placeholder ?? undefined}
            min={field.min_value ?? undefined}
            max={field.max_value ?? undefined}
            onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))}
          />
        );
      case 'formula':
      case 'auto_number': {
        // A calculated field may carry options so its number reads as a word (a grade of 3 shows as "Green").
        const matched = field.field_type === 'formula' && value !== null && value !== undefined
          ? field.options.find((option) => String(option.option_key) === String(value))
          : undefined;
        const tone = matched
          ? /^(green|compliant|pass|within)/i.test(matched.option_label) ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
            : /^(red|black|fail|over|critical)/i.test(matched.option_label) ? 'border-red-300 bg-red-50 text-red-800'
              : /^(yellow|amber|warn|near)/i.test(matched.option_label) ? 'border-amber-300 bg-amber-50 text-amber-800' : null
          : null;
        return (
          <div>
            <p className="label">{label}</p>
            <p className={`rounded-lg border px-3 py-2 text-sm font-medium ${tone ?? 'border-dashed border-line bg-surface-muted'}`}>
              {field.field_type === 'auto_number'
                ? (value ? String(value) : 'Issued on submit')
                : (value === null || value === undefined ? 'Calculated automatically' : matched ? matched.option_label : String(value))}
            </p>
          </div>
        );
      }
      case 'date':
        return <DatePicker {...common} value={String(value ?? '')} onChange={(next) => onChange(next)} />;
      case 'time':
        return <TimePicker {...common} value={String(value ?? '')} onChange={(next) => onChange(next)} />;
      case 'datetime':
        return (
          <div className={spanClass}>
            <DatePicker
              label={label}
              required={state.required}
              error={error}
              disabled={disabled}
              value={value ? String(value).slice(0, 10) : ''}
              onChange={(next) => onChange(`${next} ${String(value ?? '00:00:00').slice(11, 19) || '00:00:00'}`.trim())}
            />
            <div className="mt-2">
              <TimePicker
                value={value ? String(value).slice(11, 16) : ''}
                onChange={(next) => onChange(`${String(value ?? new Date().toISOString().slice(0, 10)).slice(0, 10)} ${next}:00`)}
                disabled={disabled}
              />
            </div>
          </div>
        );
      case 'select':
        return <Select {...common} searchable value={value === null || value === undefined ? '' : String(value)} options={options} onChange={onChange} />;
      case 'radio':
        return (
          <div className={spanClass}>
            <p className="label">{label}{state.required && <span className="ml-0.5 text-red-500">*</span>}</p>
            <div className="space-y-2">
              {(field.options ?? []).map((option) => (
                <label key={String(option.option_key)} className={clsx(
                  'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors',
                  String(value) === String(option.option_key) ? 'border-brand-500 bg-brand-50' : 'border-line hover:bg-surface-muted'
                )}>
                  <input
                    type="radio"
                    name={field.field_key}
                    className="h-4 w-4 text-brand-500"
                    checked={String(value) === String(option.option_key)}
                    disabled={disabled}
                    onChange={() => onChange(String(option.option_key))}
                  />
                  <span>{String(option.option_label)}</span>
                  {option.score !== null && option.score !== undefined && <Badge tone="violet" className="ml-auto">{String(option.score)}</Badge>}
                </label>
              ))}
            </div>
            {field.help_text && <p className="helper-text">{field.help_text}</p>}
            {error && <p className="error-text">{error}</p>}
          </div>
        );
      case 'multi_select':
        return (
          <div className={spanClass}>
            <MultiSelect
              label={label}
              values={(Array.isArray(value) ? value : []).map(String)}
              options={options}
              onChange={onChange}
              error={error}
              helper={field.help_text ?? undefined}
            />
            {state.required && (value === null || value === undefined || (Array.isArray(value) && value.length === 0)) && (
              <p className="helper-text">At least one option is required.</p>
            )}
          </div>
        );
      case 'checkbox': {
        const checkboxOptions = field.options ?? [];
        if (checkboxOptions.length === 0) {
          return (
            <div className={spanClass}>
              <Checkbox label={label} checked={Boolean(value)} onChange={onChange} disabled={disabled} />
              {error && <p className="error-text">{error}</p>}
            </div>
          );
        }
        const selected = Array.isArray(value) ? value.map(String) : [];
        return (
          <div className={spanClass}>
            <p className="label">{label}{state.required && <span className="ml-0.5 text-red-500">*</span>}</p>
            <div className="space-y-1.5">
              {checkboxOptions.map((option) => (
                <Checkbox
                  key={String(option.option_key)}
                  label={option.score !== null && option.score !== undefined
                    ? `${String(option.option_label)} (${String(option.score)} marks)`
                    : String(option.option_label)}
                  checked={selected.includes(String(option.option_key))}
                  disabled={disabled}
                  onChange={(checked) => onChange(checked
                    ? [...selected, String(option.option_key)]
                    : selected.filter((entry) => entry !== String(option.option_key)))}
                />
              ))}
            </div>
            {error && <p className="error-text">{error}</p>}
          </div>
        );
      }
      case 'switch':
        return (
          <div className={spanClass}>
            <Switch label={label} checked={Boolean(value)} onChange={onChange} disabled={disabled} />
            {field.help_text && <p className="helper-text">{field.help_text}</p>}
            {error && <p className="error-text">{error}</p>}
          </div>
        );
      case 'signature':
        return (
          <div className={spanClass}>
            <SignaturePad
              label={label}
              value={typeof value === 'string' && String(value).startsWith('data:') ? String(value) : undefined}
              disabled={disabled}
              error={error}
              helper={field.help_text ?? 'Draw with a mouse, stylus or finger.'}
              onChange={async (dataUrl) => {
                // Persist the drawing as a real vault file so the PDF and the audit
                // trail both point at something that can be downloaded later.
                onChange(dataUrl);
                if (mode !== 'fill') return;
                try {
                  const blob = await (await fetch(dataUrl)).blob();
                  const formData = new FormData();
                  formData.append('files', new File([blob], `signature-${field.field_key}.png`, { type: 'image/png' }));
                  formData.append('entityType', 'SUBMISSION');
                  if (submissionId) formData.append('entityId', String(submissionId));
                  formData.append('category', 'signature');
                  const response = await fetch('/api/files/upload', {
                    method: 'POST',
                    headers: { 'X-CSRF-Token': getCsrfToken() },
                    body: formData,
                  });
                  const payload = await response.json() as { files?: UploadedFileMeta[] };
                  if (payload.files?.[0]) onChange(payload.files[0].id);
                } catch {
                  /* the canvas still holds the drawing; the draft save retries */
                }
              }}
            />
          </div>
        );
      case 'file':
      case 'image':
      case 'multi_file': {
        const multiple = field.field_type === 'multi_file';
        const list = multiple
          ? (Array.isArray(value) ? value : []).map(Number)
          : value ? [Number(value)] : [];
        return (
          <div className={spanClass}>
            <FileUpload
              label={label}
              multiple={multiple}
              accept={field.field_type === 'image' ? 'image/*' : undefined}
              entityType="SUBMISSION"
              entityId={submissionId}
              category={field.field_key}
              onUploaded={(files) => onChange(multiple ? [...list, ...files.map((file) => file.id)] : files[0]?.id)}
              helper={field.help_text ?? undefined}
              required={state.required}
            />
            {list.length > 0 && (
              <p className="mt-1 text-xs text-ink-muted">{list.length} file(s) attached — download from the submission record.</p>
            )}
            {error && <p className="error-text">{error}</p>}
          </div>
        );
      }
      case 'table':
        return null; // rendered by TableWidget
      default:
        return (
          <Input
            {...common}
            type={field.field_type === 'email' ? 'email' : field.field_type === 'phone' ? 'tel' : field.field_type === 'url' ? 'url' : field.field_type === 'password' ? 'password' : 'text'}
            value={String(value ?? '')}
            placeholder={field.placeholder ?? undefined}
            minLength={field.min_length ?? undefined}
            maxLength={field.max_length ?? undefined}
            onChange={(event) => onChange(event.target.value)}
          />
        );
    }
  };

  return <div className={spanClass}>{widget()}</div>;
}

/* ══════════════════════════════ table widget ═══════════════════════════════ */

function TableWidget({
  table, rows, totals, editable, mode, errors, onChange, onAddRow, onRemoveRow,
}: {
  table: RendererTable;
  rows: Record<string, unknown>[];
  totals: Record<string, number>;
  editable: boolean;
  mode: 'fill' | 'view' | 'preview';
  errors: string[];
  onChange: (rowIndex: number, columnKey: string, value: unknown) => void;
  onAddRow: () => void;
  onRemoveRow: (rowIndex: number) => void;
}) {
  const readOnly = mode === 'view' || !editable;
  const canAdd = !readOnly && (table.max_rows === null || rows.length < table.max_rows);
  return (
    <div className="rounded-lg border border-line">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface-muted px-3 py-2">
        <div>
          <p className="text-sm font-medium text-ink">{table.table_name}</p>
          {table.description && <p className="text-xs text-ink-muted">{table.description}</p>}
        </div>
        {canAdd && <Button size="sm" variant="outline" onClick={onAddRow}>+ Add row</Button>}
      </div>
      <div className="overflow-x-auto">
        <table className="table-base min-w-full">
          <thead>
            <tr>
              {table.show_row_numbers && <th className="table-head w-[50px]">#</th>}
              {table.columns.map((column: RendererTable['columns'][number]) => (
                <th key={column.column_key} className="table-head" style={{ width: column.width_pct ? `${column.width_pct}%` : undefined }}>
                  {column.column_label}
                  {column.is_required && <span className="ml-0.5 text-red-500">*</span>}
                </th>
              ))}
              {!readOnly && <th className="table-head w-[70px] text-right">·</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="bg-white">
                {table.show_row_numbers && <td className="table-cell text-ink-muted">{rowIndex + 1}</td>}
                {table.columns.map((column: RendererTable['columns'][number]) => {
                  const cellValue = row[column.column_key];
                  if (readOnly) {
                    const display = Array.isArray(cellValue)
                      ? cellValue.join(', ')
                      : cellValue === null || cellValue === undefined || cellValue === ''
                        ? '—'
                        : column.column_type === 'checkbox'
                          ? (cellValue ? 'Yes' : 'No')
                          : column.column_type === 'currency'
                            ? formatCurrency(Number(cellValue))
                            : String(cellValue);
                    return <td key={column.column_key} className="table-cell">{display}</td>;
                  }
                  if (column.column_type === 'formula') {
                    const rowContext: Record<string, number> = {};
                    for (const entry of table.columns) {
                      const num = Number(row[entry.column_key]);
                      if (Number.isFinite(num)) rowContext[entry.column_key] = num;
                    }
                    const result = column.formula_expression ? evaluateFormula(column.formula_expression, rowContext) : null;
                    return (
                      <td key={column.column_key} className="table-cell font-medium">
                        {result === null ? '—' : result}
                      </td>
                    );
                  }
                  if (column.column_type === 'checkbox') {
                    return (
                      <td key={column.column_key} className="table-cell text-center">
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={Boolean(cellValue)}
                          disabled={!column.is_editable}
                          onChange={(event) => onChange(rowIndex, column.column_key, event.target.checked)}
                        />
                      </td>
                    );
                  }
                  if (['select', 'multi_select'].includes(column.column_type)) {
                    return (
                      <td key={column.column_key} className="table-cell">
                        {column.column_type === 'multi_select' ? (
                          <MultiSelect
                            values={(Array.isArray(cellValue) ? cellValue : []).map(String)}
                            options={(column.options ?? []).map((option) => ({ value: String(option.option_key), label: String(option.option_label) }))}
                            onChange={(next) => onChange(rowIndex, column.column_key, next)}
                          />
                        ) : (
                          <Select
                            value={cellValue === null || cellValue === undefined ? '' : String(cellValue)}
                            options={(column.options ?? []).map((option) => ({ value: String(option.option_key), label: String(option.option_label) }))}
                            onChange={(next) => onChange(rowIndex, column.column_key, next)}
                            disabled={!column.is_editable}
                            size="sm"
                          />
                        )}
                      </td>
                    );
                  }
                  if (['number', 'decimal', 'currency'].includes(column.column_type)) {
                    return (
                      <td key={column.column_key} className="table-cell">
                        <Input
                          type="number"
                          step="any"
                          value={cellValue === null || cellValue === undefined ? '' : String(cellValue)}
                          disabled={!column.is_editable}
                          onChange={(event) => onChange(rowIndex, column.column_key, event.target.value === '' ? null : Number(event.target.value))}
                          className="w-28"
                        />
                      </td>
                    );
                  }
                  if (column.column_type === 'date') {
                    return (
                      <td key={column.column_key} className="table-cell">
                        <DatePicker value={cellValue ? String(cellValue) : ''} onChange={(next) => onChange(rowIndex, column.column_key, next)} />
                      </td>
                    );
                  }
                  if (column.column_type === 'textarea') {
                    return (
                      <td key={column.column_key} className="table-cell min-w-[220px]">
                        <Textarea
                          rows={1}
                          value={cellValue === null || cellValue === undefined ? '' : String(cellValue)}
                          disabled={!column.is_editable}
                          onChange={(event) => onChange(rowIndex, column.column_key, event.target.value)}
                        />
                      </td>
                    );
                  }
                  return (
                    <td key={column.column_key} className="table-cell">
                      <Input
                        value={cellValue === null || cellValue === undefined ? '' : String(cellValue)}
                        disabled={!column.is_editable}
                        onChange={(event) => onChange(rowIndex, column.column_key, event.target.value)}
                      />
                    </td>
                  );
                })}
                {!readOnly && (
                  <td className="table-cell text-right">
                    <Button size="sm" variant="ghost" onClick={() => onRemoveRow(rowIndex)} disabled={rows.length <= table.min_rows}>
                      ✕
                    </Button>
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="table-cell text-center text-ink-muted" colSpan={table.columns.length + (table.show_row_numbers ? 1 : 0) + (readOnly ? 0 : 1)}>
                  No rows yet{table.min_rows > 0 ? ` — at least ${table.min_rows} required` : ''}.
                </td>
              </tr>
            )}
          </tbody>
          {table.show_totals && Object.keys(totals).length > 0 && (
            <tfoot>
              <tr className="bg-surface-muted font-semibold">
                {table.show_row_numbers && <td className="table-cell" />}
                {table.columns.map((column, index) => (
                  <td key={column.column_key} className="table-cell">
                    {index === 0 ? 'Total' : totals[column.column_key] !== undefined ? totals[column.column_key] : ''}
                  </td>
                ))}
                {!readOnly && <td className="table-cell" />}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {errors.length > 0 && (
        <div className="border-t border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {errors.map((message, index) => <p key={index}>• {message}</p>)}
        </div>
      )}
    </div>
  );
}

export { evaluateConditions, isMultiValue, computeScore };
