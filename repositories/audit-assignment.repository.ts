/**
 * Audit-assignment data access. Parameterised SQL only.
 *
 * An assignment is the spine of the platform: it links an employer (and unit /
 * department) to an auditor and verifier, carries the schedule, and is the row
 * that the auditor workspace, the calendar, the report register and every
 * reminder job hang off.
 */
import { execute, insert, query, queryOne, type RowDataPacket } from '@/lib/db/mysql';
import { buildPagination } from '@/lib/utils/pagination';
import type { AuditAssignment } from '@/types/audit';

/** Row shape returned by the joined register query. */
export interface AssignmentListRow extends AuditAssignment {
  employer_code?: string | null;
  department_name?: string | null;
  auditor_code?: string | null;
  auditor_email?: string | null;
  auditor_mobile?: string | null;
  verifier_email?: string | null;
  assigned_by_name?: string | null;
  module_name?: string | null;
  report_id?: number | null;
  report_number?: string | null;
  report_status?: string | null;
  days_remaining?: number | null;
}

export interface AssignmentListFilters {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  type?: string;
  priority?: string;
  employerId?: number;
  unitId?: number;
  auditorId?: number;
  verifierId?: number;
  overdueOnly?: boolean;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortDir?: string;
}

const SORTABLE = [
  'created_at', 'due_date', 'start_date', 'audit_title', 'assignment_number', 'priority', 'status', 'progress_percent',
] as const;

/** Joined columns every read of an assignment needs. */
const SELECT_COLUMNS = `
  aa.*,
  e.company_name AS employer_name, e.employer_code,
  u.unit_name,
  d.department_name,
  a.name AS auditor_name, a.auditor_code, a.email AS auditor_email, a.mobile AS auditor_mobile,
  CONCAT(vu.first_name, ' ', vu.last_name) AS verifier_name, vu.email AS verifier_email,
  CONCAT(cb.first_name, ' ', cb.last_name) AS assigned_by_name,
  m.name AS module_name,
  ar.id AS report_id, ar.report_number, ar.status AS report_status,
  CASE WHEN aa.due_date IS NOT NULL THEN DATEDIFF(aa.due_date, CURDATE()) END AS days_remaining`;

const JOINS = `
  FROM audit_assignments aa
  LEFT JOIN employers e ON e.id = aa.employer_id
  LEFT JOIN company_units u ON u.id = aa.unit_id
  LEFT JOIN departments d ON d.id = aa.department_id
  LEFT JOIN auditors a ON a.id = aa.auditor_id
  LEFT JOIN users vu ON vu.id = aa.verifier_id
  LEFT JOIN users cb ON cb.id = aa.assigned_by
  LEFT JOIN dynamic_modules m ON m.id = aa.module_id
  LEFT JOIN audit_reports ar ON ar.id = (
    SELECT ar2.id FROM audit_reports ar2
     WHERE ar2.assignment_id = aa.id AND ar2.deleted_at IS NULL
     ORDER BY ar2.current_version DESC, ar2.id DESC LIMIT 1
  )`;

