/**
 * Dynamic module engine — the filling-in side.
 *
 * One submission is one filled form: started as a draft, resumed, saved (with
 * every rule re-run server-side), submitted, reviewed and — once approved —
 * frozen. The same service backs the auditor workspace, the employer panel and
 * the employee self-service screens; which records a caller may touch is decided
 * here by `assertSubmissionAccess`, never by the UI.
 *
 * What happens on submit:
 *   1. the structure is re-read, the answers are re-validated (required fields,
 *      ranges, patterns, options, table rows, signature) and unique fields are
 *      checked against every other submission of the form;
 *   2. the score is recomputed from option scores / `max_score` / table columns;
 *   3. a submission number is issued (`auto_number_prefix`, else `SUB/YYYY/NNNNNN`);
 *   4. the PDF is rendered and attached to the file vault as a new version;
 *   5. the status moves to `submitted` (or `under_review` when the module needs
 *      verification) and the administrators, verifier and employer are notified.
 */
import { query, queryOne, type RowDataPacket } from '@/lib/db/mysql';
import { newUuid, nextDocumentNumber } from '@/lib/utils/report-number';
import { writeActivityLog } from '@/lib/logger/activity-log';
import { notifyMany, notifyUser, usersWithRole } from '@/lib/notifications/notification-service';
import { attachGeneratedFile } from '@/lib/files/file-service';
import { generateSubmissionPdf } from '@/lib/pdf/submission-pdf';
import { formatDate } from '@/lib/utils/dates';
import * as moduleRepo from '@/repositories/dynamic-module.repository';
import * as repo from '@/repositories/dynamic-submission.repository';
import { filterObject, toFormStructure } from '@/services/dynamic-module.service';
import {
  applyFormulaFields, applyTableFormulas, computeScore, defaultValues, fieldOptions, formulaContextFor, tableTotals, validateSubmission,
  type FormStructure, type StructureField, type TableRowMap, type ValueMap,
} from '@/services/dynamic-form-rules';
import {
  submissionListQuerySchema, submissionReviewSchema, submissionSaveSchema, submissionStartSchema,
  submissionSubmitSchema, type SubmissionReviewPayload,
} from '@/lib/validations/dynamic-module.validation';

/** Every route builds its actor through this, so activity logs and file rows agree. */
export function actorFromUser(user: { id: number; fullName?: string; primaryRole?: string }, request?: Request): SubmissionActor {
  return {
    id: user.id,
    name: user.fullName ?? null,
    role: user.primaryRole ?? null,
    ip: request ? (request.headers.get('x-forwarded-for') ?? null) : null,
    userAgent: request ? request.headers.get('user-agent') : null,
  };
}

/** MySQL DATETIME ("YYYY-MM-DD HH:MM:SS") — `formatDateTime` is for display only. */
export function sqlNow(when: Date = new Date()): string {
  return when.toISOString().replace('T', ' ').slice(0, 19);
}

