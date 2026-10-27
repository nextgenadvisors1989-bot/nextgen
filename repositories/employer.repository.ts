/**
 * Employer data access. Every statement here is parameterised SQL — no ORM, no
 * string interpolation of user input anywhere in this layer.
 */
import { execute, insert, query, queryOne, transaction, type RowDataPacket } from '@/lib/db/mysql';
import { buildPagination } from '@/lib/utils/pagination';
import type { CompanyUnit, Department, Employer, EmployerStats } from '@/types/employer';

export interface EmployerListFilters {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  industry?: string;
  state?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortDir?: string;
}

const SORTABLE = ['company_name', 'employer_code', 'created_at', 'status', 'city'] as const;

export async function findEmployers(filters: EmployerListFilters) {
  const where: string[] = ['e.deleted_at IS NULL'];
  const params: unknown[] = [];

  if (filters.search) {
    where.push(`(
      e.company_name LIKE ? OR e.employer_code LIKE ? OR e.email LIKE ?
      OR e.city LIKE ? OR e.contact_person_name LIKE ? OR e.mobile LIKE ?
    )`);
    const term = `%${filters.search}%`;
    params.push(term, term, term, term, term, term);
  }
  if (filters.status) {
    where.push('e.status = ?');
    params.push(filters.status);
  }
  if (filters.industry) {
    where.push('e.industry_type = ?');
    params.push(filters.industry);
  }
  if (filters.state) {
    where.push('e.state = ?');
    params.push(filters.state);
  }
  if (filters.dateFrom) {
    where.push('DATE(e.created_at) >= ?');
    params.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    where.push('DATE(e.created_at) <= ?');
    params.push(filters.dateTo);
  }

  const whereSql = where.join(' AND ');
  const sortBy = SORTABLE.includes(filters.sortBy as typeof SORTABLE[number]) ? filters.sortBy : 'created_at';
  const sortDir = filters.sortDir === 'asc' ? 'ASC' : 'DESC';
  const limit = Math.min(Math.max(filters.limit ?? 10, 1), 200);
  const page = Math.max(filters.page ?? 1, 1);
  const offset = (page - 1) * limit;

  const totalRow = await queryOne<RowDataPacket>(`SELECT COUNT(*) AS total FROM employers e WHERE ${whereSql}`, params);
  const total = Number(totalRow?.total ?? 0);

  const data = await query<Employer & RowDataPacket>(
    `SELECT e.*,
            (SELECT COUNT(*) FROM company_units u WHERE u.employer_id = e.id AND u.deleted_at IS NULL) AS unit_count,
            (SELECT COUNT(*) FROM employees emp WHERE emp.employer_id = e.id AND emp.deleted_at IS NULL) AS employee_count,
            (SELECT COUNT(*) FROM audit_assignments aa WHERE aa.employer_id = e.id AND aa.deleted_at IS NULL) AS audit_count,
            (SELECT COUNT(*) FROM audit_assignments aa WHERE aa.employer_id = e.id AND aa.deleted_at IS NULL
              AND aa.status NOT IN ('Approved','Cancelled')) AS pending_audit_count,
            (SELECT COUNT(*) FROM compliance_documents cd WHERE cd.employer_id = e.id AND cd.deleted_at IS NULL
              AND cd.expiry_date IS NOT NULL AND DATEDIFF(cd.expiry_date, CURDATE()) BETWEEN 0 AND 90) AS expiring_document_count
       FROM employers e
      WHERE ${whereSql}
      ORDER BY e.${sortBy} ${sortDir}
      LIMIT ${limit} OFFSET ${offset}`,
    params
  );

  return { data, pagination: buildPagination(total, page, limit) };
}

export async function findEmployerById(id: number): Promise<Employer | null> {
  return queryOne<Employer & RowDataPacket>(
    `SELECT e.*,
            (SELECT COUNT(*) FROM company_units u WHERE u.employer_id = e.id AND u.deleted_at IS NULL) AS unit_count,
            (SELECT COUNT(*) FROM employees emp WHERE emp.employer_id = e.id AND emp.deleted_at IS NULL) AS employee_count,
            (SELECT COUNT(*) FROM audit_assignments aa WHERE aa.employer_id = e.id AND aa.deleted_at IS NULL) AS audit_count
       FROM employers e
      WHERE e.id = ? AND e.deleted_at IS NULL
      LIMIT 1`,
    [id]
  );
}

export async function findEmployerByCode(code: string): Promise<{ id: number } | null> {
  return queryOne<{ id: number } & RowDataPacket>(
    'SELECT id FROM employers WHERE employer_code = ? AND deleted_at IS NULL LIMIT 1',
    [code]
  );
}

export async function findEmployerByUuid(uuid: string): Promise<Employer | null> {
  return queryOne<Employer & RowDataPacket>('SELECT * FROM employers WHERE uuid = ? AND deleted_at IS NULL LIMIT 1', [uuid]);
}

