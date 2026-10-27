/**
 * Data access for filled-in dynamic forms.
 *
 * Answers live in `dynamic_form_submission_values` — one row per field, stored in
 * the column that matches the field type (`value_number`, `value_date`,
 * `value_datetime`, `file_id`, `value_json`) with a `value_text` mirror so the
 * registers can search and sort on any answer. Table answers live in
 * `dynamic_table_rows` as one JSON document per row.
 *
 * Saves replace the whole answer set inside a transaction: a draft is always the
 * complete picture of what the user had on screen, never a delta.
 */
import { insert, query, queryOne, queryScalar, transaction, type RowDataPacket } from '@/lib/db/mysql';
import { buildSearch, paginatedQuery, type ListQuery, type SqlValue } from '@/lib/db/query-helpers';

export interface SubmissionRow extends RowDataPacket {
  id: number;
  uuid: string;
  submission_number: string;
  module_id: number;
  form_id: number;
  assignment_id: number | null;
  employer_id: number | null;
  unit_id: number | null;
  department_id: number | null;
  submitted_by: number | null;
  auditor_id: number | null;
  title: string | null;
  status: string;
  score_obtained: string | number | null;
  score_max: string | number | null;
  score_percentage: string | number | null;
  submission_date: string | null;
  submitted_at: string | null;
  period_from: string | null;
  period_to: string | null;
  remarks: string | null;
  reviewed_by: number | null;
  reviewed_at: string | null;
  review_action: string | null;
  review_comments: string | null;
  pdf_file_id: number | null;
  pdf_generated_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface SubmissionValueRow extends RowDataPacket {
  id: number;
  submission_id: number;
  form_id: number;
  section_id: number | null;
  field_id: number;
  field_key: string;
  value_text: string | null;
  value_number: string | number | null;
  value_date: string | null;
  value_datetime: string | null;
  value_json: string | null;
  file_id: number | null;
}

export interface TableRowDocument extends RowDataPacket {
  id: number;
  submission_id: number;
  table_id: number;
  row_index: number;
  row_data: string | Record<string, unknown>;
}

const SUBMISSION_COLUMNS = `s.id, s.uuid, s.submission_number, s.module_id, s.form_id, s.assignment_id,
  s.employer_id, s.unit_id, s.department_id, s.submitted_by, s.auditor_id, s.title, s.status, s.score_obtained,
  s.score_max, s.score_percentage, s.submission_date, s.submitted_at, s.period_from, s.period_to, s.remarks,
  s.reviewed_by, s.reviewed_at, s.review_action, s.review_comments, s.pdf_file_id, s.pdf_generated_at,
  s.version, s.created_at, s.updated_at`;

export interface SubmissionScope {
  submittedBy?: number;
  auditorId?: number;
  employerId?: number;
  employeeId?: number;
}

export interface SubmissionListFilters extends Record<string, unknown> {
  page?: number;
  limit?: number;
  search?: string | null;
  module_id?: number | null;
  form_id?: number | null;
  assignment_id?: number | null;
  employer_id?: number | null;
  status?: string | null;
  /** Module family: ASSESSMENT, RISK, STUDY, WORK_PERMIT, AUDIT, INSPECTION, CUSTOM. */
  module_type?: string | null;
  from_date?: string | null;
  to_date?: string | null;
  sortBy?: string | null;
  sortDir?: string | null;
}

const SORT_COLUMNS = ['created_at', 'updated_at', 'submission_number', 'status', 'submission_date', 'score_percentage'];

export async function listSubmissions(
  filters: SubmissionListFilters,
  scope: SubmissionScope = {}
): Promise<{ data: RowDataPacket[]; pagination: { total: number; page: number; limit: number; totalPages: number; from: number; to: number } }> {
  const params: SqlValue[] = [];
  let where = ' WHERE s.deleted_at IS NULL';
  where += buildSearch(filters.search, ['s.submission_number', 's.title', 'm.name', 'f.name', 'e.company_name'], params);
  if (scope.submittedBy) {
    where += ' AND s.submitted_by = ?';
    params.push(scope.submittedBy);
  }
  if (scope.auditorId) {
    where += ' AND s.auditor_id = ?';
    params.push(scope.auditorId);
  }
  if (scope.employerId) {
    where += ' AND s.employer_id = ?';
    params.push(scope.employerId);
  }
  if (scope.employeeId) {
    where += ' AND s.submitted_by = ?';
    params.push(scope.employeeId);
  }
  for (const [key, column] of [['module_id', 's.module_id'], ['form_id', 's.form_id'], ['assignment_id', 's.assignment_id'], ['employer_id', 's.employer_id']] as const) {
    const value = filters[key];
    if (value) {
      where += ` AND ${column} = ?`;
      params.push(Number(value));
    }
  }
  if (filters.status) {
    where += ' AND s.status = ?';
    params.push(String(filters.status));
  }
  if (filters.module_type) {
    where += ' AND m.module_type = ?';
    params.push(String(filters.module_type));
  }
  if (filters.from_date) {
    where += ' AND DATE(COALESCE(s.submitted_at, s.created_at)) >= ?';
    params.push(String(filters.from_date));
  }
  if (filters.to_date) {
    where += ' AND DATE(COALESCE(s.submitted_at, s.created_at)) <= ?';
    params.push(String(filters.to_date));
  }

  const joins = ` FROM dynamic_form_submissions s
    JOIN dynamic_modules m ON m.id = s.module_id
    JOIN dynamic_forms f ON f.id = s.form_id
    LEFT JOIN employers e ON e.id = s.employer_id
    LEFT JOIN company_units u ON u.id = s.unit_id
    LEFT JOIN users sub ON sub.id = s.submitted_by
    LEFT JOIN auditors aud ON aud.id = s.auditor_id`;
  const baseSql = `SELECT ${SUBMISSION_COLUMNS}, m.name AS module_name, m.module_type, f.name AS form_name,
      e.company_name, u.unit_name, CONCAT(sub.first_name, ' ', COALESCE(sub.last_name, '')) AS submitted_by_name,
      aud.name AS auditor_name,
      (SELECT COUNT(*) FROM dynamic_table_rows r WHERE r.submission_id = s.id) AS table_row_count${joins}${where}`;
  const countSql = `SELECT COUNT(*)${joins}${where}`;

  return paginatedQuery<RowDataPacket>(baseSql, countSql, params, {
    ...(filters as ListQuery),
    allowedSortColumns: SORT_COLUMNS,
    defaultSort: 'created_at',
  });
}

export interface SubmissionStats {
  total: number;
  drafts: number;
  submitted: number;
  underReview: number;
  approved: number;
  rejected: number;
  changesRequested: number;
  averageScore: number | null;
}

export async function submissionStats(
  scope: SubmissionScope = {},
  filters: { module_id?: number | null; form_id?: number | null; module_type?: string | null } = {}
): Promise<SubmissionStats> {
  const params: SqlValue[] = [];
  let where = ' WHERE s.deleted_at IS NULL';
  // The family screens report on one kind of module only, so the join is only
  // added when a family filter is actually in play.
  const join = filters.module_type ? ' JOIN dynamic_modules m ON m.id = s.module_id' : '';
  if (scope.submittedBy) {
    where += ' AND s.submitted_by = ?';
    params.push(scope.submittedBy);
  }
  if (scope.auditorId) {
    where += ' AND s.auditor_id = ?';
    params.push(scope.auditorId);
  }
  if (scope.employerId) {
    where += ' AND s.employer_id = ?';
    params.push(scope.employerId);
  }
  if (filters.module_id) {
    where += ' AND s.module_id = ?';
    params.push(Number(filters.module_id));
  }
  if (filters.form_id) {
    where += ' AND s.form_id = ?';
    params.push(Number(filters.form_id));
  }
  if (filters.module_type) {
    where += ' AND m.module_type = ?';
    params.push(String(filters.module_type));
  }
  const row = await queryOne<RowDataPacket>(
    `SELECT
       COUNT(*) AS total,
       SUM(s.status = 'draft') AS drafts,
       SUM(s.status = 'submitted') AS submitted,
       SUM(s.status = 'under_review') AS underReview,
       SUM(s.status = 'approved') AS approved,
       SUM(s.status = 'rejected') AS rejected,
       SUM(s.status = 'changes_requested') AS changesRequested,
       AVG(CASE WHEN s.score_percentage IS NOT NULL THEN s.score_percentage END) AS averageScore
     FROM dynamic_form_submissions s${join}${where}`,
    params
  );
  return {
    total: Number(row?.total ?? 0),
    drafts: Number(row?.drafts ?? 0),
    submitted: Number(row?.submitted ?? 0),
    underReview: Number(row?.underReview ?? 0),
    approved: Number(row?.approved ?? 0),
    rejected: Number(row?.rejected ?? 0),
    changesRequested: Number(row?.changesRequested ?? 0),
    averageScore: row?.averageScore === null || row?.averageScore === undefined ? null : Number(row.averageScore),
  };
}

export async function findSubmissionById(submissionId: number): Promise<(SubmissionRow & Record<string, unknown>) | null> {
  return queryOne<SubmissionRow & Record<string, unknown>>(
    `SELECT ${SUBMISSION_COLUMNS}, m.name AS module_name, m.module_type, m.requires_verification,
        m.default_tat_days, f.name AS form_name, f.requires_signature, f.requires_attachments, f.allow_draft,
        f.layout_columns, e.company_name, u.unit_name, d.department_name,
        CONCAT(sub.first_name, ' ', COALESCE(sub.last_name, '')) AS submitted_by_name, sub.email AS submitted_by_email,
        aud.name AS auditor_name,
        CONCAT(rev.first_name, ' ', COALESCE(rev.last_name, '')) AS reviewed_by_name,
        (SELECT r.slug FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = s.submitted_by ORDER BY ur.id ASC LIMIT 1) AS submitter_role
     FROM dynamic_form_submissions s
     JOIN dynamic_modules m ON m.id = s.module_id
     JOIN dynamic_forms f ON f.id = s.form_id
     LEFT JOIN employers e ON e.id = s.employer_id
     LEFT JOIN company_units u ON u.id = s.unit_id
     LEFT JOIN departments d ON d.id = s.department_id
     LEFT JOIN users sub ON sub.id = s.submitted_by
     LEFT JOIN auditors aud ON aud.id = s.auditor_id
     LEFT JOIN users rev ON rev.id = s.reviewed_by
     WHERE s.id = ? AND s.deleted_at IS NULL`,
    [submissionId]
  );
}

/** Resume support: the open draft this user already has for a form (+ assignment). */
export async function findOpenDraft(submittedBy: number, formId: number, assignmentId?: number | null): Promise<SubmissionRow | null> {
  const params: SqlValue[] = [submittedBy, formId];
  let sql = `SELECT ${SUBMISSION_COLUMNS} FROM dynamic_form_submissions s
    WHERE s.deleted_at IS NULL AND s.status = 'draft' AND s.submitted_by = ? AND s.form_id = ?`;
  if (assignmentId) {
    sql += ' AND s.assignment_id = ?';
    params.push(assignmentId);
  } else {
    sql += ' AND s.assignment_id IS NULL';
  }
  sql += ' ORDER BY s.updated_at DESC, s.id DESC LIMIT 1';
  return queryOne<SubmissionRow>(sql, params);
}

export async function createSubmission(data: Record<string, unknown>): Promise<number> {
  return insert(
    `INSERT INTO dynamic_form_submissions
      (uuid, submission_number, module_id, form_id, assignment_id, employer_id, unit_id, department_id,
       submitted_by, auditor_id, title, status, period_from, period_to, remarks, version, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    [
      data.uuid, data.submission_number, data.module_id, data.form_id, data.assignment_id ?? null,
      data.employer_id ?? null, data.unit_id ?? null, data.department_id ?? null, data.submitted_by ?? null,
      data.auditor_id ?? null, data.title ?? null, data.status ?? 'draft', data.period_from ?? null,
      data.period_to ?? null, data.remarks ?? null, data.submitted_by ?? null,
    ]
  );
}

export async function updateSubmission(submissionId: number, data: Record<string, unknown>): Promise<void> {
  const sets: string[] = [];
  const params: SqlValue[] = [];
  const assign = (column: string, value: SqlValue) => {
    sets.push(`${column} = ?`);
    params.push(value);
  };
  if ('title' in data) assign('title', (data.title as string) ?? null);
  if ('status' in data) assign('status', String(data.status));
  if ('period_from' in data) assign('period_from', (data.period_from as string) ?? null);
  if ('period_to' in data) assign('period_to', (data.period_to as string) ?? null);
  if ('remarks' in data) assign('remarks', (data.remarks as string) ?? null);
  if ('score_obtained' in data) assign('score_obtained', data.score_obtained === null ? null : Number(data.score_obtained));
  if ('score_max' in data) assign('score_max', data.score_max === null ? null : Number(data.score_max));
  if ('score_percentage' in data) assign('score_percentage', data.score_percentage === null ? null : Number(data.score_percentage));
  if ('submission_date' in data) assign('submission_date', (data.submission_date as string) ?? null);
  if ('submitted_at' in data) assign('submitted_at', (data.submitted_at as string) ?? null);
  if ('pdf_file_id' in data) assign('pdf_file_id', data.pdf_file_id === null ? null : Number(data.pdf_file_id));
  if ('pdf_generated_at' in data) assign('pdf_generated_at', (data.pdf_generated_at as string) ?? null);
  if ('reviewed_by' in data) assign('reviewed_by', data.reviewed_by === null ? null : Number(data.reviewed_by));
  if ('reviewed_at' in data) assign('reviewed_at', (data.reviewed_at as string) ?? null);
  if ('review_action' in data) assign('review_action', (data.review_action as string) ?? null);
  if ('review_comments' in data) assign('review_comments', (data.review_comments as string) ?? null);
  if ('version' in data) assign('version', Number(data.version));
  if ('updated_by' in data) assign('updated_by', data.updated_by === null ? null : Number(data.updated_by));
  if (sets.length === 0) return;
  await query(`UPDATE dynamic_form_submissions SET ${sets.join(', ')} WHERE id = ?`, [...params, submissionId]);
}

export async function setSubmissionStatus(submissionId: number, status: string, extra: Record<string, unknown> = {}): Promise<void> {
  await updateSubmission(submissionId, { ...extra, status });
}

/** Applies a reviewer's decision in one statement (status + stamp + note). */
export async function submissionReview(
  submissionId: number,
  status: string,
  data: { reviewed_by: number; reviewed_at: string; review_action: string; review_comments: string; score_obtained?: number | null; score_max?: number | null; updated_by: number }
): Promise<void> {
  await query(
    `UPDATE dynamic_form_submissions
     SET status = ?, reviewed_by = ?, reviewed_at = ?, review_action = ?, review_comments = ?,
         score_obtained = COALESCE(?, score_obtained), score_max = COALESCE(?, score_max), updated_by = ?
     WHERE id = ?`,
    [status, data.reviewed_by, data.reviewed_at, data.review_action, data.review_comments,
      data.score_obtained ?? null, data.score_max ?? null, data.updated_by, submissionId]
  );
}

export async function softDeleteSubmission(submissionId: number): Promise<void> {
  await query('UPDATE dynamic_form_submissions SET deleted_at = NOW() WHERE id = ?', [submissionId]);
}

export async function nextSubmissionSequence(): Promise<number> {
  return Number((await queryScalar<number>('SELECT COUNT(*) + 1 FROM dynamic_form_submissions', [])) ?? 1);
}

/* ───────────────────────── answer read / write ─────────────────────────── */

export interface FieldValueRecord {
  field_key: string;
  field_id: number;
  section_id: number | null;
  value: unknown;
  /** Pre-computed column layout for the INSERT. */
  columns: {
    value_text: string | null;
    value_number: number | null;
    value_date: string | null;
    value_datetime: string | null;
    value_json: string | null;
    file_id: number | null;
  };
}

/** Places a JS value into the column that matches the field type. */
export function describeValue(value: unknown, fieldType: string): FieldValueRecord['columns'] {
  const text = value === null || value === undefined
    ? null
    : Array.isArray(value)
      ? value.join(', ')
      : typeof value === 'boolean'
        ? (value ? 'Yes' : 'No')
        : String(value);
  const columns: FieldValueRecord['columns'] = {
    value_text: text, value_number: null, value_date: null, value_datetime: null, value_json: null, file_id: null,
  };
  if (value === null || value === undefined || value === '') return columns;

  if (fieldType === 'switch' || typeof value === 'boolean') {
    columns.value_json = JSON.stringify(Boolean(value));
    return columns;
  }
  if (Array.isArray(value)) {
    columns.value_json = JSON.stringify(value);
    return columns;
  }
  if (['number', 'decimal', 'currency', 'rating', 'formula', 'auto_number'].includes(fieldType)) {
    const num = Number(value);
    if (Number.isFinite(num)) columns.value_number = num;
    return columns;
  }
  if (fieldType === 'date') {
    columns.value_date = String(value).slice(0, 10);
    return columns;
  }
  if (fieldType === 'datetime') {
    columns.value_datetime = String(value).replace('T', ' ').slice(0, 19);
    return columns;
  }
  if (['file', 'image', 'signature'].includes(fieldType)) {
    const fileId = Number(value);
    if (Number.isInteger(fileId)) columns.file_id = fileId;
    return columns;
  }
  if (fieldType === 'multi_file') {
    columns.value_json = JSON.stringify(value);
    return columns;
  }
  if (typeof value === 'object') {
    columns.value_json = JSON.stringify(value);
    return columns;
  }
  return columns;
}

export async function replaceValues(
  submissionId: number,
  formId: number,
  records: { field_id: number; section_id: number | null; field_key: string; field_type: string; value: unknown }[]
): Promise<void> {
  await transaction(async (conn) => {
    await conn.query('DELETE FROM dynamic_form_submission_values WHERE submission_id = ?', [submissionId]);
    for (const record of records) {
      const columns = describeValue(record.value, record.field_type);
      await conn.query(
        `INSERT INTO dynamic_form_submission_values
          (submission_id, form_id, section_id, field_id, field_key, value_text, value_number, value_date,
           value_datetime, value_json, file_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [submissionId, formId, record.section_id, record.field_id, record.field_key, columns.value_text,
          columns.value_number, columns.value_date, columns.value_datetime, columns.value_json, columns.file_id]
      );
    }
  });
}