export interface SubmissionActor {
  id: number;
  name?: string | null;
  role?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

type ServiceError = Error & { code: string };

const forbidden = (message: string): ServiceError => Object.assign(new Error(message), { code: 'FORBIDDEN' });
const notFound = (resource = 'Submission'): ServiceError => Object.assign(new Error(`${resource} not found`), { code: 'NOT_FOUND' });
const invalidState = (message: string): ServiceError => Object.assign(new Error(message), { code: 'INVALID_STATE' });
const conflict = (code: string, message: string): ServiceError => Object.assign(new Error(message), { code });
const validationFailed = (message: string, issues: { field: string; message: string }[]): ServiceError =>
  Object.assign(new Error(message), { code: 'VALIDATION_FAILED', issues });

const ADMIN_ROLES = new Set(['admin', 'super_admin']);
const REVIEWER_ROLES = new Set(['admin', 'super_admin', 'verifier']);

function isAdmin(actor: SubmissionActor): boolean {
  return ADMIN_ROLES.has(String(actor.role ?? ''));
}
function isReviewer(actor: SubmissionActor): boolean {
  return REVIEWER_ROLES.has(String(actor.role ?? ''));
}

/* ─────────────────────────── load + access ─────────────────────────────── */

interface LoadedForm {
  form: moduleRepo.FormRow & { module_name?: string; module_status?: string };
  module: moduleRepo.ModuleRow;
  bundle: moduleRepo.StructureBundle;
  structure: FormStructure;
}

/** table id → table key, so stored rows can be re-keyed for the rule engine. */
function structureTableKeys(structure: FormStructure): Map<number, string> {
  const keys = new Map<number, string>();
  for (const dynamicTable of structure.tables) keys.set(Number(dynamicTable.id), String(dynamicTable.table_key));
  return keys;
}

async function loadForm(formId: number): Promise<LoadedForm> {
  const form = await moduleRepo.findFormById(formId);
  if (!form) throw notFound('Form');
  const module = await moduleRepo.findModuleById(Number(form.module_id));
  if (!module) throw notFound('Module');
  const bundle = await moduleRepo.getStructure(formId);
  return { form, module, bundle, structure: toFormStructure(bundle, form) };
}

/** Employees/employers/auditors can only touch their own rows; admins and verifiers see the queue. */
export async function assertSubmissionAccess(record: RowDataPacket | Record<string, unknown>, actor: SubmissionActor): Promise<void> {
  if (isReviewer(actor)) return;
  const owner = Number(record.submitted_by ?? 0);
  if (owner && owner === actor.id) return;
  const auditorId = await auditorIdFor(actor.id);
  if (auditorId && Number(record.auditor_id ?? 0) === auditorId) return;
  const employerId = await employerIdFor(actor.id);
  if (employerId && Number(record.employer_id ?? 0) === employerId) return;
  throw forbidden('This submission belongs to somebody else');
}

export async function auditorIdFor(userId: number): Promise<number | null> {
  const row = await queryOne<RowDataPacket>('SELECT id FROM auditors WHERE user_id = ? AND deleted_at IS NULL LIMIT 1', [userId]);
  return row ? Number(row.id) : null;
}

export async function employerIdFor(userId: number): Promise<number | null> {
  const row = await queryOne<RowDataPacket>('SELECT employer_id FROM employer_users WHERE user_id = ? LIMIT 1', [userId]);
  return row ? Number(row.employer_id) : null;
}

async function employeeContextFor(userId: number) {
  const row = await queryOne<RowDataPacket>(
    `SELECT id, employee_number, employer_id, unit_id, department_id, name
     FROM employees WHERE user_id = ? AND deleted_at IS NULL LIMIT 1`,
    [userId]
  );
  return row ?? null;
}

/** Builds the scope a register query should use for this caller. */
export async function scopeFor(actor: SubmissionActor): Promise<repo.SubmissionScope> {
  if (isReviewer(actor)) return {};
  const employerId = await employerIdFor(actor.id);
  if (employerId) return { employerId };
  const auditorId = await auditorIdFor(actor.id);
  if (auditorId) return { auditorId };
  return { submittedBy: actor.id };
}

/* ─────────────────────────────── register ──────────────────────────────── */

export async function listSubmissions(actor: SubmissionActor, rawFilters: unknown) {
  const filters = submissionListQuerySchema.parse(filterObject(rawFilters));
  const scope = await scopeFor(actor);
  const [result, stats] = await Promise.all([
    repo.listSubmissions(filters, scope),
    repo.submissionStats(scope, { module_id: filters.module_id, form_id: filters.form_id, module_type: filters.module_type }),
  ]);
  return { ...result, stats, scope: isReviewer(actor) ? 'all' : 'own' };
}

export async function submissionOptions(actor: SubmissionActor) {
  const scope = await scopeFor(actor);
  const [modules, forms, statuses, stats] = await Promise.all([
    moduleRepo.moduleOptions(),
    moduleRepo.listForms({ page: 1, limit: 200 }),
    Promise.resolve(['draft', 'submitted', 'under_review', 'approved', 'rejected', 'changes_requested', 'archived']),
    repo.submissionStats(scope),
  ]);
  void query;
  return {
    modules,
    forms: forms.data.map((form) => ({ value: Number(form.id), label: String(form.name), hint: String(form.module_name ?? '') })),
    statuses,
    stats,
  };
}

/* ──────────────────────────────── start ────────────────────────────────── */

/** Opens a submission (or hands back the draft the caller already had). */
export async function startSubmission(rawPayload: unknown, actor: SubmissionActor) {
  const input = submissionStartSchema.parse(rawPayload);
  const { form, module, bundle, structure } = await loadForm(input.form_id);

  if (!isAdmin(actor) && String(form.status) !== 'published') {
    throw invalidState('This form is not published yet');
  }

  const access = await moduleRepo.moduleAccessFor(Number(module.id), actor.id, actor.role ?? null);
  if (!isReviewer(actor) && (!access || !access.can_create)) {
    throw forbidden('This module has not been assigned to you');
  }

  const existing = await repo.findOpenDraft(actor.id, Number(form.id), input.assignment_id ?? null);
  if (existing) {
    return { submissionId: Number(existing.id), submissionNumber: String(existing.submission_number), resumed: true, form, module };
  }

  const context = await resolveContext(actor, input);
  const prefix = form.auto_number_prefix ? String(form.auto_number_prefix) : null;
  const submissionNumber = prefix
    ? await nextPrefixedNumber(prefix)
    : await nextDocumentNumber('submission');

  const submissionId = await repo.createSubmission({
    uuid: newUuid(),
    submission_number: submissionNumber,
    module_id: Number(module.id),
    form_id: Number(form.id),
    assignment_id: context.assignmentId,
    employer_id: context.employerId,
    unit_id: context.unitId,
    department_id: context.departmentId,
    submitted_by: actor.id,
    auditor_id: context.auditorId,
    title: input.title ?? `${form.name}${context.employerName ? ` — ${context.employerName}` : ''}`,
    status: 'draft',
    period_from: input.period_from ?? null,
    period_to: input.period_to ?? null,
    remarks: null,
  });

  const defaults = defaultValues(structure);
  await persistAnswers(submissionId, Number(form.id), structure, defaults, {});

  await log(actor, 'created', submissionId, `Submission ${submissionNumber} started on ${form.name}`, {
    moduleId: Number(module.id), formId: Number(form.id), assignmentId: context.assignmentId,
    recordCount: bundle.fields.length,
  });

  return { submissionId, submissionNumber, resumed: false, form, module, defaults };
}

async function nextPrefixedNumber(prefix: string): Promise<string> {
  const year = new Date().getFullYear();
  const row = await queryOne<RowDataPacket>(
    'SELECT COUNT(*) AS used FROM dynamic_form_submissions WHERE submission_number LIKE ?',
    [`${prefix}/%`]
  );
  const next = Number(row?.used ?? 0) + 1;
  return `${prefix}/${year}/${String(next).padStart(6, '0')}`;
}

/**
 * Works out what the submission hangs off: an assignment (auditor), an employer
 * (employer admin), an employee (self-service) or nothing (admin test run).
 */
async function resolveContext(actor: SubmissionActor, input: { assignment_id?: number | null; employer_id?: number | null; unit_id?: number | null; department_id?: number | null; auditor_id?: number | null }) {
  let assignmentId = input.assignment_id ?? null;
  let employerId = input.employer_id ?? null;
  let unitId = input.unit_id ?? null;
  let departmentId = input.department_id ?? null;

  let auditorId = input.auditor_id ?? (await auditorIdFor(actor.id));

  if (assignmentId) {
    const assignment = await queryOne<RowDataPacket>(
      'SELECT id, employer_id, unit_id, department_id, auditor_id FROM audit_assignments WHERE id = ? AND deleted_at IS NULL',
      [assignmentId]
    );
    if (!assignment) throw notFound('Audit assignment');
    const assignmentAuditor = Number(assignment.auditor_id);
    if (!isAdmin(actor) && auditorId && assignmentAuditor !== auditorId) {
      throw forbidden('This audit is assigned to another auditor');
    }
    employerId = employerId ?? Number(assignment.employer_id);
    unitId = unitId ?? (assignment.unit_id ? Number(assignment.unit_id) : null);
    departmentId = departmentId ?? (assignment.department_id ? Number(assignment.department_id) : null);
    auditorId = auditorId ?? assignmentAuditor;
  }

  const employerFromLogin = await employerIdFor(actor.id);
  if (!employerId && employerFromLogin) employerId = employerFromLogin;

  const employee = await employeeContextFor(actor.id);
  if (employee) {
    employerId = employerId ?? Number(employee.employer_id);
    unitId = unitId ?? (employee.unit_id ? Number(employee.unit_id) : null);
    departmentId = departmentId ?? (employee.department_id ? Number(employee.department_id) : null);
  }

  let employerName: string | null = null;
  if (employerId) {
    const employer = await queryOne<RowDataPacket>('SELECT company_name FROM employers WHERE id = ?', [employerId]);
    employerName = employer ? String(employer.company_name) : null;
  }

  return { assignmentId, employerId, unitId, departmentId, auditorId, employerName };
}

/* ────────────────────────────── workspace ──────────────────────────────── */

export interface SubmissionWorkspace {
  submission: Record<string, unknown>;
  form: Record<string, unknown>;
  module: Record<string, unknown>;
  structure: ReturnType<typeof renderableStructure>;
  values: ValueMap;
  tableRows: TableRowMap;
  tableTotals: Record<string, Record<string, number>>;
  permissions: { canEdit: boolean; canSubmit: boolean; canReview: boolean; canDelete: boolean };
  files: RowDataPacket[];
}

function renderableStructure(structure: FormStructure) {
  return {
    layoutColumns: structure.layoutColumns,
    requiresSignature: structure.requiresSignature,
    requiresAttachments: structure.requiresAttachments,
    sections: structure.sections.map((section) => ({
      id: Number(section.id),
      title: section.title,
      description: section.description,
      section_code: section.section_code,
      layout_columns: Number(section.layout_columns),
      is_collapsible: Boolean(section.is_collapsible),
      is_collapsed: Boolean(section.is_collapsed),
      sort_order: Number(section.sort_order),
      fields: section.fields.map((field) => renderableField(field)),
      tables: section.tables.map((dynamicTable) => ({
        id: Number(dynamicTable.id),
        table_key: dynamicTable.table_key,
        table_name: dynamicTable.table_name,
        description: dynamicTable.description,
        is_repeatable: Boolean(dynamicTable.is_repeatable),
        min_rows: Number(dynamicTable.min_rows),
        max_rows: dynamicTable.max_rows === null ? null : Number(dynamicTable.max_rows),
        show_row_numbers: Boolean(dynamicTable.show_row_numbers),
        show_totals: Boolean(dynamicTable.show_totals),
        columns: dynamicTable.columns.map((column) => ({
          id: Number(column.id),
          column_key: column.column_key,
          column_label: column.column_label,
          column_label_ta: column.column_label_ta,
          column_type: column.column_type,
          options: parseOptions(column.options_json),
          formula_expression: column.formula_expression,
          default_value: column.default_value,
          is_required: Boolean(column.is_required),
          is_editable: Boolean(column.is_editable),
          is_total: Boolean(column.is_total),
          validation_json: (column.validation_json && typeof column.validation_json === 'object')
            ? (column.validation_json as Record<string, unknown>)
            : parseObject(column.validation_json),
        })),
      })),
    })),
  };
}

function renderableField(field: StructureField) {
  return {
    id: Number(field.id),
    section_id: Number(field.section_id),
    field_key: field.field_key,
    label: field.label,
    label_ta: field.label_ta,
    field_type: field.field_type,
    placeholder: field.placeholder,
    help_text: field.help_text,
    default_value: field.default_value,
    options: fieldOptions(field),
    validation_json: (field.validation_json && typeof field.validation_json === 'object')
      ? (field.validation_json as Record<string, unknown>)
      : parseObject(field.validation_json),
    conditional_json: (field.conditional_json && typeof field.conditional_json === 'object')
      ? (field.conditional_json as unknown as Record<string, unknown>)
      : parseObject(field.conditional_json),
    table_definition_id: field.table_definition_id,
    formula_expression: field.formula_expression,
    is_required: Boolean(field.is_required),
    is_readonly: Boolean(field.is_readonly),
    is_unique: Boolean(field.is_unique),
    column_width: Number(field.column_width ?? 12),
    min_value: field.min_value === null ? null : Number(field.min_value),
    max_value: field.max_value === null ? null : Number(field.max_value),
    min_length: field.min_length,
    max_length: field.max_length,
    regex_pattern: field.regex_pattern,
  };
}

function parseOptions(value: unknown) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseObject(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === 'object') return value as Record<string, unknown>;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function submissionWorkspace(submissionId: number, actor: SubmissionActor): Promise<SubmissionWorkspace> {
  const record = await repo.findSubmissionById(submissionId);
  if (!record) throw notFound();
  await assertSubmissionAccess(record, actor);

  const loaded = await loadForm(Number(record.form_id));
  const [values, tableRows, files] = await Promise.all([
    repo.readValues(submissionId),
    repo.readTableRows(submissionId),
    submissionFiles(submissionId),
  ]);

  const tableKeys = new Map<number, string>();
  for (const dynamicTable of loaded.structure.tables) tableKeys.set(Number(dynamicTable.id), String(dynamicTable.table_key));
  const rowMap = repo.tableRowsToMap(tableRows, tableKeys);
  const valueMap = repo.valuesToMap(values);

  const totals: Record<string, Record<string, number>> = {};
  for (const dynamicTable of loaded.structure.tables) {
    totals[String(dynamicTable.table_key)] = tableTotals(dynamicTable, rowMap[String(dynamicTable.table_key)] ?? []);
  }

  const editable = ['draft', 'changes_requested'].includes(String(record.status))
    && (Number(record.submitted_by) === actor.id || isAdmin(actor));
  const canReview = isReviewer(actor)
    && Boolean(record.requires_verification !== 0)
    && ['submitted', 'under_review', 'changes_requested'].includes(String(record.status));

  return {
    submission: record as unknown as Record<string, unknown>,
    form: loaded.form as unknown as Record<string, unknown>,
    module: { ...loaded.module, module_name: loaded.module.name } as unknown as Record<string, unknown>,
    structure: renderableStructure(loaded.structure),
    values: valueMap,
    tableRows: rowMap,
    tableTotals: totals,
    permissions: {
      canEdit: editable,
      canSubmit: editable,
      canReview,
      canDelete: (Number(record.submitted_by) === actor.id && String(record.status) === 'draft') || isAdmin(actor),
    },
    files,
  };
}

async function submissionFiles(submissionId: number): Promise<RowDataPacket[]> {
  const values = await repo.readValues(submissionId);
  const ids = new Set<number>();
  for (const value of values) {
    if (value.file_id) ids.add(Number(value.file_id));
    if (value.value_json && String(value.value_json).startsWith('[')) {
      try {
        for (const id of JSON.parse(String(value.value_json)) as unknown[]) {
          const num = Number(id);
          if (Number.isInteger(num)) ids.add(num);
        }
      } catch {
        /* the answer was not a file list */
      }
    }
  }
  if (ids.size === 0) return [];
  const list = [...ids];
  return query<RowDataPacket>(
    `SELECT id, original_name, mime_type, size_bytes, version, created_at FROM files
     WHERE id IN (${list.map(() => '?').join(', ')}) AND deleted_at IS NULL ORDER BY id ASC`,
    list
  );
}

/* ─────────────────────────────── saving ────────────────────────────────── */

interface SaveOutcome {
  submissionId: number;
  status: string;
  score: { obtained: number; max: number; percentage: number | null };
  issues: { field: string; message: string }[];
  filled: number;
  requiredMissing: number;
}

/** Turns the client's `{ values, table_rows }` into validated, persistable answers. */
async function prepareAnswers(
  submissionId: number,
  structure: FormStructure,
  values: ValueMap,
  tableRows: TableRowMap,
  options: { partial: boolean }
) {
  const issues = validateSubmission(structure, values, tableRows, { partial: options.partial });
  const withFormulas = applyFormulaFields(structure, values, tableRows);

  // Unique fields are checked against every other submission of this form.
  if (!options.partial) {
    for (const field of structure.fields) {
      if (!field.is_unique || options.partial) continue;
      const value = withFormulas[field.field_key];
      if (value === null || value === undefined || value === '') continue;
      const clash = await repo.findValueByFieldKey(String(field.field_key), Number(field.form_id), String(value), submissionId);
      if (clash) issues.push({ field: String(field.field_key), message: `${field.label} "${value}" is already used by submission #${clash}` });
    }
  }

  return { issues, values: withFormulas, score: computeScore(structure, withFormulas, tableRows) };
}

async function persistAnswers(submissionId: number, formId: number, structure: FormStructure, values: ValueMap, tableRows: TableRowMap) {
  const records = structure.fields
    .filter((field) => !['heading', 'paragraph', 'divider', 'table'].includes(String(field.field_type)))
    .map((field) => ({
      field_id: Number(field.id),
      section_id: Number(field.section_id),
      field_key: String(field.field_key),
      field_type: String(field.field_type),
      value: values[field.field_key] ?? null,
    }));
  await repo.replaceValues(submissionId, formId, records);

  const rowRecords: { table_id: number; row_index: number; row_data: Record<string, unknown> }[] = [];
  for (const dynamicTable of structure.tables) {
    const rows = tableRows[String(dynamicTable.table_key)] ?? [];
    rows.forEach((row, index) => {
      rowRecords.push({ table_id: Number(dynamicTable.id), row_index: index, row_data: row });
    });
  }
  await repo.replaceTableRows(submissionId, rowRecords);
}

export async function saveDraft(submissionId: number, rawPayload: unknown, actor: SubmissionActor, options: { submit?: boolean } = {}): Promise<SaveOutcome> {
  const payload = options.submit ? submissionSubmitSchema.parse(rawPayload) : submissionSaveSchema.parse(rawPayload);
  const record = await repo.findSubmissionById(submissionId);
  if (!record) throw notFound();
  await assertSubmissionAccess(record, actor);

  const isOwner = Number(record.submitted_by) === actor.id;
  if (!isOwner && !isAdmin(actor)) throw forbidden('Only the person who started this submission can edit it');
  if (String(record.status) === 'approved') {
    throw invalidState('This submission is approved and can no longer be edited');
  }
  if (String(record.status) === 'archived') {
    throw invalidState('This submission has been archived');
  }
  if (!options.submit && ['submitted', 'under_review'].includes(String(record.status))) {
    throw invalidState('This submission is with the reviewer — it can only be edited after it is returned');
  }

  const loaded = await loadForm(Number(record.form_id));
  if (!options.submit && !loaded.form.allow_draft && String(record.status) === 'draft') {
    throw invalidState('This form does not allow drafts — fill it in and submit in one go');
  }

  const values = payload.values === undefined
    ? repo.valuesToMap(await repo.readValues(submissionId))
    : normaliseValues(loaded.structure, payload.values as ValueMap);
  const tableRows = payload.table_rows === undefined
    ? repo.tableRowsToMap(await repo.readTableRows(submissionId), structureTableKeys(loaded.structure))
    : applyTableFormulas(loaded.structure, normaliseTableRows(loaded.structure, payload.table_rows as TableRowMap));
  const prepared = await prepareAnswers(submissionId, loaded.structure, values, tableRows, { partial: !options.submit });

  const summaryFields = loaded.structure.fields.filter((field) => !['heading', 'paragraph', 'divider', 'table'].includes(String(field.field_type)));
  const filled = summaryFields.filter((field) => {
    const value = prepared.values[field.field_key];
    return value !== null && value !== undefined && value !== '' && !(Array.isArray(value) && value.length === 0);
  }).length;
  const requiredMissing = prepared.issues.filter((issue) => /is required/.test(issue.message)).length;

  if (options.submit && prepared.issues.length > 0) {
    throw validationFailed('Please correct the highlighted answers before submitting', prepared.issues);
  }

  await persistAnswers(submissionId, Number(record.form_id), loaded.structure, prepared.values, tableRows);
  await repo.updateSubmission(submissionId, {
    title: payload.title ?? record.title,
    remarks: payload.remarks ?? record.remarks,
    period_from: payload.period_from ?? record.period_from,
    period_to: payload.period_to ?? record.period_to,
    score_obtained: prepared.score.obtained,
    score_max: prepared.score.max,
    score_percentage: prepared.score.percentage,
    updated_by: actor.id,
    version: Number(record.version ?? 1) + (options.submit ? 1 : 0),
  });

  if (options.submit) {
    await finaliseSubmission(submissionId, loaded, prepared.values, tableRows, prepared.score, payload as { change_summary?: string | null; send_to_reviewer?: boolean }, actor, record);
  } else {
    await log(actor, 'updated', submissionId, `Draft saved on ${loaded.form.name}`, {
      filled, score: prepared.score.percentage, issues: prepared.issues.length,
    });
  }

  return {
    submissionId,
    status: options.submit ? (loaded.module.requires_verification ? 'under_review' : 'submitted') : String(record.status),
    score: prepared.score,
    issues: prepared.issues,
    filled,
    requiredMissing,
  };
}

function normaliseValues(structure: FormStructure, values: ValueMap): ValueMap {
  const known = new Set(structure.fields.map((field) => String(field.field_key)));
  const out: ValueMap = {};
  for (const [key, value] of Object.entries(values ?? {})) {
    if (!known.has(key)) continue;
    out[key] = value;
  }
  return out;
}

function normaliseTableRows(structure: FormStructure, rows: TableRowMap): TableRowMap {
  const known = new Set(structure.tables.map((dynamicTable) => String(dynamicTable.table_key)));
  const out: TableRowMap = {};
  for (const [key, value] of Object.entries(rows ?? {})) {
    if (!known.has(key) || !Array.isArray(value)) continue;
    out[key] = value as Record<string, unknown>[];
  }
  return out;
}

/** Submit → score, number, PDF, status, notifications. */
async function finaliseSubmission(
  submissionId: number,
  loaded: LoadedForm,
  values: ValueMap,
  tableRows: TableRowMap,
  score: { obtained: number; max: number; percentage: number | null },
  payload: { change_summary?: string | null; send_to_reviewer?: boolean },
  actor: SubmissionActor,
  record: repo.SubmissionRow
): Promise<void> {
  const needsVerification = Boolean(loaded.module.requires_verification);
  const status = needsVerification && payload.send_to_reviewer !== false ? 'under_review' : 'submitted';
  const now = new Date();

  await repo.setSubmissionStatus(submissionId, status, {
    submission_date: sqlNow(now),
    submitted_at: sqlNow(now),
    reviewed_by: null,
    reviewed_at: null,
    review_action: null,
    review_comments: null,
    updated_by: actor.id,
  });

  const submission = await repo.findSubmissionById(submissionId);
  if (!submission) return;

  const pdf = await generateSubmissionPdf({
    submission: { ...submission, status },
    form: loaded.form,
    module: loaded.module,
    structure: loaded.structure,
    values,
    tableRows,
    generatedByName: actor.name ?? 'System',
    generatedByRole: actor.role ?? 'user',
  });

  let pdfFileId: number | null = null;
  try {
    const file = await attachGeneratedFile({
      fileId: record.pdf_file_id ? Number(record.pdf_file_id) : null,
      entityType: 'SUBMISSION',
      entityId: submissionId,
      filename: `${submission.submission_number.replace(/\//g, '-')}-v${Number(submission.version)}.pdf`,
      mimeType: 'application/pdf',
      data: pdf,
      category: 'submission_pdf',
      changeNote: payload.change_summary ?? 'Submitted from the dynamic form',
      actor: { user: uploadActor(actor), ip: actor.ip ?? null },
    });
    pdfFileId = Number(file.id);
    await repo.updateSubmission(submissionId, { pdf_file_id: pdfFileId, pdf_generated_at: sqlNow() });
  } catch (error) {
    await log(actor, 'pdf_failed', submissionId, `PDF attachment failed: ${(error as Error).message}`, { code: (error as Error & { code?: string }).code ?? null }, 'medium');
  }

  await log(actor, 'submitted', submissionId, `Submission ${submission.submission_number} submitted`, {
    status, score: score.percentage, filled: Object.keys(values).length, changeSummary: payload.change_summary ?? null,
  });

  await notifyStakeholders(submissionId, submission, loaded, score, pdfFileId ? pdf : null, actor);
}

async function notifyStakeholders(
  submissionId: number,
  submission: repo.SubmissionRow,
  loaded: LoadedForm,
  score: { obtained: number; max: number; percentage: number | null },
  pdf: Buffer | null,
  actor: SubmissionActor
): Promise<void> {
  const employerName = submission.employer_id
    ? String((await queryOne<RowDataPacket>('SELECT company_name FROM employers WHERE id = ?', [submission.employer_id]))?.company_name ?? '')
    : '';
  const templateData = {
    recipient_name: '',
    submission_number: String(submission.submission_number),
    module_name: String(loaded.module.name),
    form_name: String(loaded.form.name),
    submitter_name: actor.name ?? '',
    employer_name: employerName,
    submitted_date: formatDate(new Date()),
    score_percentage: score.percentage === null ? '—' : String(score.percentage),
    submission_url: `/admin/dynamic-submissions/${submissionId}`,
  };
  const attachments = pdf ? [{ filename: `${String(submission.submission_number).replace(/\//g, '-')}.pdf`, content: pdf, contentType: 'application/pdf' }] : undefined;

  if (loaded.module.requires_verification) {
    const verifiers = await usersWithRole('verifier');
    if (verifiers.length) {
      await notifyMany(verifiers.filter((id) => id !== actor.id), {
        title: `Submission ${submission.submission_number} needs verification`,
        message: `${submission.title ?? loaded.form.name}${employerName ? ` (${employerName})` : ''} was submitted and is waiting for review.`,
        type: 'action_required',
        category: 'REPORT',
        actionUrl: '/verifier/submissions',
        actionLabel: 'Review submission',
        entityType: 'dynamic_submission',
        entityId: submissionId,
        channels: ['in_app', 'email'],
        templateCode: 'submission.submitted',
        templateData,
        attachments,
      });
    }
  }

  const admins = [...new Set([...(await usersWithRole('admin')), ...(await usersWithRole('super_admin'))])];
  if (admins.length) {
    await notifyMany(admins.filter((id) => id !== actor.id), {
      title: `Submission ${submission.submission_number} received`,
      message: `${submission.title ?? loaded.form.name} was submitted${employerName ? ` by ${employerName}` : ''}.`,
      type: 'info',
      category: 'REPORT',
      actionUrl: `/admin/dynamic-submissions/${submissionId}`,
      actionLabel: 'Open submission',
      entityType: 'dynamic_submission',
      entityId: submissionId,
      channels: ['in_app', 'email'],
      templateCode: 'submission.submitted',
      templateData,
      attachments,
    });
  }

  if (submission.employer_id) {
    const employerUsers = await query<RowDataPacket>('SELECT user_id FROM employer_users WHERE employer_id = ? AND user_id IS NOT NULL', [submission.employer_id]);
    const ids = employerUsers.map((row) => Number(row.user_id)).filter((id) => id && id !== actor.id);
    if (ids.length) {
      await notifyMany(ids, {
        title: `Submission ${submission.submission_number} received`,
        message: `${submission.title ?? loaded.form.name} has been submitted.`,
        type: 'success',
        category: 'REPORT',
        actionUrl: `/employer/submissions/${submissionId}`,
        actionLabel: 'View submission',
        entityType: 'dynamic_submission',
        entityId: submissionId,
        channels: ['in_app', 'email'],
        templateCode: 'submission.submitted',
        templateData: { ...templateData, submission_url: `/employer/submissions/${submissionId}` },
      });
    }
  }
}

/* ─────────────────────────────── review ────────────────────────────────── */

export async function reviewSubmission(submissionId: number, rawPayload: unknown, actor: SubmissionActor) {
  const payload: SubmissionReviewPayload = submissionReviewSchema.parse(rawPayload);
  const record = await repo.findSubmissionById(submissionId);
  if (!record) throw notFound();
  await assertSubmissionAccess(record, actor);
  if (!isReviewer(actor)) throw forbidden('Only an administrator or verifier can review a submission');
  if (Number(record.submitted_by) === actor.id) throw forbidden('You cannot review your own submission');

  const status = String(record.status);
  if (payload.action === 'start_review') {
    if (status !== 'submitted') throw invalidState('This submission is not waiting for review');
    await repo.setSubmissionStatus(submissionId, 'under_review', { reviewed_by: actor.id, reviewed_at: sqlNow(), updated_by: actor.id });
    await log(actor, 'updated', submissionId, `Review started on ${record.submission_number}`, null, 'info', 'dynamic_submission');
    return { submissionId, status: 'under_review' };
  }

  if (!['submitted', 'under_review'].includes(status)) {
    throw invalidState(`This submission is already ${status.replace(/_/g, ' ')}`);
  }

  const nextStatus = payload.action === 'approve' ? 'approved' : payload.action === 'reject' ? 'rejected' : 'changes_requested';
  const reviewAction = payload.action === 'approve' ? 'approved' : payload.action === 'reject' ? 'rejected' : 'returned';

  await repo.submissionReview(submissionId, nextStatus, {
    reviewed_by: actor.id,
    reviewed_at: sqlNow(),
    review_action: reviewAction,
    review_comments: payload.comments,
    score_obtained: payload.score_obtained ?? (record.score_obtained === null ? null : Number(record.score_obtained)),
    score_max: payload.score_max ?? (record.score_max === null ? null : Number(record.score_max)),
    updated_by: actor.id,
  });

  const scorePercent = payload.score_obtained !== null && payload.score_obtained !== undefined
    && payload.score_max !== null && payload.score_max !== undefined && Number(payload.score_max) > 0
    ? Math.round((Number(payload.score_obtained) / Number(payload.score_max)) * 10000) / 100
    : record.score_percentage === null ? null : Number(record.score_percentage);
  if (scorePercent !== null) await repo.updateSubmission(submissionId, { score_percentage: scorePercent });

  await log(actor, 'reviewed', submissionId, `Submission ${record.submission_number} ${reviewAction}`, {
    action: payload.action, comments: payload.comments, score: scorePercent,
  }, payload.action === 'approve' ? 'info' : 'medium', 'dynamic_submission');

  if (payload.notify_submitter && record.submitted_by && Number(record.submitted_by) !== actor.id) {
    const templateCode = payload.action === 'approve'
      ? 'submission.approved'
      : payload.action === 'return' ? 'submission.returned' : 'submission.rejected';
    await notifyUser({
      userId: Number(record.submitted_by),
      title: `Submission ${record.submission_number} ${nextStatus.replace(/_/g, ' ')}`,
      message: payload.comments,
      type: payload.action === 'approve' ? 'success' : 'action_required',
      category: 'REPORT',
      actionUrl: submitterUrl(record),
      actionLabel: 'Open submission',
      entityType: 'dynamic_submission',
      entityId: submissionId,
      channels: ['in_app', 'email'],
      templateCode,
      templateData: {
        submitter_name: String(record.submitted_by_name ?? ''),
        form_name: String(record.title ?? record.form_name ?? ''),
        module_name: String(record.module_name ?? ''),
        submission_number: String(record.submission_number),
        reviewer_name: actor.name ?? '',
        reviewed_date: formatDate(new Date()),
        status: nextStatus.replace(/_/g, ' '),
        score_percentage: scorePercent === null ? '—' : String(scorePercent),
        corrections_list: payload.action === 'return' ? `<p>${payload.comments}</p>` : '',
        comments: payload.comments,
        submission_url: submitterUrl(record),
      },
    });
  }

  return { submissionId, status: nextStatus, reviewAction, scorePercentage: scorePercent };
}

function submitterUrl(record: Record<string, unknown>): string {
  const role = String(record.submitter_role ?? '');
  if (role === 'employer') return `/employer/dynamic-submissions/${record.id}`;
  if (role === 'employee') return `/employee/dynamic-submissions/${record.id}`;
  if (role === 'verifier') return `/verifier/submissions/${record.id}`;
  if (role === 'auditor') return `/auditor/submissions/${record.id}`;
  return `/admin/dynamic-submissions/${record.id}`;
}

/* ────────────────────────── delete + pdf + helpers ─────────────────────── */

export async function deleteSubmission(submissionId: number, actor: SubmissionActor) {
  const record = await repo.findSubmissionById(submissionId);
  if (!record) throw notFound();
  await assertSubmissionAccess(record, actor);
  const isOwnerDraft = Number(record.submitted_by) === actor.id && String(record.status) === 'draft';
  if (!isOwnerDraft && !isAdmin(actor)) {
    throw invalidState('Only drafts can be deleted by their owner — ask an administrator');
  }
  await repo.softDeleteSubmission(submissionId);
  await log(actor, 'deleted', submissionId, `Submission ${record.submission_number} deleted`, { status: record.status });
  return { submissionId, deleted: true, submissionNumber: record.submission_number };
}

export interface SubmissionPdfResult {
  buffer: Buffer;
  filename: string;
  submissionNumber: string;
  version: number;
}

export async function submissionPdf(submissionId: number, actor: SubmissionActor): Promise<SubmissionPdfResult> {
  const record = await repo.findSubmissionById(submissionId);
  if (!record) throw notFound();
  await assertSubmissionAccess(record, actor);
  const loaded = await loadForm(Number(record.form_id));
  const [values, tableRows] = await Promise.all([repo.readValues(submissionId), repo.readTableRows(submissionId)]);
  const tableKeys = new Map<number, string>();
  for (const dynamicTable of loaded.structure.tables) tableKeys.set(Number(dynamicTable.id), String(dynamicTable.table_key));

  const buffer = await generateSubmissionPdf({
    submission: record,
    form: loaded.form,
    module: loaded.module,
    structure: loaded.structure,
    values: repo.valuesToMap(values),
    tableRows: repo.tableRowsToMap(tableRows, tableKeys),
    generatedByName: actor.name ?? 'System',
    generatedByRole: actor.role ?? 'user',
  });

  return {
    buffer,
    filename: `${String(record.submission_number).replace(/\//g, '-')}.pdf`,
    submissionNumber: String(record.submission_number),
    version: Number(record.version),
  };
}

/** Recomputes a score without saving — the builder's live preview and the admin's score panel. */
export async function previewScore(formId: number, values: ValueMap, tableRows: TableRowMap) {
  const loaded = await loadForm(formId);
  const score = computeScore(loaded.structure, values, tableRows);
  const issues = validateSubmission(loaded.structure, values, tableRows, { partial: false });
  return { score, issues, structure: renderableStructure(loaded.structure) };
}

/** Module spec for a form the caller may fill in (used by the renderer's "start" screen). */
export async function formSpec(formId: number, actor: SubmissionActor) {
  const loaded = await loadForm(formId);
  if (!isReviewer(actor)) {
    const access = await moduleRepo.moduleAccessFor(Number(loaded.module.id), actor.id, actor.role ?? null);
    if (!access || !access.can_read) throw forbidden('This module has not been assigned to you');
    if (String(loaded.form.status) !== 'published') throw invalidState('This form is not published yet');
  }
  return {
    form: loaded.form,
    module: loaded.module,
    structure: renderableStructure(loaded.structure),
    defaults: defaultValues(loaded.structure),
    existingDraftId: (await repo.findOpenDraft(actor.id, formId, null))?.id ?? null,
  };
}

export async function submissionStats(actor: SubmissionActor, filters: { module_type?: string | null } = {}) {
  const scope = await scopeFor(actor);
  return repo.submissionStats(scope, filters);
}

/** The file service wants an AuthUser; the submission actor only carries the essentials. */
function uploadActor(actor: SubmissionActor) {
  return {
    id: actor.id,
    uuid: '',
    email: '',
    username: '',
    firstName: String(actor.name ?? '').split(' ')[0] ?? '',
    lastName: String(actor.name ?? '').split(' ').slice(1).join(' '),
    fullName: actor.name ?? '',
    mobile: null,
    profilePhoto: null,
    status: 'active' as const,
    isFirstLogin: false,
    lastLoginAt: null,
    roles: [] as { id: number; name: string; slug: string }[],
    primaryRole: actor.role ?? 'user',
    permissions: [] as string[],
    dashboardPath: '/',
    employerId: null,
    auditorId: null,
    employeeId: null,
    sessionId: '',
  };
}

async function log(
  actor: SubmissionActor,
  action: string,
  submissionId: number,
  description: string,
  values: unknown,
  severity: 'info' | 'medium' | 'high' = 'info',
  entityType = 'dynamic_submission'
): Promise<void> {
  await writeActivityLog({
    userId: actor.id,
    userName: actor.name ?? null,
    userRole: actor.role ?? null,
    action,
    module: 'submission',
    entityType,
    entityId: submissionId,
    description,
    newValues: values && typeof values === 'object' ? (values as Record<string, unknown>) : null,
    ipAddress: actor.ip ?? null,
    userAgent: actor.userAgent ?? null,
    severity,
  });
}

export { conflict, forbidden, notFound, invalidState, validationFailed };