export async function createEmployer(data: Record<string, unknown>, createdBy: number): Promise<number> {
  const columns = Object.keys(data);
  const placeholders = columns.map(() => '?').join(', ');
  return insert(
    `INSERT INTO employers (${columns.join(', ')}, created_by, updated_by)
     VALUES (${placeholders}, ?, ?)`,
    [...columns.map((column) => data[column]), createdBy, createdBy]
  );
}

export async function updateEmployer(id: number, data: Record<string, unknown>, updatedBy: number): Promise<number> {
  const columns = Object.keys(data);
  if (columns.length === 0) return 0;
  const assignments = columns.map((column) => `${column} = ?`).join(', ');
  const result = await execute(
    `UPDATE employers SET ${assignments}, updated_by = ? WHERE id = ? AND deleted_at IS NULL`,
    [...columns.map((column) => data[column]), updatedBy, id]
  );
  return result.affectedRows;
}

/** Soft delete — employer history (audits, payroll, employees) must remain intact. */
export async function softDeleteEmployer(id: number, deletedBy: number): Promise<number> {
  const result = await execute(
    'UPDATE employers SET deleted_at = NOW(), status = ?, updated_by = ? WHERE id = ? AND deleted_at IS NULL',
    ['inactive', deletedBy, id]
  );
  return result.affectedRows;
}

export async function restoreEmployer(id: number): Promise<number> {
  const result = await execute('UPDATE employers SET deleted_at = NULL, status = ? WHERE id = ?', ['active', id]);
  return result.affectedRows;
}

export async function countEmployersByStatus() {
  const rows = await query<{ status: string; total: number } & RowDataPacket>(
    `SELECT status, COUNT(*) AS total FROM employers WHERE deleted_at IS NULL GROUP BY status`
  );
  const map = new Map(rows.map((row) => [row.status, Number(row.total)]));
  return { active: map.get('active') ?? 0, inactive: map.get('inactive') ?? 0, total: rows.reduce((acc, r) => acc + Number(r.total), 0) };
}

export async function getEmployerStats(employerId: number): Promise<EmployerStats> {
  const row = await queryOne<RowDataPacket>(
    `SELECT
       (SELECT COUNT(*) FROM company_units WHERE employer_id = ? AND deleted_at IS NULL) AS totalUnits,
       (SELECT COUNT(*) FROM departments WHERE employer_id = ? AND deleted_at IS NULL) AS totalDepartments,
       (SELECT COUNT(*) FROM employees WHERE employer_id = ? AND deleted_at IS NULL) AS totalEmployees,
       (SELECT COUNT(*) FROM employees WHERE employer_id = ? AND deleted_at IS NULL AND status = 'active') AS activeEmployees,
       (SELECT COUNT(*) FROM audit_assignments WHERE employer_id = ? AND deleted_at IS NULL) AS totalAudits,
       (SELECT COUNT(*) FROM audit_assignments WHERE employer_id = ? AND deleted_at IS NULL AND status = 'Approved') AS completedAudits,
       (SELECT COUNT(*) FROM audit_assignments WHERE employer_id = ? AND deleted_at IS NULL AND status NOT IN ('Approved','Cancelled')) AS pendingAudits,
       (SELECT COUNT(*) FROM compliance_documents WHERE employer_id = ? AND deleted_at IS NULL) AS complianceDocuments,
       (SELECT COUNT(*) FROM compliance_documents WHERE employer_id = ? AND deleted_at IS NULL AND expiry_date IS NOT NULL AND expiry_date < CURDATE()) AS expiredDocuments,
       (SELECT COUNT(*) FROM compliance_documents WHERE employer_id = ? AND deleted_at IS NULL AND expiry_date IS NOT NULL AND DATEDIFF(expiry_date, CURDATE()) BETWEEN 0 AND 90) AS expiringSoonDocuments`,
    Array.from({ length: 10 }, () => employerId)
  );

  return {
    totalUnits: Number(row?.totalUnits ?? 0),
    totalDepartments: Number(row?.totalDepartments ?? 0),
    totalEmployees: Number(row?.totalEmployees ?? 0),
    activeEmployees: Number(row?.activeEmployees ?? 0),
    totalAudits: Number(row?.totalAudits ?? 0),
    completedAudits: Number(row?.completedAudits ?? 0),
    pendingAudits: Number(row?.pendingAudits ?? 0),
    complianceDocuments: Number(row?.complianceDocuments ?? 0),
    expiredDocuments: Number(row?.expiredDocuments ?? 0),
    expiringSoonDocuments: Number(row?.expiringSoonDocuments ?? 0),
  };
}

// ── Company units ────────────────────────────────────────────────────────