export async function readValues(submissionId: number): Promise<SubmissionValueRow[]> {
  return query<SubmissionValueRow>(
    'SELECT * FROM dynamic_form_submission_values WHERE submission_id = ? ORDER BY id ASC',
    [submissionId]
  );
}

/** Assembles the `{ field_key: value }` map the renderer and PDF use. */
export function valuesToMap(rows: SubmissionValueRow[]): Record<string, unknown> {
  const map: Record<string, unknown> = {};
  for (const row of rows) {
    if (row.value_json !== null && row.value_json !== undefined) {
      try {
        map[row.field_key] = JSON.parse(String(row.value_json));
        continue;
      } catch {
        map[row.field_key] = row.value_json;
        continue;
      }
    }
    if (row.file_id !== null) {
      map[row.field_key] = Number(row.file_id);
      continue;
    }
    if (row.value_number !== null && row.value_number !== undefined) {
      map[row.field_key] = Number(row.value_number);
      continue;
    }
    if (row.value_date) {
      map[row.field_key] = String(row.value_date).slice(0, 10);
      continue;
    }
    if (row.value_datetime) {
      map[row.field_key] = String(row.value_datetime).replace('T', ' ').slice(0, 19);
      continue;
    }
    map[row.field_key] = row.value_text;
  }
  return map;
}

