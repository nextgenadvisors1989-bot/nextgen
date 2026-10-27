/**
 * Audit report data access. Parameterised SQL only.
 *
 * Two tables carry a report:
 *   `audit_reports`            — scalars: number, status, score, finding counts,
 *                                approval stamps, PDF pointer, current version.
 *   `audit_report_versions`    — the immutable body of each revision in
 *                                `snapshot_json` (executive summary, scorecard,
 *                                findings, observations, recommendations).
 *
 * `audit_report_comments` holds the conversation between auditor and verifier,
 * including the per-field correction requests that drive "Changes Requested".
 */
import { execute, insert, query, queryOne, type RowDataPacket } from '@/lib/db/mysql';
import { buildPagination } from '@/lib/utils/pagination';

export interface ReportListRow extends Record<string, unknown> {
  id: number;
  uuid: string;
  report_number: string;
  assignment_id: number | null;
  submission_id: number | null;
  module_id: number | null;
  form_id: number | null;
  employer_id: number;
  unit_id: number | null;
  auditor_id: number | null;
  audit_title: string;
  report_type: string;
  audit_period_from: string | null;
  audit_period_to: string | null;
  audit_date: string | null;
  status: string;
  current_version: number;
  score_obtained: number | null;
  score_max: number | null;
  score_percentage: number | null;
  critical_findings: number;
  major_findings: number;
  minor_findings: number;
  observations: number;
  pdf_file_id: number | null;
  pdf_generated_at: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  approved_by: number | null;
  rejected_at: string | null;
  rejected_by: number | null;
  rejection_reason: string | null;
  /** Working copy of the body saved by the auditor workspace (migration 020). */
  draft_body_json: string | null;
  draft_saved_at: string | null;
  next_audit_due: string | null;
  created_at: string;
  updated_at: string;
  /* joined */
  employer_name?: string | null;
  employer_code?: string | null;
  unit_name?: string | null;
  department_name?: string | null;
  auditor_name?: string | null;
  auditor_code?: string | null;
  auditor_email?: string | null;
  assignment_number?: string | null;
  assignment_status?: string | null;
  assignment_due_date?: string | null;
  module_name?: string | null;
  form_name?: string | null;
  approved_by_name?: string | null;
  rejected_by_name?: string | null;
  verifier_id?: number | null;
  verifier_name?: string | null;
  verifier_status?: string | null;
  verifier_due_date?: string | null;
  verifier_assigned_at?: string | null;
  comment_count?: number;
  open_correction_count?: number;
  version_count?: number;
  days_in_review?: number | null;
}

export interface ReportListFilters {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  reportType?: string;
  employerId?: number;
  unitId?: number;
  auditorId?: number;
  verifierId?: number;
  assignmentId?: number;
  minScore?: number;
  maxScore?: number;
  criticalOnly?: boolean;
  pendingVerification?: boolean;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortDir?: string;
}

const SORTABLE = [
  'created_at', 'submitted_at', 'report_number', 'score_percentage', 'status', 'audit_date', 'updated_at',
] as const;

/**
 * Joined column set shared by the register, the detail page and the verifier
 * queue. `audit_reports` has no `is_current` flag, so the active revision is the
 * highest `current_version` of the report itself.
 */
export const SELECT_COLUMNS = `
  ar.*,
  e.company_name AS employer_name, e.employer_code,
  u.unit_name,
  d.department_name,
  a.name AS auditor_name, a.auditor_code, a.email AS auditor_email,
  aa.assignment_number, aa.status AS assignment_status, aa.due_date AS assignment_due_date,
  m.name AS module_name,
  f.name AS form_name,
  CONCAT(ap.first_name, ' ', ap.last_name) AS approved_by_name,
  CONCAT(rj.first_name, ' ', rj.last_name) AS rejected_by_name,
  va.verifier_id, va.status AS verifier_status, va.due_date AS verifier_due_date, va.assigned_at AS verifier_assigned_at,
  CONCAT(vu.first_name, ' ', vu.last_name) AS verifier_name`;

