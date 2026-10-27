/**
 * Auditor data access. Parameterised SQL only — no ORM, no interpolated input.
 * Assignment counters are computed with correlated subqueries so a list row can
 * show workload without a second round trip.
 */
import { execute, insert, query, queryOne, type RowDataPacket } from '@/lib/db/mysql';
import { buildPagination } from '@/lib/utils/pagination';
import type { Auditor, AuditorType } from '@/types/auditor';

export interface AuditorListRow extends Auditor {
  auditor_type_code?: string | null;
  reports_submitted?: number;
}

export interface AuditorListFilters {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  auditorTypeId?: number;
  specialization?: string;
  state?: string;
  employerId?: number;
  availableOnly?: boolean;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortDir?: string;
}

export interface AuditorStats {
  assignments: number;
  completed: number;
  pending: number;
  overdue: number;
  reportsSubmitted: number;
  averageRating: number | string | null;
  averageTurnaroundDays: number | string | null;
}

const SORTABLE = ['name', 'auditor_code', 'created_at', 'status', 'experience_years', 'rating', 'date_of_joining'] as const;

/** Assignment workload columns reused by the list and the detail query. */
const WORKLOAD_COLUMNS = `
  (SELECT COUNT(*) FROM audit_assignments aa WHERE aa.auditor_id = a.id AND aa.deleted_at IS NULL) AS total_assignments,
  (SELECT COUNT(*) FROM audit_assignments aa WHERE aa.auditor_id = a.id AND aa.deleted_at IS NULL
     AND aa.status IN ('Approved')) AS completed_assignments,
  (SELECT COUNT(*) FROM audit_assignments aa WHERE aa.auditor_id = a.id AND aa.deleted_at IS NULL
     AND aa.status NOT IN ('Approved','Cancelled')) AS pending_assignments,
  (SELECT COUNT(*) FROM audit_assignments aa WHERE aa.auditor_id = a.id AND aa.deleted_at IS NULL
     AND aa.status NOT IN ('Approved','Cancelled') AND aa.due_date IS NOT NULL AND aa.due_date < CURDATE()) AS overdue_assignments,
  (SELECT ROUND(AVG(DATEDIFF(aa.completed_at, aa.start_date)), 1) FROM audit_assignments aa
     WHERE aa.auditor_id = a.id AND aa.deleted_at IS NULL AND aa.completed_at IS NOT NULL AND aa.start_date IS NOT NULL)
     AS average_turnaround_days`;

export async function findAuditors(filters: AuditorListFilters) {
  const where: string[] = ['a.deleted_at IS NULL'];
  const params: unknown[] = [];

  if (filters.search) {
    where.push(`(
      a.name LIKE ? OR a.auditor_code LIKE ? OR a.email LIKE ? OR a.mobile LIKE ?
      OR a.city LIKE ? OR a.specialization LIKE ? OR a.role_title LIKE ?
    )`);
    const term = `%${filters.search}%`;
    params.push(term, term, term, term, term, term, term);
  }
  if (filters.status) {
    where.push('a.status = ?');
    params.push(filters.status);
  }
  if (filters.auditorTypeId) {
    where.push('a.auditor_type_id = ?');
    params.push(filters.auditorTypeId);
  }
  if (filters.specialization) {
    where.push('a.specialization = ?');
    params.push(filters.specialization);
  }
  if (filters.state) {
    where.push('a.state = ?');
    params.push(filters.state);
  }
  if (filters.employerId) {
    where.push('a.assigned_employer_id = ?');
    params.push(filters.employerId);
  }
  if (filters.availableOnly) {
    where.push(`a.status = 'active' AND (
      SELECT COUNT(*) FROM audit_assignments aa WHERE aa.auditor_id = a.id AND aa.deleted_at IS NULL
        AND aa.status NOT IN ('Approved','Cancelled')
    ) < a.max_concurrent_audits`);
  }
  if (filters.dateFrom) {
    where.push('DATE(a.created_at) >= ?');
    params.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    where.push('DATE(a.created_at) <= ?');
    params.push(filters.dateTo);
  }

  const whereSql = where.join(' AND ');
  const sortBy = SORTABLE.includes(filters.sortBy as (typeof SORTABLE)[number]) ? filters.sortBy : 'created_at';
  const sortDir = filters.sortDir === 'asc' ? 'ASC' : 'DESC';
  const limit = Math.min(Math.max(filters.limit ?? 10, 1), 200);
  const page = Math.max(filters.page ?? 1, 1);
  const offset = (page - 1) * limit;

  const totalRow = await queryOne<RowDataPacket>(
    `SELECT COUNT(*) AS total FROM auditors a WHERE ${whereSql}`,
    params
  );
  const total = Number(totalRow?.total ?? 0);

  const data = await query<Auditor & RowDataPacket>(
    `SELECT a.*, t.name AS auditor_type_name, t.code AS auditor_type_code,
            e.company_name AS employer_name,
            ${WORKLOAD_COLUMNS}
       FROM auditors a
       LEFT JOIN auditor_types t ON t.id = a.auditor_type_id
       LEFT JOIN employers e ON e.id = a.assigned_employer_id
      WHERE ${whereSql}
      ORDER BY a.${sortBy} ${sortDir}
      LIMIT ${limit} OFFSET ${offset}`,
    params
  );

  return { data, pagination: buildPagination(total, page, limit) };
}

