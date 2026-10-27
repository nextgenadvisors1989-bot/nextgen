/**
 * CAPAR data access: categories, reports, finding rows, attached files and review events.
 * Pure SQL; who may see or change what is decided in `services/capar.service.ts`.
 */
import { execute, insert, query, queryOne, type RowDataPacket } from '@/lib/db/mysql';

export type Row = Record<string, unknown> & RowDataPacket;

/** `SET a = ?, b = ?` for the keys of `data` that are present and allowed. */
export function setClause(data: Record<string, unknown>, allowed: readonly string[]) {
  const keys = allowed.filter((key) => data[key] !== undefined);
  return {
    sql: keys.map((key) => `${key} = ?`).join(', '),
    params: keys.map((key) => data[key]),
    keys,
  };
}

/* ───────────────────────────── categories ───────────────────────────── */

export function listCategories(includeInactive: boolean) {
  return query<Row>(
    `SELECT c.id, c.name, c.description, c.sort_order, c.status,
            (SELECT COUNT(*) FROM capar_findings f WHERE f.category_id = c.id AND f.deleted_at IS NULL) AS finding_count
       FROM capar_categories c
      WHERE c.deleted_at IS NULL ${includeInactive ? '' : "AND c.status = 'active'"}
      ORDER BY c.sort_order, c.name`
  );
}

export function findCategory(id: number) {
  return queryOne<Row>('SELECT * FROM capar_categories WHERE id = ? AND deleted_at IS NULL', [id]);
}

export function findCategoryByName(name: string, exceptId?: number) {
  return queryOne<Row>(
    'SELECT id FROM capar_categories WHERE LOWER(name) = LOWER(?) AND deleted_at IS NULL AND id <> ?',
    [name, exceptId ?? 0]
  );
}

export async function nextCategoryOrder() {
  const row = await queryOne<Row>('SELECT COALESCE(MAX(sort_order), 0) + 10 AS next FROM capar_categories WHERE deleted_at IS NULL');
  return Number(row?.next ?? 10);
}

export function insertCategory(data: { name: string; description: string | null; sort_order: number; status: string; created_by: number }) {
  return insert(
    'INSERT INTO capar_categories (name, description, sort_order, status, created_by) VALUES (?, ?, ?, ?, ?)',
    [data.name, data.description, data.sort_order, data.status, data.created_by]
  );
}

export async function updateCategory(id: number, data: Record<string, unknown>) {
  const set = setClause(data, ['name', 'description', 'sort_order', 'status']);
  if (!set.sql) return;
  await execute(`UPDATE capar_categories SET ${set.sql} WHERE id = ?`, [...set.params, id]);
}

export async function categoryUsage(id: number) {
  const row = await queryOne<Row>(
    'SELECT COUNT(*) AS total FROM capar_findings WHERE category_id = ? AND deleted_at IS NULL',
    [id]
  );
  return Number(row?.total ?? 0);
}

export function softDeleteCategory(id: number) {
  return execute('UPDATE capar_categories SET deleted_at = NOW() WHERE id = ?', [id]);
}

/* ───────────────────────────── reports ───────────────────────────── */

const REPORT_SELECT = `
  SELECT r.*, e.company_name AS employer_name, e.employer_code, u.unit_name,
         a.name AS auditor_name, a.auditor_code, a.signature_path AS auditor_signature_path,
         a.user_id AS auditor_user_id,
         CONCAT_WS(' ', v.first_name, v.last_name) AS verifier_name,
         aa.assignment_number
    FROM capar_reports r
    JOIN employers e ON e.id = r.employer_id
    JOIN auditors a ON a.id = r.auditor_id
    LEFT JOIN company_units u ON u.id = r.unit_id
    LEFT JOIN users v ON v.id = r.verifier_id
    LEFT JOIN audit_assignments aa ON aa.id = r.assignment_id`;

export function findReport(id: number) {
  return queryOne<Row>(`${REPORT_SELECT} WHERE r.id = ? AND r.deleted_at IS NULL`, [id]);
}

export interface ReportListFilters {
  search?: string;
  status?: string;
  employerId?: number;
  auditorId?: number;
  verifierId?: number;
  /** Only reports in these statuses (the verifier's queue, the employer's approved list). */
  statuses?: string[];
  sortBy?: string;
  sortDir?: string;
  limit: number;
  offset: number;
}