export const JOINS = `
  FROM audit_reports ar
  LEFT JOIN employers e ON e.id = ar.employer_id
  LEFT JOIN company_units u ON u.id = ar.unit_id
  LEFT JOIN auditors a ON a.id = ar.auditor_id
  LEFT JOIN audit_assignments aa ON aa.id = ar.assignment_id
  LEFT JOIN departments d ON d.id = aa.department_id
  LEFT JOIN dynamic_modules m ON m.id = ar.module_id
  LEFT JOIN dynamic_forms f ON f.id = ar.form_id
  LEFT JOIN users ap ON ap.id = ar.approved_by
  LEFT JOIN users rj ON rj.id = ar.rejected_by
  LEFT JOIN verifier_assignments va ON va.id = (
    SELECT va2.id FROM verifier_assignments va2
     WHERE va2.report_id = ar.id
     ORDER BY (va2.status = 'completed') ASC, va2.id DESC LIMIT 1
  )
  LEFT JOIN users vu ON vu.id = va.verifier_id`;

export async function findReports(filters: ReportListFilters) {
  const where: string[] = ['ar.deleted_at IS NULL'];
  const params: unknown[] = [];

  if (filters.search) {
    where.push(`(
      ar.report_number LIKE ? OR ar.audit_title LIKE ? OR e.company_name LIKE ?
      OR a.name LIKE ? OR u.unit_name LIKE ? OR aa.assignment_number LIKE ?
    )`);
    const term = `%${filters.search}%`;
    params.push(term, term, term, term, term, term);
  }
  if (filters.status && filters.status !== 'all') {
    where.push('ar.status = ?');
    params.push(filters.status);
  }
  if (filters.reportType && filters.reportType !== 'all') {
    where.push('ar.report_type = ?');
    params.push(filters.reportType);
  }
  if (filters.employerId) {
    where.push('ar.employer_id = ?');
    params.push(filters.employerId);
  }
  if (filters.unitId) {
    where.push('ar.unit_id = ?');
    params.push(filters.unitId);
  }
  if (filters.auditorId) {
    where.push('ar.auditor_id = ?');
    params.push(filters.auditorId);
  }
  if (filters.verifierId) {
    where.push('va.verifier_id = ?');
    params.push(filters.verifierId);
  }
  if (filters.assignmentId) {
    where.push('ar.assignment_id = ?');
    params.push(filters.assignmentId);
  }
  if (filters.minScore !== undefined) {
    where.push('ar.score_percentage >= ?');
    params.push(filters.minScore);
  }
  if (filters.maxScore !== undefined) {
    where.push('ar.score_percentage <= ?');
    params.push(filters.maxScore);
  }
  if (filters.criticalOnly) {
    where.push('ar.critical_findings > 0');
  }
  if (filters.pendingVerification) {
    where.push("ar.status IN ('Submitted','Under Review','Changes Requested')");
  }
  if (filters.dateFrom) {
    where.push('DATE(COALESCE(ar.submitted_at, ar.created_at)) >= ?');
    params.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    where.push('DATE(COALESCE(ar.submitted_at, ar.created_at)) <= ?');
    params.push(filters.dateTo);
  }

  const whereSql = where.join(' AND ');
  const sortBy = SORTABLE.includes(filters.sortBy as (typeof SORTABLE)[number]) ? filters.sortBy : 'created_at';
  const sortDir = filters.sortDir === 'asc' ? 'ASC' : 'DESC';
  const limit = Math.min(Math.max(filters.limit ?? 10, 1), 200);
  const page = Math.max(filters.page ?? 1, 1);
  const offset = (page - 1) * limit;

  const totalRow = await queryOne<RowDataPacket>(`SELECT COUNT(*) AS total ${JOINS} WHERE ${whereSql}`, params);
  const total = Number(totalRow?.total ?? 0);

  const data = await query<ReportListRow & RowDataPacket>(
    `SELECT ${SELECT_COLUMNS},
            (SELECT COUNT(*) FROM audit_report_comments c WHERE c.report_id = ar.id AND c.deleted_at IS NULL) AS comment_count,
            (SELECT COUNT(*) FROM audit_report_comments c WHERE c.report_id = ar.id AND c.deleted_at IS NULL
              AND c.is_resolved = 0 AND c.comment_type = 'correction_request') AS open_correction_count,
            (SELECT COUNT(*) FROM audit_report_versions v WHERE v.report_id = ar.id) AS version_count,
            CASE WHEN ar.submitted_at IS NOT NULL AND ar.status IN ('Submitted','Under Review')
                 THEN DATEDIFF(CURDATE(), DATE(ar.submitted_at)) END AS days_in_review
       ${JOINS}
      WHERE ${whereSql}
      ORDER BY ar.${sortBy} ${sortDir}
      LIMIT ${limit} OFFSET ${offset}`,
    params
  );

  return { data, pagination: buildPagination(total, page, limit) };
}