export async function findAuditorById(id: number): Promise<Auditor | null> {
  return queryOne<Auditor & RowDataPacket>(
    `SELECT a.*, t.name AS auditor_type_name, t.code AS auditor_type_code,
            e.company_name AS employer_name,
            ${WORKLOAD_COLUMNS}
       FROM auditors a
       LEFT JOIN auditor_types t ON t.id = a.auditor_type_id
       LEFT JOIN employers e ON e.id = a.assigned_employer_id
      WHERE a.id = ? AND a.deleted_at IS NULL
      LIMIT 1`,
    [id]
  );
}

export async function findAuditorByCode(code: string, excludeId?: number): Promise<{ id: number } | null> {
  return queryOne<{ id: number } & RowDataPacket>(
    `SELECT id FROM auditors WHERE auditor_code = ? AND deleted_at IS NULL${excludeId ? ' AND id <> ?' : ''} LIMIT 1`,
    excludeId ? [code, excludeId] : [code]
  );
}

export async function findAuditorByEmail(email: string, excludeId?: number): Promise<{ id: number } | null> {
  return queryOne<{ id: number } & RowDataPacket>(
    `SELECT id FROM auditors WHERE email = ? AND deleted_at IS NULL${excludeId ? ' AND id <> ?' : ''} LIMIT 1`,
    excludeId ? [email, excludeId] : [email]
  );
}

export async function findAuditorByUserId(userId: number): Promise<Auditor | null> {
  return queryOne<Auditor & RowDataPacket>(
    'SELECT * FROM auditors WHERE user_id = ? AND deleted_at IS NULL LIMIT 1',
    [userId]
  );
}

export async function createAuditor(data: Record<string, unknown>, createdBy: number): Promise<number> {
  const columns = Object.keys(data);
  return insert(
    `INSERT INTO auditors (${columns.join(', ')}, created_by, updated_by)
     VALUES (${columns.map(() => '?').join(', ')}, ?, ?)`,
    [...columns.map((column) => data[column]), createdBy, createdBy]
  );
}

export async function updateAuditor(id: number, data: Record<string, unknown>, updatedBy: number): Promise<number> {
  const columns = Object.keys(data);
  if (!columns.length) return 0;
  const result = await execute(
    `UPDATE auditors SET ${columns.map((column) => `${column} = ?`).join(', ')}, updated_by = ?
      WHERE id = ? AND deleted_at IS NULL`,
    [...columns.map((column) => data[column]), updatedBy, id]
  );
  return result.affectedRows;
}

export async function softDeleteAuditor(id: number, deletedBy: number): Promise<number> {
  const result = await execute(
    `UPDATE auditors SET deleted_at = NOW(), status = 'inactive', updated_by = ?
      WHERE id = ? AND deleted_at IS NULL`,
    [deletedBy, id]
  );
  return result.affectedRows;
}