export async function replaceTableRows(
  submissionId: number,
  rows: { table_id: number; row_index: number; row_data: Record<string, unknown> }[]
): Promise<void> {
  await transaction(async (conn) => {
    await conn.query('DELETE FROM dynamic_table_rows WHERE submission_id = ?', [submissionId]);
    for (const row of rows) {
      await conn.query(
        'INSERT INTO dynamic_table_rows (submission_id, table_id, row_index, row_data) VALUES (?, ?, ?, ?)',
        [submissionId, row.table_id, row.row_index, JSON.stringify(row.row_data)]
      );
    }
  });
}

export async function readTableRows(submissionId: number): Promise<TableRowDocument[]> {
  return query<TableRowDocument>(
    'SELECT * FROM dynamic_table_rows WHERE submission_id = ? ORDER BY table_id ASC, row_index ASC',
    [submissionId]
  );
}

export function tableRowsToMap(rows: TableRowDocument[], tableKeysById: Map<number, string>): Record<string, Record<string, unknown>[]> {
  const map: Record<string, Record<string, unknown>[]> = {};
  for (const row of rows) {
    const key = tableKeysById.get(Number(row.table_id));
    if (!key) continue;
    let parsed: Record<string, unknown> = {};
    try {
      parsed = typeof row.row_data === 'string' ? JSON.parse(row.row_data) : (row.row_data as Record<string, unknown>);
    } catch {
      parsed = {};
    }
    const list = map[key] ?? [];
    list.push(parsed);
    map[key] = list;
  }
  return map;
}