/**
 * The register's status counters plus the score statistics the dashboard tiles
 * show. Kept in one round trip.
 */
export async function getReportStats(employerId?: number, verifierId?: number) {
  const where: string[] = ['ar.deleted_at IS NULL'];
  const params: unknown[] = [];
  let verifierJoin = '';

  if (employerId) {
    where.push('ar.employer_id = ?');
    params.push(employerId);
  }
  if (verifierId) {
    verifierJoin = 'JOIN verifier_assignments vf ON vf.report_id = ar.id AND vf.verifier_id = ?';
    params.unshift(verifierId);
  }

  const rows = await query<{ status: string; total: number } & RowDataPacket>(
    `SELECT ar.status, COUNT(*) AS total
       FROM audit_reports ar ${verifierJoin}
      WHERE ${where.join(' AND ')}
      GROUP BY ar.status`,
    params
  );

  const counts: Record<string, number> = {};
  let total = 0;
  for (const row of rows) {
    counts[String(row.status)] = Number(row.total);
    total += Number(row.total);
  }

  const aggregates = await queryOne<RowDataPacket>(
    `SELECT
       ROUND(AVG(ar.score_percentage), 1) AS avg_score,
       SUM(ar.critical_findings) AS critical,
       SUM(ar.major_findings) AS major,
       SUM(ar.minor_findings) AS minor,
       SUM(CASE WHEN ar.score_percentage >= 90 THEN 1 ELSE 0 END) AS high_scorers,
       SUM(CASE WHEN ar.score_percentage < 60 THEN 1 ELSE 0 END) AS low_scorers,
       SUM(CASE WHEN ar.next_audit_due IS NOT NULL AND ar.next_audit_due <= DATE_ADD(CURDATE(), INTERVAL 60 DAY) THEN 1 ELSE 0 END) AS reaudit_soon
     FROM audit_reports ar ${verifierJoin}
    WHERE ${where.join(' AND ')}`,
    params
  );

  return {
    total,
    draft: counts.Draft ?? 0,
    submitted: counts.Submitted ?? 0,
    underReview: counts['Under Review'] ?? 0,
    changesRequested: counts['Changes Requested'] ?? 0,
    approved: counts.Approved ?? 0,
    rejected: counts.Rejected ?? 0,
    archived: counts.Archived ?? 0,
    awaitingVerification: (counts.Submitted ?? 0) + (counts['Under Review'] ?? 0) + (counts['Changes Requested'] ?? 0),
    averageScore: aggregates?.avg_score === null || aggregates?.avg_score === undefined ? null : Number(aggregates.avg_score),
    criticalFindings: Number(aggregates?.critical ?? 0),
    majorFindings: Number(aggregates?.major ?? 0),
    minorFindings: Number(aggregates?.minor ?? 0),
    highScorers: Number(aggregates?.high_scorers ?? 0),
    lowScorers: Number(aggregates?.low_scorers ?? 0),
    reauditSoon: Number(aggregates?.reaudit_soon ?? 0),
  };
}

export function findReportById(id: number, options: { includeDeleted?: boolean } = {}) {
  const guard = options.includeDeleted ? '' : ' AND ar.deleted_at IS NULL';
  return queryOne<ReportListRow & RowDataPacket>(
    `SELECT ${SELECT_COLUMNS} ${JOINS} WHERE ar.id = ?${guard} LIMIT 1`,
    [id]
  );
}

export function findReportByNumber(reportNumber: string) {
  return queryOne<{ id: number } & RowDataPacket>(
    'SELECT id FROM audit_reports WHERE report_number = ? LIMIT 1',
    [reportNumber]
  );
}

export function findReportByAssignment(assignmentId: number) {
  return queryOne<{ id: number; report_number: string; current_version: number } & RowDataPacket>(
    `SELECT id, report_number, current_version FROM audit_reports
      WHERE assignment_id = ? AND deleted_at IS NULL
      ORDER BY current_version DESC, id DESC LIMIT 1`,
    [assignmentId]
  );
}