export async function getAuditorStats(auditorId: number): Promise<AuditorStats> {
  const row = await queryOne<RowDataPacket>(
    `SELECT
       (SELECT COUNT(*) FROM audit_assignments aa WHERE aa.auditor_id = ? AND aa.deleted_at IS NULL) AS assignments,
       (SELECT COUNT(*) FROM audit_assignments aa WHERE aa.auditor_id = ? AND aa.deleted_at IS NULL
          AND aa.status = 'Approved') AS completed,
       (SELECT COUNT(*) FROM audit_assignments aa WHERE aa.auditor_id = ? AND aa.deleted_at IS NULL
          AND aa.status NOT IN ('Approved','Cancelled')) AS pending,
       (SELECT COUNT(*) FROM audit_assignments aa WHERE aa.auditor_id = ? AND aa.deleted_at IS NULL
          AND aa.status NOT IN ('Approved','Cancelled') AND aa.due_date IS NOT NULL AND aa.due_date < CURDATE()) AS overdue,
       (SELECT COUNT(*) FROM audit_reports ar WHERE ar.auditor_id = ? AND ar.deleted_at IS NULL
          AND ar.status NOT IN ('Draft','Archived')) AS reportsSubmitted,
       COALESCE(
         (SELECT a2.rating FROM auditors a2 WHERE a2.id = ?),
         (SELECT ROUND(AVG(ar.score_percentage) / 20, 2) FROM audit_reports ar
            WHERE ar.auditor_id = ? AND ar.deleted_at IS NULL AND ar.score_percentage IS NOT NULL)
       ) AS averageRating,
       (SELECT ROUND(AVG(DATEDIFF(aa.completed_at, aa.start_date)), 1) FROM audit_assignments aa
          WHERE aa.auditor_id = ? AND aa.completed_at IS NOT NULL AND aa.start_date IS NOT NULL AND aa.deleted_at IS NULL)
          AS averageTurnaroundDays`,
    [auditorId, auditorId, auditorId, auditorId, auditorId, auditorId, auditorId, auditorId]
  );

  return {
    assignments: Number(row?.assignments ?? 0),
    completed: Number(row?.completed ?? 0),
    pending: Number(row?.pending ?? 0),
    overdue: Number(row?.overdue ?? 0),
    reportsSubmitted: Number(row?.reportsSubmitted ?? 0),
    averageRating: row?.averageRating ?? null,
    averageTurnaroundDays: row?.averageTurnaroundDays ?? null,
  };
}

/** Assignments for the auditor detail page, newest first. */
export function listAuditorAssignments(auditorId: number, limit = 50) {
  return query<RowDataPacket>(
    `SELECT aa.id, aa.assignment_number, aa.audit_title, aa.assignment_type, aa.status, aa.priority,
            aa.start_date, aa.end_date, aa.due_date, aa.progress_percent, aa.completed_at,
            e.company_name AS employer_name, u.unit_name
       FROM audit_assignments aa
       LEFT JOIN employers e ON e.id = aa.employer_id
       LEFT JOIN company_units u ON u.id = aa.unit_id
      WHERE aa.auditor_id = ? AND aa.deleted_at IS NULL
      ORDER BY aa.created_at DESC
      LIMIT ${Math.max(1, Math.min(limit, 200))}`,
    [auditorId]
  );
}

/** Employers this auditor has worked for — feeds the detail page's "clients" tab. */
export function listAuditorClients(auditorId: number) {
  return query<RowDataPacket>(
    `SELECT e.id, e.company_name, e.employer_code, e.city, e.state,
            COUNT(aa.id) AS assignment_count,
            SUM(CASE WHEN aa.status = 'Approved' THEN 1 ELSE 0 END) AS completed_count,
            MAX(aa.created_at) AS last_assigned_at
       FROM audit_assignments aa
       JOIN employers e ON e.id = aa.employer_id
      WHERE aa.auditor_id = ? AND aa.deleted_at IS NULL AND e.deleted_at IS NULL
      GROUP BY e.id, e.company_name, e.employer_code, e.city, e.state
      ORDER BY last_assigned_at DESC`,
    [auditorId]
  );
}

/** Documents filed against the auditor (licences, certificates, ID proofs). */
export function listAuditorDocuments(auditorId: number) {
  return query<RowDataPacket>(
    `SELECT f.id, f.original_name, f.mime_type, f.size_bytes, f.version, f.category, f.created_at,
            CONCAT(u.first_name, ' ', u.last_name) AS uploaded_by_name
       FROM files f
       LEFT JOIN users u ON u.id = f.uploaded_by
      WHERE f.entity_type = 'AUDITOR' AND f.entity_id = ? AND f.deleted_at IS NULL AND f.is_current_version = 1
      ORDER BY f.created_at DESC`,
    [auditorId]
  );
}

