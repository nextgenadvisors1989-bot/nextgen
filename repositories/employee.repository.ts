/**
 * Employee data access. One file per aggregate: list, detail, child tables,
 * lookup options, statistics. Pure parameterised SQL — no ORM.
 */
import { execute, insert, query, queryOne, type RowDataPacket } from '@/lib/db/mysql';
import { buildPagination } from '@/lib/utils/pagination';
import type { Employee } from '@/types/employee';

export interface EmployeeListFilters {
  page?: number;
  limit?: number;
  search?: string;
  employerId?: number;
  unitId?: number;
  departmentId?: number;
  status?: string;
  category?: string;
  designation?: string;
  state?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortDir?: string;
}

export interface EmployeeListRow extends Employee {
  employer_name: string;
  employer_code: string;
  unit_name: string | null;
  department_name: string | null;
  documents_count: number;
  checklist_done: number;
  has_login: number;
}

const SORTABLE = ['name', 'employee_number', 'date_of_joining', 'created_at', 'gross_salary', 'status'] as const;

export async function findEmployees(filters: EmployeeListFilters) {
  const where: string[] = ['e.deleted_at IS NULL'];
  const params: unknown[] = [];

  if (filters.search) {
    where.push(`(
      e.name LIKE ? OR e.employee_number LIKE ? OR e.mobile LIKE ? OR e.email LIKE ?
      OR e.aadhaar_number LIKE ? OR e.designation LIKE ? OR e.pf_number LIKE ? OR e.esi_number LIKE ?
    )`);
    const term = `%${filters.search}%`;
    params.push(term, term, term, term, term, term, term, term);
  }
  if (filters.employerId) { where.push('e.employer_id = ?'); params.push(filters.employerId); }
  if (filters.unitId) { where.push('e.unit_id = ?'); params.push(filters.unitId); }
  if (filters.departmentId) { where.push('e.department_id = ?'); params.push(filters.departmentId); }
  if (filters.status) { where.push('e.status = ?'); params.push(filters.status); }
  if (filters.category) { where.push('e.category = ?'); params.push(filters.category); }
  if (filters.designation) { where.push('e.designation = ?'); params.push(filters.designation); }
  if (filters.state) { where.push('e.state = ?'); params.push(filters.state); }
  if (filters.dateFrom) { where.push('DATE(e.date_of_joining) >= ?'); params.push(filters.dateFrom); }
  if (filters.dateTo) { where.push('DATE(e.date_of_joining) <= ?'); params.push(filters.dateTo); }

  const whereSql = where.join(' AND ');
  const sortBy = SORTABLE.includes(filters.sortBy as typeof SORTABLE[number]) ? filters.sortBy : 'created_at';
  const sortDir = filters.sortDir === 'asc' ? 'ASC' : 'DESC';
  const limit = Math.min(Math.max(filters.limit ?? 10, 1), 200);
  const page = Math.max(filters.page ?? 1, 1);
  const offset = (page - 1) * limit;

  const totalRow = await queryOne<RowDataPacket>(`SELECT COUNT(*) AS total FROM employees e WHERE ${whereSql}`, params);
  const total = Number(totalRow?.total ?? 0);

  const data = await query<EmployeeListRow & RowDataPacket>(
    `SELECT e.*,
            emp.company_name AS employer_name,
            emp.employer_code,
            u.unit_name,
            d.department_name,
            (SELECT COUNT(*) FROM employee_documents ed WHERE ed.employee_id = e.id AND ed.deleted_at IS NULL) AS documents_count,
            (SELECT COUNT(*) FROM employee_file_checklist fc WHERE fc.employee_id = e.id AND fc.is_checked = 1) AS checklist_done,
            (e.user_id IS NOT NULL) AS has_login
       FROM employees e
       JOIN employers emp ON emp.id = e.employer_id
       LEFT JOIN company_units u ON u.id = e.unit_id
       LEFT JOIN departments d ON d.id = e.department_id
      WHERE ${whereSql}
      ORDER BY e.${sortBy} ${sortDir}
      LIMIT ${limit} OFFSET ${offset}`,
    params
  );

  return { data, pagination: buildPagination(total, page, limit) };
}