/**
 * Working copy of the document body. Drafts deliberately do not touch
 * `audit_report_versions`: that chain holds frozen revisions only, so a verifier's
 * correction note is never overwritten by an autosave.
 */
export async function saveDraftBody(
  reportId: number,
  bodyJson: string,
  savedAt: string,
  updatedBy: number
): Promise<number> {
  const result = await execute(
    `UPDATE audit_reports
        SET draft_body_json = ?, draft_saved_at = ?, updated_by = ?
      WHERE id = ? AND deleted_at IS NULL`,
    [bodyJson, savedAt, updatedBy, reportId]
  );
  return result.affectedRows;
}

/** Reports raised by one auditor, for their own "My Reports" register. */
export async function findReportsByAuditor(
  auditorId: number,
  filters: { search?: string; status?: string; limit?: number } = {}
) {
  const where = ['ar.deleted_at IS NULL', 'ar.auditor_id = ?'];
  const params: unknown[] = [auditorId];

  if (filters.status && filters.status !== 'all') {
    where.push('ar.status = ?');
    params.push(filters.status);
  }
  if (filters.search) {
    where.push('(ar.report_number LIKE ? OR ar.audit_title LIKE ? OR e.company_name LIKE ?)');
    const term = `%${filters.search}%`;
    params.push(term, term, term);
  }

  const limit = Math.min(Math.max(filters.limit ?? 200, 1), 500);
  return query<ReportListRow & RowDataPacket>(
    `SELECT ${SELECT_COLUMNS} ${JOINS} WHERE ${where.join(' AND ')}
      ORDER BY ar.updated_at DESC LIMIT ${limit}`,
    params
  );
}

export async function createReport(data: Record<string, unknown>, createdBy: number): Promise<number> {
  const columns = Object.keys(data);
  return insert(
    `INSERT INTO audit_reports (${columns.join(', ')}, created_by, updated_by)
     VALUES (${columns.map(() => '?').join(', ')}, ?, ?)`,
    [...columns.map((column) => data[column]), createdBy, createdBy]
  );
}

export async function updateReport(
  id: number,
  data: Record<string, unknown>,
  updatedBy: number,
  options: { includeDeleted?: boolean } = {}
): Promise<number> {
  const columns = Object.keys(data);
  if (!columns.length) return 0;
  const result = await execute(
    `UPDATE audit_reports SET ${columns.map((column) => `${column} = ?`).join(', ')}, updated_by = ?
      WHERE id = ?${options.includeDeleted ? '' : ' AND deleted_at IS NULL'}`,
    [...columns.map((column) => data[column]), updatedBy, id]
  );
  return result.affectedRows;
}

export async function softDeleteReport(id: number, deletedBy: number): Promise<number> {
  const result = await execute(
    'UPDATE audit_reports SET deleted_at = NOW(), updated_by = ? WHERE id = ? AND deleted_at IS NULL',
    [deletedBy, id]
  );
  return result.affectedRows;
}

/* ---------------------------------------------------------------- versions */

export interface ReportVersionRow extends Record<string, unknown> {
  id: number;
  report_id: number;
  version: number;
  snapshot_json: string;
  pdf_file_id: number | null;
  change_summary: string | null;
  created_by: number | null;
  created_at: string;
  created_by_name?: string | null;
  pdf_original_name?: string | null;
}

export function listVersions(reportId: number) {
  return query<ReportVersionRow & RowDataPacket>(
    `SELECT v.*, CONCAT(u.first_name, ' ', u.last_name) AS created_by_name, f.original_name AS pdf_original_name
       FROM audit_report_versions v
       LEFT JOIN users u ON u.id = v.created_by
       LEFT JOIN files f ON f.id = v.pdf_file_id
      WHERE v.report_id = ?
      ORDER BY v.version DESC`,
    [reportId]
  );
}

export function findVersion(reportId: number, version: number) {
  return queryOne<ReportVersionRow & RowDataPacket>(
    `SELECT v.*, CONCAT(u.first_name, ' ', u.last_name) AS created_by_name
       FROM audit_report_versions v
       LEFT JOIN users u ON u.id = v.created_by
      WHERE v.report_id = ? AND v.version = ? LIMIT 1`,
    [reportId, version]
  );
}