export async function findAssignments(filters: AssignmentListFilters) {
  const where: string[] = ['aa.deleted_at IS NULL'];
  const params: unknown[] = [];

  if (filters.search) {
    where.push(`(
      aa.assignment_number LIKE ? OR aa.audit_title LIKE ? OR e.company_name LIKE ?
      OR a.name LIKE ? OR u.unit_name LIKE ?
    )`);
    const term = `%${filters.search}%`;
    params.push(term, term, term, term, term);
  }
  if (filters.status && filters.status !== 'all') {
    where.push('aa.status = ?');
    params.push(filters.status);
  }
  if (filters.type && filters.type !== 'all') {
    where.push('aa.assignment_type = ?');
    params.push(filters.type);
  }
  if (filters.priority && filters.priority !== 'all') {
    where.push('aa.priority = ?');
    params.push(filters.priority);
  }
  if (filters.employerId) {
    where.push('aa.employer_id = ?');
    params.push(filters.employerId);
  }
  if (filters.unitId) {
    where.push('aa.unit_id = ?');
    params.push(filters.unitId);
  }
  if (filters.auditorId) {
    where.push('aa.auditor_id = ?');
    params.push(filters.auditorId);
  }
  if (filters.verifierId) {
    where.push('aa.verifier_id = ?');
    params.push(filters.verifierId);
  }
  if (filters.overdueOnly) {
    where.push("aa.due_date IS NOT NULL AND aa.due_date < CURDATE() AND aa.status NOT IN ('Approved','Cancelled')");
  }
  if (filters.dateFrom) {
    where.push('DATE(COALESCE(aa.start_date, aa.created_at)) >= ?');
    params.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    where.push('DATE(COALESCE(aa.due_date, aa.start_date, aa.created_at)) <= ?');
    params.push(filters.dateTo);
  }

  const whereSql = where.join(' AND ');
  const sortBy = SORTABLE.includes(filters.sortBy as (typeof SORTABLE)[number]) ? filters.sortBy : 'created_at';
  const sortDir = filters.sortDir === 'asc' ? 'ASC' : 'DESC';
  const limit = Math.min(Math.max(filters.limit ?? 10, 1), 200);
  const page = Math.max(filters.page ?? 1, 1);
  const offset = (page - 1) * limit;

  const totalRow = await queryOne<RowDataPacket>(
    `SELECT COUNT(*) AS total ${JOINS} WHERE ${whereSql}`,
    params
  );
  const total = Number(totalRow?.total ?? 0);

  const data = await query<AuditAssignment & RowDataPacket>(
    `SELECT ${SELECT_COLUMNS} ${JOINS}
      WHERE ${whereSql}
      ORDER BY aa.${sortBy} ${sortDir}
      LIMIT ${limit} OFFSET ${offset}`,
    params
  );

  return { data, pagination: buildPagination(total, page, limit) };
}

export async function findAssignmentById(id: number) {
  return queryOne<AuditAssignment & RowDataPacket>(
    `SELECT ${SELECT_COLUMNS} ${JOINS} WHERE aa.id = ? AND aa.deleted_at IS NULL LIMIT 1`,
    [id]
  );
}

export async function findAssignmentByNumber(assignmentNumber: string) {
  return queryOne<{ id: number } & RowDataPacket>(
    'SELECT id FROM audit_assignments WHERE assignment_number = ? LIMIT 1',
    [assignmentNumber]
  );
}

export async function createAssignment(data: Record<string, unknown>, createdBy: number): Promise<number> {
  const columns = Object.keys(data);
  return insert(
    `INSERT INTO audit_assignments (${columns.join(', ')}, assigned_by, created_by, updated_by)
     VALUES (${columns.map(() => '?').join(', ')}, ?, ?, ?)`,
    [...columns.map((column) => data[column]), createdBy, createdBy, createdBy]
  );
}

export async function updateAssignment(id: number, data: Record<string, unknown>, updatedBy: number): Promise<number> {
  const columns = Object.keys(data);
  if (!columns.length) return 0;
  const result = await execute(
    `UPDATE audit_assignments SET ${columns.map((column) => `${column} = ?`).join(', ')}, updated_by = ?
      WHERE id = ? AND deleted_at IS NULL`,
    [...columns.map((column) => data[column]), updatedBy, id]
  );
  return result.affectedRows;
}

export async function softDeleteAssignment(id: number, deletedBy: number): Promise<number> {
  const result = await execute(
    `UPDATE audit_assignments SET deleted_at = NOW(), status = 'Cancelled', updated_by = ?
      WHERE id = ? AND deleted_at IS NULL`,
    [deletedBy, id]
  );
  return result.affectedRows;
}