export async function findEmployeeById(id: number): Promise<(EmployeeListRow & RowDataPacket) | null> {
  return queryOne<EmployeeListRow & RowDataPacket>(
    `SELECT e.*,
            emp.company_name AS employer_name,
            emp.employer_code,
            u.unit_name,
            d.department_name,
            (SELECT COUNT(*) FROM employee_documents ed WHERE ed.employee_id = e.id AND ed.deleted_at IS NULL) AS documents_count,
            (SELECT COUNT(*) FROM employee_file_checklist fc WHERE fc.employee_id = e.id AND fc.is_checked = 1) AS checklist_done,
            (e.user_id IS NOT NULL) AS has_login
       FROM employees e
       JOIN employers emp ON emp.id = e.employer_id
       LEFT JOIN company_units u ON u.id = e.unit_id
       LEFT JOIN departments d ON d.id = e.department_id
      WHERE e.id = ? AND e.deleted_at IS NULL
      LIMIT 1`,
    [id]
  );
}

export async function findEmployeeScoped(id: number, employerId: number) {
  return queryOne<RowDataPacket>(
    'SELECT id, employer_id, name, employee_number, user_id FROM employees WHERE id = ? AND employer_id = ? AND deleted_at IS NULL LIMIT 1',
    [id, employerId]
  );
}

export async function employeeNumberExists(employeeNumber: string, excludeId?: number): Promise<boolean> {
  const row = await queryOne<RowDataPacket>(
    `SELECT id FROM employees WHERE employee_number = ? AND deleted_at IS NULL ${excludeId ? 'AND id <> ?' : ''} LIMIT 1`,
    excludeId ? [employeeNumber, excludeId] : [employeeNumber]
  );
  return Boolean(row);
}

export async function aadhaarExists(aadhaar: string, excludeId?: number): Promise<boolean> {
  const row = await queryOne<RowDataPacket>(
    `SELECT id FROM employees WHERE aadhaar_number = ? AND deleted_at IS NULL ${excludeId ? 'AND id <> ?' : ''} LIMIT 1`,
    excludeId ? [aadhaar, excludeId] : [aadhaar]
  );
  return Boolean(row);
}

export async function createEmployee(data: Record<string, unknown>, createdBy: number): Promise<number> {
  const columns = Object.keys(data);
  return insert(
    `INSERT INTO employees (${columns.join(', ')}, created_by, updated_by)
     VALUES (${columns.map(() => '?').join(', ')}, ?, ?)`,
    [...columns.map((column) => data[column]), createdBy, createdBy]
  );
}

export async function updateEmployee(id: number, data: Record<string, unknown>, updatedBy: number): Promise<number> {
  const columns = Object.keys(data);
  if (!columns.length) return 0;
  const result = await execute(
    `UPDATE employees SET ${columns.map((c) => `${c} = ?`).join(', ')}, updated_by = ?
      WHERE id = ? AND deleted_at IS NULL`,
    [...columns.map((column) => data[column]), updatedBy, id]
  );
  return result.affectedRows;
}

/** Soft delete — payroll, attendance and statutory history must survive. */
export async function softDeleteEmployee(id: number, deletedBy: number): Promise<number> {
  const result = await execute(
    `UPDATE employees SET deleted_at = NOW(), status = 'inactive', updated_by = ? WHERE id = ? AND deleted_at IS NULL`,
    [deletedBy, id]
  );
  return result.affectedRows;
}

/** Reopens an archived employee; the login is re-activated by the service. */
export async function restoreEmployee(id: number, updatedBy: number): Promise<number> {
  const result = await execute(
    "UPDATE employees SET deleted_at = NULL, status = 'active', updated_by = ? WHERE id = ? AND deleted_at IS NOT NULL",
    [updatedBy, id]
  );
  return result.affectedRows;
}

/**
 * The few columns needed to audit a restore. Archived rows are included on
 * request, because `findEmployeeById` (rightly) hides them.
 */
export async function findEmployeeForRestore(id: number) {
  return queryOne<
    { id: number; employer_id: number; user_id: number | null; name: string; employee_number: string; deleted_at: string | null } & RowDataPacket
  >(
    'SELECT id, employer_id, user_id, name, employee_number, deleted_at FROM employees WHERE id = ? LIMIT 1',
    [id]
  );
}