export function latestVersion(reportId: number) {
  return queryOne<ReportVersionRow & RowDataPacket>(
    'SELECT * FROM audit_report_versions WHERE report_id = ? ORDER BY version DESC LIMIT 1',
    [reportId]
  );
}

export function nextVersionNumber(reportId: number) {
  return queryOne<{ next: number } & RowDataPacket>(
    'SELECT COALESCE(MAX(version), 0) + 1 AS next FROM audit_report_versions WHERE report_id = ?',
    [reportId]
  );
}

export async function insertVersion(data: {
  reportId: number; version: number; snapshot: Record<string, unknown>; pdfFileId?: number | null;
  changeSummary?: string | null; createdBy: number;
}): Promise<number> {
  return insert(
    `INSERT INTO audit_report_versions (report_id, version, snapshot_json, pdf_file_id, change_summary, created_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [data.reportId, data.version, JSON.stringify(data.snapshot), data.pdfFileId ?? null, data.changeSummary ?? null, data.createdBy]
  );
}

export function versionHistory(reportId: number, limit = 20) {
  return query<{ version: number; change_summary: string | null; created_at: string; created_by_name: string | null; pdf_file_id: number | null } & RowDataPacket>(
    `SELECT v.version, v.change_summary, v.created_at, v.pdf_file_id,
            CONCAT(u.first_name, ' ', u.last_name) AS created_by_name
       FROM audit_report_versions v
       LEFT JOIN users u ON u.id = v.created_by
      WHERE v.report_id = ?
      ORDER BY v.version DESC
      LIMIT ${Math.max(1, Math.min(limit, 100))}`,
    [reportId]
  );
}

/* ---------------------------------------------------------------- comments */

export interface ReportCommentRow extends Record<string, unknown> {
  id: number;
  report_id: number;
  version: number | null;
  comment_type: string;
  comment: string;
  section_ref: string | null;
  field_ref: string | null;
  severity: string;
  is_resolved: number;
  resolved_by: number | null;
  resolved_at: string | null;
  parent_id: number | null;
  created_by: number;
  created_at: string;
  author_name?: string | null;
  author_role?: string | null;
  author_email?: string | null;
}

const COMMENT_COLUMNS = `
  c.*, CONCAT(u.first_name, ' ', u.last_name) AS author_name, u.email AS author_email,
  (SELECT GROUP_CONCAT(r.slug ORDER BY r.slug SEPARATOR ', ')
     FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = c.created_by) AS author_role`;

export function listComments(reportId: number, options: { type?: string; includeResolved?: boolean } = {}) {
  const where = ['c.report_id = ?', 'c.deleted_at IS NULL'];
  const params: unknown[] = [reportId];

  if (options.type && options.type !== 'all') {
    where.push('c.comment_type = ?');
    params.push(options.type);
  }
  if (!options.includeResolved) {
    // Resolved threads stay visible; only the filter hides them.
  }

  return query<ReportCommentRow & RowDataPacket>(
    `SELECT ${COMMENT_COLUMNS}
       FROM audit_report_comments c
       LEFT JOIN users u ON u.id = c.created_by
      WHERE ${where.join(' AND ')}
      ORDER BY c.created_at ASC`,
    params
  );
}

export function findCommentById(id: number) {
  return queryOne<ReportCommentRow & RowDataPacket>(
    `SELECT ${COMMENT_COLUMNS}
       FROM audit_report_comments c
       LEFT JOIN users u ON u.id = c.created_by
      WHERE c.id = ? AND c.deleted_at IS NULL LIMIT 1`,
    [id]
  );
}

export function commentCounts(reportId: number) {
  return queryOne<RowDataPacket>(
    `SELECT
       COUNT(*) AS total,
       SUM(comment_type = 'correction_request') AS corrections,
       SUM(comment_type = 'correction_request' AND is_resolved = 0) AS open_corrections
     FROM audit_report_comments
    WHERE report_id = ? AND deleted_at IS NULL`,
    [reportId]
  );
}

export async function insertComment(data: Record<string, unknown>): Promise<number> {
  const columns = Object.keys(data);
  return insert(
    `INSERT INTO audit_report_comments (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    columns.map((column) => data[column])
  );
}

export async function resolveComment(id: number, resolvedBy: number, isResolved: boolean): Promise<number> {
  const result = await execute(
    `UPDATE audit_report_comments
        SET is_resolved = ?, resolved_by = ?, resolved_at = ?
      WHERE id = ? AND deleted_at IS NULL`,
    [isResolved ? 1 : 0, isResolved ? resolvedBy : null, isResolved ? new Date() : null, id]
  );
  return result.affectedRows;
}

export async function softDeleteComment(id: number): Promise<number> {
  const result = await execute('UPDATE audit_report_comments SET deleted_at = NOW() WHERE id = ?', [id]);
  return result.affectedRows;
}

/** Every unresolved correction on a report, used to build the return email. */
export function openCorrections(reportId: number) {
  return query<{ section_ref: string | null; field_ref: string | null; severity: string; comment: string } & RowDataPacket>(
    `SELECT section_ref, field_ref, severity, comment
       FROM audit_report_comments
      WHERE report_id = ? AND deleted_at IS NULL
        AND comment_type = 'correction_request' AND is_resolved = 0
      ORDER BY FIELD(severity, 'critical','major','minor','info'), id`,
    [reportId]
  );
}

/* ------------------------------------------------------------ verifier queue */

export function listVerifierAssignments(reportId: number) {
  return query<{
    id: number; verifier_id: number; status: string; assigned_at: string; due_date: string | null;
    completed_at: string | null; remarks: string | null; verifier_name: string | null; verifier_email: string | null;
    assigned_by_name: string | null;
  } & RowDataPacket>(
    `SELECT va.*, CONCAT(u.first_name, ' ', u.last_name) AS verifier_name, u.email AS verifier_email,
            CONCAT(ab.first_name, ' ', ab.last_name) AS assigned_by_name
       FROM verifier_assignments va
       JOIN users u ON u.id = va.verifier_id
       LEFT JOIN users ab ON ab.id = va.assigned_by
      WHERE va.report_id = ?
      ORDER BY va.id DESC`,
    [reportId]
  );
}

export function findActiveVerifierAssignment(reportId: number) {
  return queryOne<{ id: number; verifier_id: number; status: string; due_date: string | null } & RowDataPacket>(
    `SELECT id, verifier_id, status, due_date FROM verifier_assignments
      WHERE report_id = ? AND status IN ('pending','in_review')
      ORDER BY id DESC LIMIT 1`,
    [reportId]
  );
}

export function findVerifierAssignmentById(id: number) {
  return queryOne<{ id: number; report_id: number; verifier_id: number; status: string; due_date: string | null } & RowDataPacket>(
    `SELECT id, report_id, verifier_id, status, due_date FROM verifier_assignments WHERE id = ? LIMIT 1`,
    [id]
  );
}

export async function createVerifierAssignment(data: {
  reportId: number; verifierId: number; assignedBy: number; dueDate?: string | null; remarks?: string | null;
}): Promise<number> {
  return insert(
    `INSERT INTO verifier_assignments (report_id, verifier_id, assigned_by, due_date, status, remarks)
     VALUES (?, ?, ?, ?, 'pending', ?)`,
    [data.reportId, data.verifierId, data.assignedBy, data.dueDate ?? null, data.remarks ?? null]
  );
}

export async function updateVerifierAssignment(
  id: number,
  data: { status?: string; completedAt?: string | null; remarks?: string | null }
): Promise<number> {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (data.status) { sets.push('status = ?'); params.push(data.status); }
  if (data.completedAt !== undefined) { sets.push('completed_at = ?'); params.push(data.completedAt); }
  if (data.remarks !== undefined) { sets.push('remarks = ?'); params.push(data.remarks); }
  if (!sets.length) return 0;
  const result = await execute(`UPDATE verifier_assignments SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
  return result.affectedRows;
}

export async function reassignVerifierAssignments(reportId: number, verifierId: number, assignedBy: number): Promise<number> {
  // Anyone else still holding the report is marked reassigned rather than
  // edited, so the queue keeps a truthful record of who has seen it.
  await execute(
    `UPDATE verifier_assignments SET status = 'reassigned', completed_at = NOW()
      WHERE report_id = ? AND verifier_id <> ? AND status IN ('pending','in_review')`,
    [reportId, verifierId]
  );

  // uq_va is (report_id, verifier_id): the same verifier coming back for a
  // resubmission reopens their row instead of colliding with the unique key.
  const existing = await queryOne<{ id: number } & RowDataPacket>(
    'SELECT id FROM verifier_assignments WHERE report_id = ? AND verifier_id = ? LIMIT 1',
    [reportId, verifierId]
  );

  if (existing) {
    await execute(
      `UPDATE verifier_assignments
          SET status = 'pending', assigned_by = ?, assigned_at = NOW(), completed_at = NULL,
              remarks = NULL, due_date = COALESCE(due_date, DATE_ADD(CURDATE(), INTERVAL 7 DAY))
        WHERE id = ?`,
      [assignedBy, Number(existing.id)]
    );
    return Number(existing.id);
  }

  return createVerifierAssignment({ reportId, verifierId, assignedBy });
}

export function verifierDecisions(reportId: number) {
  return query<{ id: number; action: string; comments: string; reason: string | null; created_at: string; verifier_name: string | null } & RowDataPacket>(
    `SELECT vc.id, vc.action, vc.comments, vc.reason, vc.created_at,
            CONCAT(u.first_name, ' ', u.last_name) AS verifier_name
       FROM verifier_comments vc
       JOIN users u ON u.id = vc.verifier_id
      WHERE vc.report_id = ?
      ORDER BY vc.id DESC`,
    [reportId]
  );
}

export async function insertVerifierComment(data: {
  reportId: number; verifierId: number; action: string; comments: string; reason?: string | null;
}): Promise<number> {
  return insert(
    `INSERT INTO verifier_comments (report_id, verifier_id, action, comments, reason) VALUES (?, ?, ?, ?, ?)`,
    [data.reportId, data.verifierId, data.action, data.comments, data.reason ?? null]
  );
}

/** Verifier worklist for one user: everything still pending their decision. */
export function pendingForVerifier(verifierId: number, limit = 50) {
  return query<ReportListRow & RowDataPacket>(
    `SELECT ${SELECT_COLUMNS}, va.id AS verification_id
       ${JOINS}
      WHERE ar.deleted_at IS NULL AND va.verifier_id = ? AND va.status IN ('pending','in_review')
        AND ar.status IN ('Submitted','Under Review','Changes Requested')
      ORDER BY COALESCE(va.due_date, '9999-12-31') ASC, ar.submitted_at ASC
      LIMIT ${Math.max(1, Math.min(limit, 200))}`,
    [verifierId]
  );
}

export function verifierWorkload(verifierId: number) {
  return queryOne<RowDataPacket>(
    `SELECT
       SUM(status IN ('pending','in_review')) AS pending,
       SUM(status = 'completed') AS completed,
       SUM(CASE WHEN status IN ('pending','in_review') AND due_date IS NOT NULL AND due_date < CURDATE() THEN 1 ELSE 0 END) AS overdue,
       AVG(CASE WHEN status = 'completed' AND completed_at IS NOT NULL AND assigned_at IS NOT NULL
                THEN DATEDIFF(completed_at, assigned_at) END) AS avg_turnaround_days
     FROM verifier_assignments WHERE verifier_id = ?`,
    [verifierId]
  );
}

/** Employer-side read: reports for an employer (portal "Audit Reports" tab). */
export function reportsForEmployer(employerId: number, options: { status?: string; unitId?: number; limit?: number } = {}) {
  const where = ['ar.deleted_at IS NULL', 'ar.employer_id = ?'];
  const params: unknown[] = [employerId];
  if (options.status && options.status !== 'all') {
    where.push('ar.status = ?');
    params.push(options.status);
  }
  if (options.unitId) {
    where.push('ar.unit_id = ?');
    params.push(options.unitId);
  }
  return query<ReportListRow & RowDataPacket>(
    `SELECT ${SELECT_COLUMNS}
       ${JOINS}
      WHERE ${where.join(' AND ')}
      ORDER BY COALESCE(ar.submitted_at, ar.created_at) DESC
      LIMIT ${Math.max(1, Math.min(options.limit ?? 50, 200))}`,
    params
  );
}

/** Reports the auditor owns. */
export function reportsForAuditor(auditorId: number, options: { status?: string; limit?: number } = {}) {
  const where = ['ar.deleted_at IS NULL', 'ar.auditor_id = ?'];
  const params: unknown[] = [auditorId];
  if (options.status && options.status !== 'all') {
    where.push('ar.status = ?');
    params.push(options.status);
  }
  return query<ReportListRow & RowDataPacket>(
    `SELECT ${SELECT_COLUMNS}
       ${JOINS}
      WHERE ${where.join(' AND ')}
      ORDER BY COALESCE(ar.submitted_at, ar.created_at) DESC
      LIMIT ${Math.max(1, Math.min(options.limit ?? 50, 200))}`,
    params
  );
}

/** Trend data for the score chart on the register. */
export function scoreTrend(months = 6, employerId?: number) {
  const where = ['ar.deleted_at IS NULL', 'ar.score_percentage IS NOT NULL', 'ar.submitted_at IS NOT NULL'];
  const params: unknown[] = [];
  if (employerId) {
    where.push('ar.employer_id = ?');
    params.push(employerId);
  }
  return query<{ period: string; reports: number; avg_score: number; critical: number } & RowDataPacket>(
    `SELECT DATE_FORMAT(ar.submitted_at, '%Y-%m') AS period, COUNT(*) AS reports,
            ROUND(AVG(ar.score_percentage), 1) AS avg_score, SUM(ar.critical_findings) AS critical
       FROM audit_reports ar
      WHERE ${where.join(' AND ')} AND ar.submitted_at >= DATE_SUB(CURDATE(), INTERVAL ${Math.max(1, Math.min(months, 24))} MONTH)
      GROUP BY period ORDER BY period`,
    params
  );
}

/** Findings breakdown for the register's severity chart. */
export function findingsBreakdown(employerId?: number) {
  const where = ['deleted_at IS NULL'];
  const params: unknown[] = [];
  if (employerId) {
    where.push('employer_id = ?');
    params.push(employerId);
  }
  return queryOne<RowDataPacket>(
    `SELECT SUM(critical_findings) AS critical, SUM(major_findings) AS major,
            SUM(minor_findings) AS minor, SUM(observations) AS observations
       FROM audit_reports WHERE ${where.join(' AND ')}`,
    params
  );
}

/**
 * Reports one verifier has already decided on, in the order they decided them.
 *
 * The verifier's own panel shows these under "Approved" and "Rejected": the work
 * is finished, so the list answers "what did I sign off on, and when" rather than
 * "what is waiting". A verifier only ever sees their own decisions — the verifier
 * id comes from the session, never from the query string.
 */
export function verifierDecisionList(verifierId: number, decision: 'approved' | 'rejected', limit = 100) {
  return query<ReportListRow & { decision_at: string; decision_comments: string | null; decision_reason: string | null } & RowDataPacket>(
    `SELECT ${SELECT_COLUMNS},
            vc.created_at AS decision_at,
            vc.comments AS decision_comments,
            vc.reason AS decision_reason
       ${JOINS}
       JOIN verifier_comments vc
         ON vc.id = (
              SELECT MAX(vc2.id) FROM verifier_comments vc2
               WHERE vc2.report_id = ar.id AND vc2.verifier_id = ? AND vc2.action = ?
            )
      WHERE ar.deleted_at IS NULL
      ORDER BY vc.created_at DESC
      LIMIT ${Math.max(1, Math.min(limit, 200))}`,
    [verifierId, decision]
  );
}

/**
 * Every report waiting for a verifier's decision, across the whole platform.
 *
 * `pendingForVerifier` answers "what is on this verifier's desk?"; this answers
 * the administrator's question — "what is waiting at all, and who has it?" — so a
 * report that nobody has picked up shows up beside the ones that have.
 */
export function pendingVerificationQueue(limit = 100) {
  return query<ReportListRow & RowDataPacket>(
    `SELECT ${SELECT_COLUMNS}, va.id AS verification_id, va.status AS verifier_assignment_status
       ${JOINS}
      WHERE ar.deleted_at IS NULL
        AND ar.status IN ('Submitted', 'Under Review', 'Changes Requested')
      ORDER BY COALESCE(ar.submitted_at, ar.created_at) ASC
      LIMIT ${Math.max(1, Math.min(limit, 300))}`,
    []
  );
}