/** Status changes keep the completion timestamp honest. */
export async function setStatus(id: number, status: string, updatedBy: number, extra: Record<string, unknown> = {}) {
  const data: Record<string, unknown> = { status, ...extra };
  const columns = Object.keys(data);
  const result = await execute(
    `UPDATE audit_assignments SET ${columns.map((column) => `${column} = ?`).join(', ')}, updated_by = ?
      WHERE id = ? AND deleted_at IS NULL`,
    [...columns.map((column) => data[column]), updatedBy, id]
  );
  return result.affectedRows;
}

/** Counters for the admin list header and the dashboard. */
export async function getAssignmentStats(employerId?: number) {
  const params: unknown[] = [];
  const scope = employerId ? 'AND employer_id = ?' : '';
  if (employerId) params.push(employerId);

  const row = await queryOne<RowDataPacket>(
    `SELECT
       COUNT(*) AS total,
       SUM(status = 'Not Started') AS not_started,
       SUM(status IN ('In Progress','Draft Saved')) AS in_progress,
       SUM(status IN ('Submitted','Under Review')) AS under_review,
       SUM(status = 'Approved') AS approved,
       SUM(status IN ('Rejected','Changes Requested')) AS returned,
       SUM(status = 'Cancelled') AS cancelled,
       SUM(due_date IS NOT NULL AND due_date < CURDATE() AND status NOT IN ('Approved','Cancelled')) AS overdue,
       SUM(status NOT IN ('Approved','Cancelled') AND due_date IS NOT NULL
           AND DATEDIFF(due_date, CURDATE()) BETWEEN 0 AND 7) AS due_this_week
     FROM audit_assignments
     WHERE deleted_at IS NULL ${scope}`,
    params
  );

  return {
    total: Number(row?.total ?? 0),
    notStarted: Number(row?.not_started ?? 0),
    inProgress: Number(row?.in_progress ?? 0),
    underReview: Number(row?.under_review ?? 0),
    approved: Number(row?.approved ?? 0),
    returned: Number(row?.returned ?? 0),
    cancelled: Number(row?.cancelled ?? 0),
    overdue: Number(row?.overdue ?? 0),
    dueThisWeek: Number(row?.due_this_week ?? 0),
  };
}

/** Auditor workload rows used when validating capacity before an assignment. */
export async function auditorWorkload(auditorId: number) {
  return queryOne<{ name: string; max_concurrent_audits: number; open_assignments: number } & RowDataPacket>(
    `SELECT a.name, a.max_concurrent_audits,
            (SELECT COUNT(*) FROM audit_assignments aa
              WHERE aa.auditor_id = a.id AND aa.deleted_at IS NULL
                AND aa.status NOT IN ('Approved','Cancelled')) AS open_assignments
       FROM auditors a WHERE a.id = ? AND a.deleted_at IS NULL LIMIT 1`,
    [auditorId]
  );
}

/** The auditor's assignment list, as consumed by the auditor workspace. */
export function listAssignmentsForAuditor(auditorId: number, status?: string) {
  const params: unknown[] = [auditorId];
  let extra = '';
  if (status && status !== 'all') {
    extra = ' AND aa.status = ?';
    params.push(status);
  }
  return query<AuditAssignment & RowDataPacket>(
    `SELECT ${SELECT_COLUMNS} ${JOINS}
      WHERE aa.deleted_at IS NULL AND aa.auditor_id = ?${extra}
      ORDER BY FIELD(aa.status, 'In Progress','Draft Saved','Not Started','Changes Requested','Submitted','Under Review','Approved','Rejected','Cancelled'),
               aa.due_date IS NULL, aa.due_date ASC`,
    params
  );
}