/** Uniqueness check for `is_unique` fields (excludes the submission being saved). */
export async function findValueByFieldKey(fieldKey: string, formId: number, value: string, excludeSubmissionId?: number): Promise<number | null> {
  const params: SqlValue[] = [formId, fieldKey, value];
  let sql = `SELECT v.submission_id FROM dynamic_form_submission_values v
    JOIN dynamic_form_submissions s ON s.id = v.submission_id
    WHERE v.form_id = ? AND v.field_key = ? AND v.value_text = ? AND s.deleted_at IS NULL`;
  if (excludeSubmissionId) {
    sql += ' AND v.submission_id <> ?';
    params.push(excludeSubmissionId);
  }
  sql += ' LIMIT 1';
  const row = await queryOne<RowDataPacket>(sql, params);
  return row ? Number(row.submission_id) : null;
}

/** Files uploaded against a submission (evidence column on the register). */
export async function submissionFiles(submissionId: number): Promise<RowDataPacket[]> {
  return query<RowDataPacket>(
    `SELECT DISTINCT fl.id, fl.original_name, fl.mime_type, fl.file_size, fl.created_at
     FROM dynamic_form_submission_values v
     JOIN files fl ON fl.id = COALESCE(v.file_id, CAST(JSON_UNQUOTE(v.value_json) AS UNSIGNED))
     WHERE v.submission_id = ? AND fl.deleted_at IS NULL
     ORDER BY fl.id ASC`,
    [submissionId]
  );
}

export async function submissionCountsByStatus(scope: SubmissionScope = {}) {
  return submissionStats(scope);
}