export async function countEmployees(where: { employerId?: number } = {}) {
  const condition = where.employerId ? 'employer_id = ? AND deleted_at IS NULL' : 'deleted_at IS NULL';
  const params = where.employerId ? [where.employerId] : [];
  const rows = await query<{ status: string; total: number } & RowDataPacket>(
    `SELECT status, COUNT(*) AS total FROM employees WHERE ${condition} GROUP BY status`,
    params
  );
  const byStatus = Object.fromEntries(rows.map((row) => [row.status, Number(row.total)]));
  return {
    total: rows.reduce((acc, row) => acc + Number(row.total), 0),
    byStatus,
    active: byStatus.active ?? 0,
  };
}

export async function getEmployeeStats(employeeId: number) {
  const row = await queryOne<RowDataPacket>(
    `SELECT
       (SELECT COUNT(*) FROM employee_documents WHERE employee_id = ? AND deleted_at IS NULL) AS documents,
       (SELECT COUNT(*) FROM employee_qualifications WHERE employee_id = ? AND deleted_at IS NULL) AS qualifications,
       (SELECT COUNT(*) FROM employee_experience WHERE employee_id = ? AND deleted_at IS NULL) AS experience,
       (SELECT COUNT(*) FROM employee_dependents WHERE employee_id = ? AND deleted_at IS NULL) AS dependents,
       (SELECT COUNT(*) FROM employee_references WHERE employee_id = ? AND deleted_at IS NULL) AS references_count,
       (SELECT COUNT(*) FROM employee_nominees WHERE employee_id = ? AND deleted_at IS NULL) AS nominees,
       (SELECT COUNT(*) FROM employee_file_checklist WHERE employee_id = ? AND is_checked = 1) AS checklist_done,
       (SELECT COUNT(*) FROM personal_file_checklist_items) AS checklist_total,
       (SELECT COUNT(*) FROM attendance WHERE employee_id = ? AND deleted_at IS NULL
          AND MONTH(attendance_date) = MONTH(CURDATE()) AND YEAR(attendance_date) = YEAR(CURDATE())) AS attendance_this_month,
       (SELECT COUNT(*) FROM leave_applications WHERE employee_id = ? AND deleted_at IS NULL AND status = 'pending') AS pending_leaves,
       (SELECT COUNT(*) FROM payslips WHERE employee_id = ? AND deleted_at IS NULL AND is_published = 1) AS payslips,
       (SELECT COALESCE(SUM(net_pay), 0) FROM payslips WHERE employee_id = ? AND deleted_at IS NULL) AS lifetime_net_pay`,
    Array.from({ length: 11 }, () => employeeId)
  );

  return {
    documents: Number(row?.documents ?? 0),
    qualifications: Number(row?.qualifications ?? 0),
    experience: Number(row?.experience ?? 0),
    dependents: Number(row?.dependents ?? 0),
    references: Number(row?.referencesCount ?? 0),
    nominees: Number(row?.nominees ?? 0),
    checklistDone: Number(row?.checklist_done ?? 0),
    checklistTotal: Number(row?.checklist_total ?? 0),
    attendanceThisMonth: Number(row?.attendance_this_month ?? 0),
    pendingLeaves: Number(row?.pending_leaves ?? 0),
    payslips: Number(row?.payslips ?? 0),
    lifetimeNetPay: Number(row?.lifetime_net_pay ?? 0),
  };
}

// ── Child tables ─────────────────────────────────────────────────────────

export async function listQualifications(employeeId: number) {
  return query<RowDataPacket>(
    `SELECT * FROM employee_qualifications WHERE employee_id = ? AND deleted_at IS NULL ORDER BY year_of_passing DESC, id DESC`,
    [employeeId]
  );
}

export async function listExperience(employeeId: number) {
  return query<RowDataPacket>(
    `SELECT * FROM employee_experience WHERE employee_id = ? AND deleted_at IS NULL ORDER BY date_from DESC, id DESC`,
    [employeeId]
  );
}

export async function listDependents(employeeId: number) {
  return query<RowDataPacket>(
    `SELECT * FROM employee_dependents WHERE employee_id = ? AND deleted_at IS NULL ORDER BY date_of_birth ASC, id ASC`,
    [employeeId]
  );
}