const SORTABLE: Record<string, string> = {
  created_at: 'r.created_at', audit_date: 'r.audit_date', status: 'r.status', report_number: 'r.report_number',
  employer: 'e.company_name', updated_at: 'r.updated_at',
};

export async function listReports(filters: ReportListFilters) {
  const where: string[] = ['r.deleted_at IS NULL'];
  const params: unknown[] = [];
  if (filters.search) {
    where.push('(r.title LIKE ? OR r.report_number LIKE ? OR r.facility_name LIKE ? OR e.company_name LIKE ?)');
    const term = `%${filters.search}%`;
    params.push(term, term, term, term);
  }
  if (filters.status) { where.push('r.status = ?'); params.push(filters.status); }
  if (filters.employerId) { where.push('r.employer_id = ?'); params.push(filters.employerId); }
  if (filters.auditorId) { where.push('r.auditor_id = ?'); params.push(filters.auditorId); }
  if (filters.verifierId) { where.push('r.verifier_id = ?'); params.push(filters.verifierId); }
  if (filters.statuses?.length) {
    where.push(`r.status IN (${filters.statuses.map(() => '?').join(', ')})`);
    params.push(...filters.statuses);
  }
  const whereSql = where.join(' AND ');
  const sortColumn = SORTABLE[filters.sortBy ?? ''] ?? 'r.created_at';
  const sortDir = filters.sortDir === 'asc' ? 'ASC' : 'DESC';

  const [totalRow, rows] = await Promise.all([
    queryOne<Row>(
      `SELECT COUNT(*) AS total FROM capar_reports r JOIN employers e ON e.id = r.employer_id WHERE ${whereSql}`,
      params
    ),
    query<Row>(
      `SELECT r.id, r.report_number, r.title, r.status, r.audit_date, r.facility_name, r.employer_id, r.auditor_id,
              r.verifier_id, r.submitted_at, r.approved_at, r.created_at, r.updated_at, r.revision_count,
              e.company_name AS employer_name, a.name AS auditor_name,
              CONCAT_WS(' ', v.first_name, v.last_name) AS verifier_name,
              (SELECT COUNT(*) FROM capar_findings f WHERE f.report_id = r.id AND f.deleted_at IS NULL) AS finding_count,
              (SELECT COUNT(*) FROM capar_findings f WHERE f.report_id = r.id AND f.deleted_at IS NULL AND f.outcome = 'Violation') AS violation_count,
              (SELECT COUNT(*) FROM capar_findings f WHERE f.report_id = r.id AND f.deleted_at IS NULL AND f.verification_status = 'Pending') AS pending_count,
              (SELECT COUNT(*) FROM capar_findings f WHERE f.report_id = r.id AND f.deleted_at IS NULL AND f.outcome = 'Violation' AND f.action_status <> 'Closed') AS open_count
         FROM capar_reports r
         JOIN employers e ON e.id = r.employer_id
         JOIN auditors a ON a.id = r.auditor_id
         LEFT JOIN users v ON v.id = r.verifier_id
        WHERE ${whereSql}
        ORDER BY ${sortColumn} ${sortDir}, r.id DESC
        LIMIT ${Math.floor(filters.limit)} OFFSET ${Math.floor(filters.offset)}`,
      params
    ),
  ]);
  return { total: Number(totalRow?.total ?? 0), rows };
}

export async function reportStatusCounts(scope: Pick<ReportListFilters, 'auditorId' | 'verifierId' | 'employerId' | 'statuses'>) {
  const where: string[] = ['deleted_at IS NULL'];
  const params: unknown[] = [];
  if (scope.auditorId) { where.push('auditor_id = ?'); params.push(scope.auditorId); }
  if (scope.verifierId) { where.push('verifier_id = ?'); params.push(scope.verifierId); }
  if (scope.employerId) { where.push('employer_id = ?'); params.push(scope.employerId); }
  if (scope.statuses?.length) {
    where.push(`status IN (${scope.statuses.map(() => '?').join(', ')})`);
    params.push(...scope.statuses);
  }
  const rows = await query<Row>(`SELECT status, COUNT(*) AS total FROM capar_reports WHERE ${where.join(' AND ')} GROUP BY status`, params);
  return Object.fromEntries(rows.map((row) => [String(row.status), Number(row.total)])) as Record<string, number>;
}