export function auditorOptions(search?: string, limit = 50) {
  const params: unknown[] = [];
  let where = "a.deleted_at IS NULL AND a.status = 'active'";
  if (search) {
    where += ' AND (a.name LIKE ? OR a.auditor_code LIKE ? OR a.email LIKE ?)';
    const term = `%${search}%`;
    params.push(term, term, term);
  }
  return query<RowDataPacket>(
    `SELECT a.id, a.auditor_code, a.name, a.email, a.specialization, a.max_concurrent_audits,
            t.name AS auditor_type_name,
            (SELECT COUNT(*) FROM audit_assignments aa WHERE aa.auditor_id = a.id AND aa.deleted_at IS NULL
               AND aa.status NOT IN ('Approved','Cancelled')) AS open_assignments
       FROM auditors a
       LEFT JOIN auditor_types t ON t.id = a.auditor_type_id
      WHERE ${where}
      ORDER BY a.name ASC
      LIMIT ${Math.max(1, Math.min(limit, 200))}`,
    params
  );
}

export async function countAuditorsByStatus() {
  return query<RowDataPacket>(
    `SELECT status, COUNT(*) AS total FROM auditors WHERE deleted_at IS NULL GROUP BY status`
  );
}

/* ------------------------------------------------------------ auditor types */

export async function findAuditorTypes(filters: { search?: string; status?: string } = {}) {
  const where: string[] = ['t.deleted_at IS NULL'];
  const params: unknown[] = [];

  if (filters.search) {
    where.push('(t.name LIKE ? OR t.code LIKE ? OR t.specialization LIKE ?)');
    const term = `%${filters.search}%`;
    params.push(term, term, term);
  }
  if (filters.status) {
    where.push('t.status = ?');
    params.push(filters.status);
  }

  return query<AuditorType & RowDataPacket>(
    `SELECT t.*,
            (SELECT COUNT(*) FROM auditors a WHERE a.auditor_type_id = t.id AND a.deleted_at IS NULL) AS auditor_count,
            (SELECT COUNT(*) FROM auditor_type_modules atm JOIN dynamic_modules m ON m.id = atm.module_id AND m.deleted_at IS NULL
              WHERE atm.auditor_type_id = t.id) AS module_count
       FROM auditor_types t
      WHERE ${where.join(' AND ')}
      ORDER BY t.name ASC`,
    params
  );
}

export async function findAuditorTypeById(id: number): Promise<AuditorType | null> {
  return queryOne<AuditorType & RowDataPacket>(
    'SELECT * FROM auditor_types WHERE id = ? AND deleted_at IS NULL LIMIT 1',
    [id]
  );
}

export async function findAuditorTypeByCode(code: string, excludeId?: number): Promise<{ id: number } | null> {
  return queryOne<{ id: number } & RowDataPacket>(
    `SELECT id FROM auditor_types WHERE code = ? AND deleted_at IS NULL${excludeId ? ' AND id <> ?' : ''} LIMIT 1`,
    excludeId ? [code, excludeId] : [code]
  );
}

export async function createAuditorType(data: Record<string, unknown>): Promise<number> {
  const columns = Object.keys(data);
  return insert(
    `INSERT INTO auditor_types (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    columns.map((column) => data[column])
  );
}

export async function updateAuditorType(id: number, data: Record<string, unknown>): Promise<number> {
  const columns = Object.keys(data);
  if (!columns.length) return 0;
  const result = await execute(
    `UPDATE auditor_types SET ${columns.map((column) => `${column} = ?`).join(', ')}
      WHERE id = ? AND deleted_at IS NULL`,
    [...columns.map((column) => data[column]), id]
  );
  return result.affectedRows;
}

export async function softDeleteAuditorType(id: number): Promise<number> {
  const result = await execute(
    'UPDATE auditor_types SET deleted_at = NOW(), status = ? WHERE id = ? AND deleted_at IS NULL',
    ['inactive', id]
  );
  return result.affectedRows;
}