/** Everything assigned to a verifier, newest submission first. */
export function listAssignmentsForVerifier(verifierId: number, status?: string) {
  const params: unknown[] = [verifierId];
  let extra = '';
  if (status && status !== 'all') {
    extra = ' AND aa.status = ?';
    params.push(status);
  }
  return query<AuditAssignment & RowDataPacket>(
    `SELECT ${SELECT_COLUMNS} ${JOINS}
      WHERE aa.deleted_at IS NULL AND aa.verifier_id = ?${extra}
      ORDER BY FIELD(aa.status, 'Under Review','Submitted','Changes Requested','In Progress','Not Started','Approved','Rejected','Cancelled'),
               aa.due_date ASC`,
    params
  );
}

/**
 * Calendar rows for a month window: audit schedule plus the closing meeting,
 * which is when the employer has to have its records ready.
 */
export function assignmentsInWindow(from: string, to: string, employerId?: number) {
  const params: unknown[] = [from, to];
  let extra = '';
  if (employerId) {
    extra = ' AND aa.employer_id = ?';
    params.push(employerId);
  }
  return query<RowDataPacket>(
    `SELECT aa.id, aa.assignment_number, aa.audit_title, aa.status, aa.priority,
            aa.start_date, aa.end_date, aa.due_date, aa.audit_end_meeting_at, aa.progress_percent,
            e.company_name AS employer_name, a.name AS auditor_name, u.unit_name
       FROM audit_assignments aa
       LEFT JOIN employers e ON e.id = aa.employer_id
       LEFT JOIN auditors a ON a.id = aa.auditor_id
       LEFT JOIN company_units u ON u.id = aa.unit_id
      WHERE aa.deleted_at IS NULL
        AND (aa.start_date <= ? AND COALESCE(aa.due_date, aa.end_date, aa.start_date) >= ?)${extra}
      ORDER BY aa.start_date ASC`,
    [to, from]
  );
}

/** Timeline rows for the assignment detail page. */
export function assignmentHistory(assignmentId: number, limit = 50) {
  return query<RowDataPacket>(
    `SELECT al.id, al.action, al.description, al.user_name, al.user_role, al.created_at
       FROM activity_logs al
      WHERE al.entity_type = 'audit_assignment' AND al.entity_id = ?
      ORDER BY al.created_at DESC
      LIMIT ${Math.max(1, Math.min(limit, 200))}`,
    [assignmentId]
  );
}

export function assignmentFiles(assignmentId: number) {
  return query<RowDataPacket>(
    `SELECT f.id, f.original_name, f.mime_type, f.size_bytes, f.version, f.category, f.created_at,
            CONCAT(u.first_name, ' ', u.last_name) AS uploaded_by_name
       FROM files f
       LEFT JOIN users u ON u.id = f.uploaded_by
      WHERE f.entity_type = 'AUDIT_ASSIGNMENT' AND f.entity_id = ? AND f.deleted_at IS NULL
        AND f.is_current_version = 1
      ORDER BY f.created_at DESC`,
    [assignmentId]
  );
}

/**
 * Verifier list for the assignment form. `audit_assignments.verifier_id` points
 * at `users`, so the picker offers the active verifier-role accounts (an
 * administrator who also reviews can be granted the role and will appear here).
 */
export function verifierOptions(search?: string) {
  const params: unknown[] = [];
  let where = '';
  if (search?.trim()) {
    where = 'AND (CONCAT(u.first_name, " ", u.last_name) LIKE ? OR u.email LIKE ?)';
    const term = `%${search.trim()}%`;
    params.push(term, term);
  }
  return query<RowDataPacket>(
    `SELECT DISTINCT u.id, CONCAT(u.first_name, ' ', u.last_name) AS name, u.email,
            u.mobile,
            (SELECT COUNT(*) FROM audit_assignments aa
              WHERE aa.verifier_id = u.id AND aa.deleted_at IS NULL
                AND aa.status IN ('Submitted','Under Review')) AS pending_reviews
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles r ON r.id = ur.role_id
      WHERE r.slug = 'verifier' AND u.status = 'active' AND u.deleted_at IS NULL ${where}
      ORDER BY name ASC
      LIMIT 100`,
    params
  );
}