export async function findUnits(employerId: number, filters: { search?: string; status?: string } = {}) {
  const where = ['employer_id = ?', 'deleted_at IS NULL'];
  const params: unknown[] = [employerId];
  if (filters.search) {
    where.push('(unit_name LIKE ? OR unit_code LIKE ? OR location LIKE ?)');
    const term = `%${filters.search}%`;
    params.push(term, term, term);
  }
  if (filters.status) {
    where.push('status = ?');
    params.push(filters.status);
  }
  return query<CompanyUnit & RowDataPacket>(
    `SELECT * FROM company_units WHERE ${where.join(' AND ')} ORDER BY unit_name ASC`,
    params
  );
}

export async function findUnitById(id: number, employerId?: number) {
  return queryOne<CompanyUnit & RowDataPacket>(
    `SELECT * FROM company_units WHERE id = ? AND deleted_at IS NULL ${employerId ? 'AND employer_id = ?' : ''} LIMIT 1`,
    employerId ? [id, employerId] : [id]
  );
}

export async function createUnit(employerId: number, data: Record<string, unknown>): Promise<number> {
  const columns = Object.keys(data);
  return insert(
    `INSERT INTO company_units (employer_id, ${columns.join(', ')}) VALUES (?, ${columns.map(() => '?').join(', ')})`,
    [employerId, ...columns.map((column) => data[column])]
  );
}

export async function updateUnit(id: number, data: Record<string, unknown>): Promise<number> {
  const columns = Object.keys(data);
  if (!columns.length) return 0;
  const result = await execute(
    `UPDATE company_units SET ${columns.map((c) => `${c} = ?`).join(', ')} WHERE id = ? AND deleted_at IS NULL`,
    [...columns.map((column) => data[column]), id]
  );
  return result.affectedRows;
}

export async function softDeleteUnit(id: number): Promise<number> {
  const result = await execute('UPDATE company_units SET deleted_at = NOW() WHERE id = ?', [id]);
  return result.affectedRows;
}

/** Keeps employers.number_of_units accurate after unit changes. */
export async function syncUnitCount(employerId: number): Promise<void> {
  await execute(
    `UPDATE employers e
        SET e.number_of_units = (SELECT COUNT(*) FROM company_units u WHERE u.employer_id = e.id AND u.deleted_at IS NULL)
      WHERE e.id = ?`,
    [employerId]
  );
}

// ── Departments ──────────────────────────────────────────────────────────

export async function findDepartments(employerId: number, filters: { search?: string; status?: string; unitId?: number } = {}) {
  const where = ['d.employer_id = ?', 'd.deleted_at IS NULL'];
  const params: unknown[] = [employerId];
  if (filters.search) {
    where.push('(d.department_name LIKE ? OR d.department_code LIKE ? OR d.head_of_department LIKE ?)');
    const term = `%${filters.search}%`;
    params.push(term, term, term);
  }
  if (filters.status) {
    where.push('d.status = ?');
    params.push(filters.status);
  }
  if (filters.unitId) {
    where.push('d.unit_id = ?');
    params.push(filters.unitId);
  }
  return query<Department & RowDataPacket>(
    `SELECT d.*, u.unit_name
       FROM departments d
       LEFT JOIN company_units u ON u.id = d.unit_id
      WHERE ${where.join(' AND ')}
      ORDER BY d.department_name ASC`,
    params
  );
}

export async function findDepartmentById(id: number, employerId?: number) {
  return queryOne<Department & RowDataPacket>(
    `SELECT * FROM departments WHERE id = ? AND deleted_at IS NULL ${employerId ? 'AND employer_id = ?' : ''} LIMIT 1`,
    employerId ? [id, employerId] : [id]
  );
}

export async function createDepartment(employerId: number, data: Record<string, unknown>): Promise<number> {
  const columns = Object.keys(data);
  return insert(
    `INSERT INTO departments (employer_id, ${columns.join(', ')}) VALUES (?, ${columns.map(() => '?').join(', ')})`,
    [employerId, ...columns.map((column) => data[column])]
  );
}

export async function updateDepartment(id: number, data: Record<string, unknown>): Promise<number> {
  const columns = Object.keys(data);
  if (!columns.length) return 0;
  const result = await execute(
    `UPDATE departments SET ${columns.map((c) => `${c} = ?`).join(', ')} WHERE id = ? AND deleted_at IS NULL`,
    [...columns.map((column) => data[column]), id]
  );
  return result.affectedRows;
}

export async function softDeleteDepartment(id: number): Promise<number> {
  const result = await execute('UPDATE departments SET deleted_at = NOW() WHERE id = ?', [id]);
  return result.affectedRows;
}

/** Lightweight lookup lists for dropdowns (id + label only). */
export async function employerOptions(search?: string, limit = 50) {
  const params: unknown[] = [];
  let whereSql = 'deleted_at IS NULL AND status = ?';
  params.push('active');
  if (search) {
    whereSql += ' AND (company_name LIKE ? OR employer_code LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }
  return query<{ id: number; company_name: string; employer_code: string; city: string | null } & RowDataPacket>(
    `SELECT id, company_name, employer_code, city FROM employers WHERE ${whereSql} ORDER BY company_name ASC LIMIT ${limit}`,
    params
  );
}