export async function listReferences(employeeId: number) {
  return query<RowDataPacket>(
    `SELECT * FROM employee_references WHERE employee_id = ? AND deleted_at IS NULL ORDER BY id ASC`,
    [employeeId]
  );
}

export async function listNominees(employeeId: number) {
  return query<RowDataPacket>(
    `SELECT * FROM employee_nominees WHERE employee_id = ? AND deleted_at IS NULL ORDER BY form_type ASC, id ASC`,
    [employeeId]
  );
}

export async function listServiceRecords(employeeId: number) {
  return query<RowDataPacket>(
    `SELECT * FROM employee_service_records WHERE employee_id = ? AND deleted_at IS NULL ORDER BY date_from DESC, id DESC`,
    [employeeId]
  );
}

export async function listDocuments(employeeId: number) {
  return query<RowDataPacket>(
    `SELECT ed.*, f.original_name, f.stored_name, f.mime_type, f.size_bytes, f.uuid AS file_uuid,
              f.access_level, f.download_count
       FROM employee_documents ed
       LEFT JOIN files f ON f.id = ed.file_id
      WHERE ed.employee_id = ? AND ed.deleted_at IS NULL
      ORDER BY ed.created_at DESC`,
    [employeeId]
  );
}

export async function listChecklist(employeeId: number) {
  return query<RowDataPacket>(
    `SELECT fc.id AS id, ci.id AS item_id, ci.item_code, ci.item_label, ci.sort_order, ci.is_mandatory,
            COALESCE(fc.is_checked, 0) AS is_checked, fc.checked_at, fc.remarks
       FROM personal_file_checklist_items ci
       LEFT JOIN employee_file_checklist fc ON fc.item_id = ci.id AND fc.employee_id = ?
      ORDER BY ci.sort_order ASC`,
    [employeeId]
  );
}

export async function findInterview(employeeId: number) {
  return queryOne<RowDataPacket>(
    'SELECT * FROM employee_interviews WHERE employee_id = ? AND deleted_at IS NULL ORDER BY id DESC LIMIT 1',
    [employeeId]
  );
}

export async function getSalaryStructure(employeeId: number) {
  return queryOne<RowDataPacket>(
    `SELECT * FROM salary_structures WHERE employee_id = ? AND deleted_at IS NULL AND is_active = 1
      ORDER BY effective_from DESC, id DESC LIMIT 1`,
    [employeeId]
  );
}

// ── Options for pickers ──────────────────────────────────────────────────

export async function employeeOptions(search?: string, employerId?: number, limit = 50) {
  const where = ['e.deleted_at IS NULL'];
  const params: unknown[] = [];
  if (employerId) { where.push('e.employer_id = ?'); params.push(employerId); }
  if (search?.trim()) {
    where.push('(e.name LIKE ? OR e.employee_number LIKE ? OR e.mobile LIKE ?)');
    const term = `%${search.trim()}%`;
    params.push(term, term, term);
  }
  const rows = await query<RowDataPacket>(
    `SELECT e.id, e.name, e.employee_number, e.designation, emp.company_name
       FROM employees e
       JOIN employers emp ON emp.id = e.employer_id
      WHERE ${where.join(' AND ')}
      ORDER BY e.name ASC
      LIMIT ${Math.min(limit, 100)}`,
    params
  );
  return rows.map((row) => ({
    value: String(row.id),
    label: String(row.name),
    hint: [row.employee_number, row.designation, row.company_name].filter(Boolean).join(' · '),
  }));
}

export async function distinctDesignations(employerId?: number) {
  const params: unknown[] = [];
  let where = 'deleted_at IS NULL AND designation IS NOT NULL AND designation <> ""';
  if (employerId) { where += ' AND employer_id = ?'; params.push(employerId); }
  const rows = await query<RowDataPacket>(
    `SELECT DISTINCT designation FROM employees WHERE ${where} ORDER BY designation ASC LIMIT 100`,
    params
  );
  return rows.map((row) => String(row.designation));
}

export async function checklistItems() {
  return query<RowDataPacket>('SELECT id, item_code, item_label, sort_order, is_mandatory FROM personal_file_checklist_items ORDER BY sort_order ASC');
}

export { execute };