const REPORT_FIELDS = [
  'title', 'verifier_id', 'facility_name', 'facility_address', 'representative_name', 'representative_title', 'audit_date',
  'audit_firm', 'auditor_print_name', 'standard_reference', 'summary_notes', 'closing_meeting_date', 'closing_statement',
  'facility_signatory', 'facility_signed_date', 'letterhead_file_id', 'logo_file_id', 'status', 'submitted_at', 'reviewed_at',
  'approved_at', 'review_comments', 'revision_count', 'updated_by',
] as const;

export async function updateReport(id: number, data: Record<string, unknown>) {
  const set = setClause(data, REPORT_FIELDS);
  if (!set.sql) return;
  await execute(`UPDATE capar_reports SET ${set.sql} WHERE id = ?`, [...set.params, id]);
}

export function insertReport(data: Record<string, unknown>) {
  const columns = Object.keys(data);
  return insert(
    `INSERT INTO capar_reports (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    columns.map((column) => data[column])
  );
}

export function softDeleteReport(id: number) {
  return execute('UPDATE capar_reports SET deleted_at = NOW() WHERE id = ?', [id]);
}

/* ───────────────────────────── findings ───────────────────────────── */

export function listFindings(reportId: number) {
  return query<Row>(
    `SELECT f.*, c.name AS category_name, c.sort_order AS category_order,
            ca.short_name AS act_short_name, ca.act_name AS act_name,
            cr.title AS resource_title, cr.external_url AS resource_external_url, cr.file_id AS resource_file_id,
            CONCAT_WS(' ', vu.first_name, vu.last_name) AS verified_by_name
       FROM capar_findings f
       LEFT JOIN capar_categories c ON c.id = f.category_id
       LEFT JOIN compliance_acts ca ON ca.id = f.act_id
       LEFT JOIN cms_resources cr ON cr.id = f.resource_id
       LEFT JOIN users vu ON vu.id = f.verified_by
      WHERE f.report_id = ? AND f.deleted_at IS NULL
      ORDER BY COALESCE(c.sort_order, 999999), f.category_id, f.sort_order, f.id`,
    [reportId]
  );
}

export function findFinding(id: number) {
  return queryOne<Row>('SELECT * FROM capar_findings WHERE id = ? AND deleted_at IS NULL', [id]);
}

export async function nextFindingOrder(reportId: number) {
  const row = await queryOne<Row>(
    'SELECT COALESCE(MAX(sort_order), 0) + 10 AS next FROM capar_findings WHERE report_id = ? AND deleted_at IS NULL',
    [reportId]
  );
  return Number(row?.next ?? 10);
}

const FINDING_FIELDS = [
  'category_id', 'outcome', 'item_status', 'act_rule', 'act_id', 'provision_id', 'compliance_note', 'recommendation', 'assessment', 'signed_by', 'signed_at', 'resource_id', 'minimum_requirement', 'local_law', 'finding', 'root_cause',
  'action_plan', 'timeline_date', 'timeline_note', 'action_status', 'closed_on', 'verification_status', 'verification_remark',
  'verified_by', 'verified_at', 'sort_order',
] as const;

export function insertFinding(reportId: number, data: Record<string, unknown>) {
  const set = setClause(data, FINDING_FIELDS);
  const columns = ['report_id', ...set.keys];
  return insert(
    `INSERT INTO capar_findings (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    [reportId, ...set.params]
  );
}

export async function updateFinding(id: number, data: Record<string, unknown>) {
  const set = setClause(data, FINDING_FIELDS);
  if (!set.sql) return;
  await execute(`UPDATE capar_findings SET ${set.sql} WHERE id = ?`, [...set.params, id]);
}

export function softDeleteFinding(id: number) {
  return execute('UPDATE capar_findings SET deleted_at = NOW() WHERE id = ?', [id]);
}

/* ───────────────────────────── finding files ───────────────────────────── */

export function listFindingFiles(findingIds: number[]) {
  if (!findingIds.length) return Promise.resolve([] as Row[]);
  return query<Row>(
    `SELECT ff.id AS link_id, ff.finding_id, ff.file_id, ff.kind, ff.caption, ff.sort_order,
            f.original_name, f.mime_type, f.size_bytes, f.storage_path
       FROM capar_finding_files ff
       JOIN files f ON f.id = ff.file_id AND f.deleted_at IS NULL
      WHERE ff.finding_id IN (${findingIds.map(() => '?').join(', ')})
      ORDER BY ff.kind, ff.sort_order, ff.id`,
    findingIds
  );
}

export function insertFindingFile(data: { finding_id: number; file_id: number; kind: string; caption: string | null; created_by: number }) {
  return insert(
    'INSERT INTO capar_finding_files (finding_id, file_id, kind, caption, created_by) VALUES (?, ?, ?, ?, ?)',
    [data.finding_id, data.file_id, data.kind, data.caption, data.created_by]
  );
}

export function findFindingFile(linkId: number) {
  return queryOne<Row>(
    `SELECT ff.*, f.report_id FROM capar_finding_files ff JOIN capar_findings f ON f.id = ff.finding_id WHERE ff.id = ?`,
    [linkId]
  );
}

export function deleteFindingFile(linkId: number) {
  return execute('DELETE FROM capar_finding_files WHERE id = ?', [linkId]);
}

/* ───────────────────────────── review events ───────────────────────────── */

export function insertEvent(data: { report_id: number; action: string; comments: string | null; actor_id: number; actor_name: string }) {
  return insert(
    'INSERT INTO capar_review_events (report_id, action, comments, actor_id, actor_name) VALUES (?, ?, ?, ?, ?)',
    [data.report_id, data.action, data.comments, data.actor_id, data.actor_name]
  );
}

export function listEvents(reportId: number) {
  return query<Row>(
    'SELECT id, action, comments, actor_name, created_at FROM capar_review_events WHERE report_id = ? ORDER BY created_at DESC, id DESC',
    [reportId]
  );
}

/* ───────────────────────────── lookups ───────────────────────────── */

export function lookupAssignments(employerId: number, auditorId: number | null) {
  return query<Row>(
    `SELECT id, assignment_number, audit_title, unit_id, verifier_id, start_date, status
       FROM audit_assignments
      WHERE employer_id = ? AND deleted_at IS NULL AND status <> 'Cancelled' ${auditorId ? 'AND auditor_id = ?' : ''}
      ORDER BY created_at DESC LIMIT 50`,
    auditorId ? [employerId, auditorId] : [employerId]
  );
}

export function lookupVerifiers() {
  return query<Row>(
    `SELECT DISTINCT u.id, CONCAT_WS(' ', u.first_name, u.last_name) AS name, u.email
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles r ON r.id = ur.role_id
      WHERE r.slug = 'verifier' AND u.status = 'active' AND u.deleted_at IS NULL
      ORDER BY name`
  );
}

export function lookupActs(search: string) {
  const term = `%${search}%`;
  return query<Row>(
    `SELECT id, short_name, act_name, act_year, jurisdiction
       FROM compliance_acts
      WHERE deleted_at IS NULL AND (act_name LIKE ? OR short_name LIKE ?)
      ORDER BY COALESCE(short_name, act_name) LIMIT 25`,
    [term, term]
  );
}

export function lookupResources(search: string) {
  const term = `%${search}%`;
  return query<Row>(
    `SELECT id, title, resource_type, file_id, external_url
       FROM cms_resources
      WHERE deleted_at IS NULL AND status = 'published' AND title LIKE ?
      ORDER BY title LIMIT 25`,
    [term]
  );
}

export function employerForHeader(employerId: number) {
  return queryOne<Row>(
    `SELECT id, company_name, address_line_1, address_line_2, city, state, pincode, contact_person_name, contact_person_designation
       FROM employers WHERE id = ? AND deleted_at IS NULL`,
    [employerId]
  );
}

export function unitForHeader(unitId: number, employerId: number) {
  return queryOne<Row>(
    'SELECT id, unit_name, location, address FROM company_units WHERE id = ? AND employer_id = ? AND deleted_at IS NULL',
    [unitId, employerId]
  );
}

export function assignmentForHeader(assignmentId: number) {
  return queryOne<Row>(
    `SELECT id, assignment_number, audit_title, employer_id, unit_id, auditor_id, verifier_id, start_date, end_date
       FROM audit_assignments WHERE id = ? AND deleted_at IS NULL`,
    [assignmentId]
  );
}

export function auditorForUser(userId: number) {
  return queryOne<Row>(
    'SELECT id, name, auditor_code, user_id, status FROM auditors WHERE user_id = ? AND deleted_at IS NULL',
    [userId]
  );
}

export function auditorById(id: number) {
  return queryOne<Row>('SELECT id, name, auditor_code, user_id, status FROM auditors WHERE id = ? AND deleted_at IS NULL', [id]);
}
