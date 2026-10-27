/**
 * Payroll reads and writes.
 *
 * Four registers sit behind the payroll screens and the engine:
 *
 *   * **runs** (`payroll_runs`) — a month of payroll for one employer, narrowed
 *     to a unit/department when the establishment keeps separate books. The
 *     schema's unique key (`employer_id, unit_id, department_id, month, year`)
 *     is what makes "one run per scope per month" a database fact rather than a
 *     hope.
 *   * **payslips** (+ `payroll_items`) — one per employee per run, with every
 *     wage head split out so a payslip can be reprinted years later without
 *     recalculating anything.
 *   * **structures** (+ `salary_structure_items`) — the employee's contract,
 *     versioned: a revision never overwrites the previous one.
 *   * **attendance / leave** — the days the engine counts, and the leave book
 *     that decides which of those days are paid.
 *
 * Every filter is bound and every sort column whitelisted; the day-level writes
 * upsert on the schema's own unique keys so a re-import corrects rather than
 * duplicates.
 */
import { execute, insert, query, queryOne, type RowDataPacket } from '@/lib/db/mysql';
import {
  buildSearch, dateRangeFilter, eqFilter, inFilter, paginatedQuery, type ListQuery, type SqlValue,
} from '@/lib/db/query-helpers';
import type { TxClient } from '@/lib/db/transactions';

/* ══════════════════════════════════ runs ════════════════════════════════ */

/**
 * mysql2's `RowDataPacket` carries no index signature, so a row typed as one
 * cannot have its columns read without a cast — and payroll reads a lot of
 * columns across the engine, the PDF and the registers. `PayrollRow` is the row
 * shape this module passes around: the driver's own type plus free column
 * access.
 */
export type PayrollRow = RowDataPacket & Record<string, unknown>;

export interface RunListFilters extends ListQuery {
  status?: string | null;
  employerId?: number | null;
  unitId?: number | null;
  month?: number | null;
  year?: number | null;
  fromDate?: string | null;
  toDate?: string | null;
  /** Panel scoping: an employer only ever reads its own runs. */
  scopeEmployerId?: number | null;
}

const RUN_COLUMNS = `pr.id, pr.uuid, pr.run_number, pr.employer_id, pr.unit_id, pr.department_id, pr.month, pr.year,
  pr.period_from, pr.period_to, pr.total_employees, pr.total_gross, pr.total_deductions, pr.total_net,
  pr.total_pf_employee, pr.total_pf_employer, pr.total_esi_employee, pr.total_esi_employer, pr.total_pt,
  pr.total_lwf, pr.total_overtime, pr.paid_days_total, pr.status, pr.calculation_notes, pr.processed_at,
  pr.approved_at, pr.locked_at, pr.bank_file_generated_at, pr.created_at, pr.updated_at,
  pr.processed_by, pr.approved_by,
  e.company_name, e.employer_code, cu.unit_name, d.department_name,
  pu.first_name AS processed_by_first, pu.last_name AS processed_by_last,
  pa.first_name AS approved_by_first, pa.last_name AS approved_by_last,
  (SELECT COUNT(*) FROM payslips ps WHERE ps.payroll_run_id = pr.id AND ps.deleted_at IS NULL) AS payslip_count`;

const RUN_JOINS = `FROM payroll_runs pr
  JOIN employers e ON e.id = pr.employer_id
  LEFT JOIN company_units cu ON cu.id = pr.unit_id
  LEFT JOIN departments d ON d.id = pr.department_id
  LEFT JOIN users pa ON pa.id = pr.approved_by
  LEFT JOIN users pu ON pu.id = pr.processed_by`;

function runWhere(filters: RunListFilters, params: SqlValue[]): string {
  const where: string[] = ['pr.deleted_at IS NULL'];
  const search = buildSearch(filters.search ?? null, ['pr.run_number', 'e.company_name', 'pr.calculation_notes'], params);
  if (search) where.push(search.replace(/^\s*AND\s*/i, ''));
  if (filters.status && filters.status !== 'all') where.push(eqFilter('pr.status', filters.status, params).replace(/^\s*AND\s*/i, ''));
  const employer = filters.scopeEmployerId ?? filters.employerId;
  if (employer) where.push(eqFilter('pr.employer_id', employer, params).replace(/^\s*AND\s*/i, ''));
  if (filters.unitId) where.push(eqFilter('pr.unit_id', filters.unitId, params).replace(/^\s*AND\s*/i, ''));
  if (filters.month) where.push(eqFilter('pr.month', filters.month, params).replace(/^\s*AND\s*/i, ''));
  if (filters.year) where.push(eqFilter('pr.year', filters.year, params).replace(/^\s*AND\s*/i, ''));
  const range = dateRangeFilter('pr.period_to', filters.fromDate ?? null, filters.toDate ?? null, params);
  if (range) where.push(range.replace(/^\s*AND\s*/i, ''));
  return `WHERE ${where.join(' AND ')}`;
}

export function findRuns(filters: RunListFilters) {
  const params: SqlValue[] = [];
  const whereSql = runWhere(filters, params);
  return paginatedQuery<PayrollRow>(
    `SELECT ${RUN_COLUMNS} ${RUN_JOINS} ${whereSql}`,
    `SELECT COUNT(*) FROM payroll_runs pr JOIN employers e ON e.id = pr.employer_id ${whereSql}`,
    params,
    {
      ...filters,
      allowedSortColumns: ['period_to', 'run_number', 'status', 'total_net', 'total_employees', 'created_at', 'year'],
      defaultSort: 'period_to',
    }
  );
}

export function findRunById(id: number, employerId?: number | null) {
  const params: SqlValue[] = [id];
  const scope = employerId ? eqFilter('pr.employer_id', employerId, params).replace(/^\s*AND\s*/i, '') : '1 = 1';
  return queryOne<PayrollRow>(
    `SELECT ${RUN_COLUMNS} ${RUN_JOINS}
      WHERE pr.id = ? AND pr.deleted_at IS NULL AND ${scope} LIMIT 1`,
    params
  );
}

/** The run for a scope and month — the uniqueness the schema already enforces. */
export function findRunForPeriod(employerId: number, month: number, year: number, unitId?: number | null, departmentId?: number | null) {
  const params: SqlValue[] = [employerId, month, year];
  const unit = unitId ? eqFilter('unit_id', unitId, params).replace(/^\s*AND\s*/i, '') : 'unit_id IS NULL';
  const department = departmentId ? eqFilter('department_id', departmentId, params).replace(/^\s*AND\s*/i, '') : 'department_id IS NULL';
  return queryOne<PayrollRow>(
    `SELECT id, run_number, status FROM payroll_runs
      WHERE employer_id = ? AND month = ? AND year = ? AND ${unit} AND ${department} AND deleted_at IS NULL
      LIMIT 1`,
    params
  );
}

export async function runStats(filters: RunListFilters = {}) {
  const params: SqlValue[] = [];
  const whereSql = runWhere({ ...filters, status: 'all' }, params);
  const [counts] = await query<PayrollRow>(
    `SELECT COUNT(*) AS total,
            SUM(pr.status = 'Draft') AS draft,
            SUM(pr.status = 'Calculated') AS calculated,
            SUM(pr.status = 'Approved') AS approved,
            SUM(pr.status = 'Locked') AS locked,
            SUM(pr.status = 'Paid') AS paid,
            SUM(pr.total_employees) AS employees,
            SUM(pr.total_gross) AS gross,
            SUM(pr.total_net) AS net,
            SUM(pr.total_pf_employee) AS pf,
            SUM(pr.total_esi_employee) AS esi
       FROM payroll_runs pr JOIN employers e ON e.id = pr.employer_id ${whereSql}`,
    params
  );
  return {
    total: Number(counts?.total ?? 0),
    draft: Number(counts?.draft ?? 0),
    calculated: Number(counts?.calculated ?? 0),
    approved: Number(counts?.approved ?? 0),
    locked: Number(counts?.locked ?? 0),
    paid: Number(counts?.paid ?? 0),
    employees: Number(counts?.employees ?? 0),
    gross: Number(counts?.gross ?? 0),
    net: Number(counts?.net ?? 0),
    pf: Number(counts?.pf ?? 0),
    esi: Number(counts?.esi ?? 0),
  };
}

export function insertRun(values: Record<string, SqlValue>, tx?: TxClient) {
  const columns = Object.keys(values);
  const placeholders = columns.map(() => '?').join(', ');
  const sql = `INSERT INTO payroll_runs (${columns.join(', ')}) VALUES (${placeholders})`;
  const params = Object.values(values);
  return tx ? tx.insert(sql, params) : insert(sql, params);
}

export function updateRun(id: number, values: Record<string, SqlValue>, tx?: TxClient) {
  const columns = Object.keys(values);
  if (!columns.length) return Promise.resolve(0);
  const sql = `UPDATE payroll_runs SET ${columns.map((column) => `${column} = ?`).join(', ')} WHERE id = ?`;
  const params = [...Object.values(values), id];
  return tx ? tx.execute(sql, params) : execute(sql, params);
}

/** The totals a computed run reports, refreshed after the engine has written it. */
export function refreshRunTotals(runId: number, values: Record<string, SqlValue>, tx?: TxClient) {
  return updateRun(runId, values, tx);
}

/* ════════════════════════════════ payslips ══════════════════════════════ */

export interface PayslipListFilters extends ListQuery {
  runId?: number | null;
  employeeId?: number | null;
  employerId?: number | null;
  unitId?: number | null;
  departmentId?: number | null;
  month?: number | null;
  year?: number | null;
  paymentStatus?: string | null;
  published?: string | null;
  scopeEmployerId?: number | null;
  scopeEmployeeId?: number | null;
}

const SLIP_COLUMNS = `ps.id, ps.uuid, ps.payslip_number, ps.payroll_run_id, ps.employer_id, ps.employee_id,
  ps.unit_id, ps.department_id, ps.month, ps.year, ps.period_from, ps.period_to, ps.working_days, ps.paid_days,
  ps.lop_days, ps.present_days, ps.absent_days, ps.leave_days, ps.holiday_days, ps.weekly_off_days,
  ps.overtime_hours, ps.basic, ps.da, ps.hra, ps.ta, ps.pa, ps.ea, ps.npba, ps.other_allowances,
  ps.overtime_amount, ps.bonus_amount, ps.arrears_amount, ps.gross_earnings, ps.pf_employee, ps.pf_employer,
  ps.vpf_amount, ps.esi_employee, ps.esi_employer, ps.professional_tax, ps.lwf_amount, ps.tds_amount,
  ps.advance_deduction, ps.canteen_deduction, ps.other_deductions, ps.total_deductions, ps.net_pay,
  ps.net_pay_in_words, ps.bank_name, ps.bank_account_number, ps.ifsc_code, ps.payment_mode, ps.payment_status,
  ps.paid_at, ps.payment_reference, ps.pdf_file_id, ps.pdf_generated_at, ps.is_published, ps.published_at,
  ps.employee_viewed_at, ps.remarks, ps.created_at, ps.updated_at,
  emp.name AS employee_name, emp.employee_number, emp.designation, emp.department AS employee_department,
  emp.email AS employee_email, emp.mobile AS employee_mobile,
  e.company_name, cu.unit_name, pr.run_number, pr.status AS run_status`;

const SLIP_JOINS = `FROM payslips ps
  JOIN employees emp ON emp.id = ps.employee_id
  JOIN employers e ON e.id = ps.employer_id
  JOIN payroll_runs pr ON pr.id = ps.payroll_run_id
  LEFT JOIN company_units cu ON cu.id = ps.unit_id`;

function slipWhere(filters: PayslipListFilters, params: SqlValue[]): string {
  const where: string[] = ['ps.deleted_at IS NULL'];
  const search = buildSearch(filters.search ?? null, ['ps.payslip_number', 'emp.name', 'emp.employee_number'], params);
  if (search) where.push(search.replace(/^\s*AND\s*/i, ''));
  if (filters.runId) where.push(eqFilter('ps.payroll_run_id', filters.runId, params).replace(/^\s*AND\s*/i, ''));
  if (filters.employeeId) where.push(eqFilter('ps.employee_id', filters.employeeId, params).replace(/^\s*AND\s*/i, ''));
  const employer = filters.scopeEmployerId ?? filters.employerId;
  if (employer) where.push(eqFilter('ps.employer_id', employer, params).replace(/^\s*AND\s*/i, ''));
  if (filters.unitId) where.push(eqFilter('ps.unit_id', filters.unitId, params).replace(/^\s*AND\s*/i, ''));
  if (filters.departmentId) where.push(eqFilter('ps.department_id', filters.departmentId, params).replace(/^\s*AND\s*/i, ''));
  if (filters.month) where.push(eqFilter('ps.month', filters.month, params).replace(/^\s*AND\s*/i, ''));
  if (filters.year) where.push(eqFilter('ps.year', filters.year, params).replace(/^\s*AND\s*/i, ''));
  if (filters.paymentStatus && filters.paymentStatus !== 'all') {
    where.push(eqFilter('ps.payment_status', filters.paymentStatus, params).replace(/^\s*AND\s*/i, ''));
  }
  if (filters.published === 'yes') where.push('ps.is_published = 1');
  if (filters.published === 'no') where.push('ps.is_published = 0');
  // An employee sees only their own payslips, whatever the query string asks for.
  if (filters.scopeEmployeeId) where.push(eqFilter('ps.employee_id', filters.scopeEmployeeId, params).replace(/^\s*AND\s*/i, ''));
  return `WHERE ${where.join(' AND ')}`;
}

export function findPayslips(filters: PayslipListFilters) {
  const params: SqlValue[] = [];
  const whereSql = slipWhere(filters, params);
  return paginatedQuery<PayrollRow>(
    `SELECT ${SLIP_COLUMNS} ${SLIP_JOINS} ${whereSql}`,
    `SELECT COUNT(*) ${SLIP_JOINS} ${whereSql}`,
    params,
    {
      ...filters,
      allowedSortColumns: ['net_pay', 'gross_earnings', 'payslip_number', 'month', 'year', 'created_at'],
      defaultSort: 'created_at',
    }
  );
}

export function findPayslipById(id: number, scope?: { employerId?: number | null; employeeId?: number | null }) {
  const params: SqlValue[] = [id];
  const conditions: string[] = [];
  if (scope?.employerId) conditions.push(eqFilter('ps.employer_id', scope.employerId, params).replace(/^\s*AND\s*/i, ''));
  if (scope?.employeeId) conditions.push(eqFilter('ps.employee_id', scope.employeeId, params).replace(/^\s*AND\s*/i, ''));
  const extra = conditions.length ? ` AND ${conditions.join(' AND ')}` : '';
  return queryOne<PayrollRow>(
    `SELECT ${SLIP_COLUMNS} ${SLIP_JOINS} WHERE ps.id = ? AND ps.deleted_at IS NULL${extra} LIMIT 1`,
    params
  );
}

export function findPayslipItems(payslipId: number) {
  return query<PayrollRow>(
    // The column is `head_id`; the API keeps the documented `payroll_head_id`
    // name so the payslip screen and the PDF read one shape.
    `SELECT id, head_id AS payroll_head_id, head_code, head_name, head_name_ta, head_type, amount, is_statutory, sort_order
       FROM payroll_items WHERE payslip_id = ? ORDER BY sort_order ASC, id ASC`,
    [payslipId]
  );
}

export function findRunPayslips(runId: number) {
  return query<PayrollRow>(
    `SELECT ${SLIP_COLUMNS} ${SLIP_JOINS} WHERE ps.payroll_run_id = ? AND ps.deleted_at IS NULL
      ORDER BY emp.employee_number ASC`,
    [runId]
  );
}

export function payslipsForIds(ids: number[]) {
  const params: SqlValue[] = [];
  const where = inFilter('ps.id', ids, params).replace(/^\s*AND\s*/i, '');
  return query<PayrollRow>(
    `SELECT ${SLIP_COLUMNS} ${SLIP_JOINS} WHERE ps.deleted_at IS NULL AND ${where}`,
    params
  );
}

export async function payslipStats(filters: PayslipListFilters = {}) {
  const params: SqlValue[] = [];
  const whereSql = slipWhere({ ...filters, paymentStatus: 'all', published: 'all' }, params);
  const [counts] = await query<PayrollRow>(
    `SELECT COUNT(*) AS total,
            SUM(ps.gross_earnings) AS gross,
            SUM(ps.net_pay) AS net,
            SUM(ps.total_deductions) AS deductions,
            SUM(ps.pf_employee) AS pf_employee,
            SUM(ps.pf_employer) AS pf_employer,
            SUM(ps.esi_employee) AS esi_employee,
            SUM(ps.esi_employer) AS esi_employer,
            SUM(ps.professional_tax) AS pt,
            SUM(ps.lwf_amount) AS lwf,
            SUM(ps.tds_amount) AS tds,
            SUM(ps.payment_status = 'Paid') AS paid,
            SUM(ps.payment_status = 'Pending') AS pending,
            SUM(ps.is_published = 1) AS published,
            SUM(ps.lop_days) AS lop_days,
            SUM(ps.overtime_hours) AS overtime_hours
       ${SLIP_JOINS} ${whereSql}`,
    params
  );
  return {
    total: Number(counts?.total ?? 0),
    gross: Number(counts?.gross ?? 0),
    net: Number(counts?.net ?? 0),
    deductions: Number(counts?.deductions ?? 0),
    pfEmployee: Number(counts?.pf_employee ?? 0),
    pfEmployer: Number(counts?.pf_employer ?? 0),
    esiEmployee: Number(counts?.esi_employee ?? 0),
    esiEmployer: Number(counts?.esi_employer ?? 0),
    pt: Number(counts?.pt ?? 0),
    lwf: Number(counts?.lwf ?? 0),
    tds: Number(counts?.tds ?? 0),
    paid: Number(counts?.paid ?? 0),
    pending: Number(counts?.pending ?? 0),
    published: Number(counts?.published ?? 0),
    lopDays: Number(counts?.lop_days ?? 0),
    overtimeHours: Number(counts?.overtime_hours ?? 0),
  };
}

export function insertPayslip(values: Record<string, SqlValue>, tx?: TxClient) {
  const columns = Object.keys(values);
  const sql = `INSERT INTO payslips (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`;
  const params = Object.values(values);
  return tx ? tx.insert(sql, params) : insert(sql, params);
}

export async function insertPayrollItems(rows: Record<string, SqlValue>[], tx?: TxClient) {
  if (!rows.length) return;
  const columns = Object.keys(rows[0]);
  for (const row of rows) {
    const sql = `INSERT INTO payroll_items (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`;
    const params = columns.map((column) => row[column] as SqlValue);
    if (tx) await tx.execute(sql, params);
    else await execute(sql, params);
  }
}

export function updatePayslip(id: number, values: Record<string, SqlValue>, tx?: TxClient) {
  const columns = Object.keys(values);
  if (!columns.length) return Promise.resolve(0);
  const sql = `UPDATE payslips SET ${columns.map((column) => `${column} = ?`).join(', ')} WHERE id = ?`;
  const params = [...Object.values(values), id];
  return tx ? tx.execute(sql, params) : execute(sql, params);
}

export function deleteRunPayslips(runId: number, tx?: TxClient) {
  const sql = 'DELETE FROM payroll_items WHERE payslip_id IN (SELECT id FROM payslips WHERE payroll_run_id = ?)';
  const cleanup = 'DELETE FROM payslips WHERE payroll_run_id = ?';
  if (tx) return tx.execute(sql, [runId]).then(() => tx.execute(cleanup, [runId]));
  return execute(sql, [runId]).then(() => execute(cleanup, [runId]));
}

/** Soft-deletes the run, and every payslip it produced, together. */
export function softDeleteRun(id: number, tx?: TxClient) {
  const sql = 'UPDATE payroll_runs SET deleted_at = NOW() WHERE id = ?';
  // A withdrawn run's payslips must stop appearing in the pay register and in
  // the employees' own registers, or the register would show money for a run
  // that no longer exists anywhere else.
  const slips = 'UPDATE payslips SET deleted_at = NOW() WHERE payroll_run_id = ? AND deleted_at IS NULL';
  if (tx) return tx.execute(sql, [id]).then(() => tx.execute(slips, [id]));
  return execute(sql, [id]).then(() => execute(slips, [id]));
}

/* ═══════════════════════════ salary structures ══════════════════════════ */

export interface StructureListFilters extends ListQuery {
  employerId?: number | null;
  unitId?: number | null;
  departmentId?: number | null;
  live?: string | null;
  pf?: string | null;
  esi?: string | null;
  fromDate?: string | null;
  toDate?: string | null;
  scopeEmployerId?: number | null;
}

const STRUCTURE_COLUMNS = `ss.id, ss.employer_id, ss.employee_id, ss.structure_name, ss.effective_from, ss.effective_to,
  ss.basic, ss.da, ss.hra, ss.ta, ss.pa, ss.ea, ss.npba, ss.other_allowances, ss.gross_salary, ss.wage_type,
  ss.daily_wage, ss.pf_applicable, ss.pf_employee_percent, ss.pf_employer_percent, ss.pf_wage_ceiling,
  ss.vpf_percent, ss.esi_applicable, ss.esi_employee_percent, ss.esi_employer_percent, ss.esi_wage_ceiling,
  ss.pt_state, ss.pt_amount, ss.lwf_applicable, ss.lwf_amount, ss.is_active, ss.revision_number,
  ss.revision_reason, ss.created_at, ss.updated_at,
  emp.name AS employee_name, emp.employee_number, emp.designation, emp.unit_id, emp.department_id,
  e.company_name`;

const STRUCTURE_JOINS = `FROM salary_structures ss
  JOIN employees emp ON emp.id = ss.employee_id
  JOIN employers e ON e.id = ss.employer_id`;

function structureWhere(filters: StructureListFilters, params: SqlValue[]): string {
  const where: string[] = ['ss.deleted_at IS NULL'];
  const search = buildSearch(filters.search ?? null, ['emp.name', 'emp.employee_number', 'ss.structure_name'], params);
  if (search) where.push(search.replace(/^\s*AND\s*/i, ''));
  const employer = filters.scopeEmployerId ?? filters.employerId;
  if (employer) where.push(eqFilter('ss.employer_id', employer, params).replace(/^\s*AND\s*/i, ''));
  if (filters.unitId) where.push(eqFilter('emp.unit_id', filters.unitId, params).replace(/^\s*AND\s*/i, ''));
  if (filters.departmentId) where.push(eqFilter('emp.department_id', filters.departmentId, params).replace(/^\s*AND\s*/i, ''));
  if (filters.live === 'yes') where.push('ss.is_active = 1');
  if (filters.live === 'no') where.push('ss.is_active = 0');
  if (filters.pf === 'yes') where.push('ss.pf_applicable = 1');
  if (filters.pf === 'no') where.push('ss.pf_applicable = 0');
  if (filters.esi === 'yes') where.push('ss.esi_applicable = 1');
  if (filters.esi === 'no') where.push('ss.esi_applicable = 0');
  const range = dateRangeFilter('ss.effective_from', filters.fromDate ?? null, filters.toDate ?? null, params);
  if (range) where.push(range.replace(/^\s*AND\s*/i, ''));
  return `WHERE ${where.join(' AND ')}`;
}

export function findStructures(filters: StructureListFilters) {
  const params: SqlValue[] = [];
  const whereSql = structureWhere(filters, params);
  return paginatedQuery<PayrollRow>(
    `SELECT ${STRUCTURE_COLUMNS} ${STRUCTURE_JOINS} ${whereSql}`,
    `SELECT COUNT(*) ${STRUCTURE_JOINS} ${whereSql}`,
    params,
    {
      ...filters,
      allowedSortColumns: ['effective_from', 'gross_salary', 'employee_name', 'created_at', 'revision_number'],
      defaultSort: 'created_at',
    }
  );
}

export function findStructureById(id: number, employerId?: number | null) {
  const params: SqlValue[] = [id];
  const scope = employerId ? eqFilter('ss.employer_id', employerId, params).replace(/^\s*AND\s*/i, '') : '1 = 1';
  return queryOne<PayrollRow>(
    `SELECT ${STRUCTURE_COLUMNS} ${STRUCTURE_JOINS} WHERE ss.id = ? AND ss.deleted_at IS NULL AND ${scope} LIMIT 1`,
    params
  );
}

export function findStructureItems(structureId: number) {
  return query<PayrollRow>(
    `SELECT id, payroll_head_id, head_code, head_name, head_type, amount, percent_of_basic, sort_order
       FROM salary_structure_items WHERE salary_structure_id = ? ORDER BY sort_order ASC, id ASC`,
    [structureId]
  );
}

/**
 * The structure in force for an employee on a date — the one the engine uses.
 * A revision that starts later does not apply yet; one whose `effective_to` has
 * passed is history.
 */
export function liveStructure(employeeId: number, onDate: string, tx?: TxClient) {
  const sql = `SELECT * FROM salary_structures
                WHERE employee_id = ? AND deleted_at IS NULL AND is_active = 1
                  AND effective_from <= ?
                  AND (effective_to IS NULL OR effective_to >= ?)
                ORDER BY effective_from DESC, revision_number DESC, id DESC LIMIT 1`;
  return tx ? tx.queryOne<PayrollRow>(sql, [employeeId, onDate, onDate]) : queryOne<PayrollRow>(sql, [employeeId, onDate, onDate]);
}

export function liveStructureItems(structureId: number, tx?: TxClient) {
  const sql = `SELECT head_code, head_name, head_type, amount, percent_of_basic, sort_order
                 FROM salary_structure_items WHERE salary_structure_id = ? ORDER BY sort_order ASC, id ASC`;
  return tx ? tx.query<PayrollRow>(sql, [structureId]) : query<PayrollRow>(sql, [structureId]);
}

export async function structureStats(filters: StructureListFilters = {}) {
  const params: SqlValue[] = [];
  const whereSql = structureWhere({ ...filters, live: 'all', pf: 'all', esi: 'all' }, params);
  const [counts] = await query<PayrollRow>(
    `SELECT COUNT(*) AS total,
            SUM(ss.is_active = 1) AS live,
            SUM(ss.pf_applicable = 1) AS pf,
            SUM(ss.esi_applicable = 1) AS esi,
            AVG(ss.gross_salary) AS average_gross,
            SUM(ss.gross_salary) AS total_gross,
            MAX(ss.effective_from) AS latest_effective
       ${STRUCTURE_JOINS} ${whereSql}`,
    params
  );
  const byWageType = await query<PayrollRow>(
    `SELECT ss.wage_type, COUNT(*) AS total ${STRUCTURE_JOINS} ${whereSql} GROUP BY ss.wage_type`,
    params
  );
  return {
    total: Number(counts?.total ?? 0),
    live: Number(counts?.live ?? 0),
    pf: Number(counts?.pf ?? 0),
    esi: Number(counts?.esi ?? 0),
    averageGross: Number(counts?.average_gross ?? 0),
    totalGross: Number(counts?.total_gross ?? 0),
    latestEffective: counts?.latest_effective ? String(counts.latest_effective).slice(0, 10) : null,
    byWageType: byWageType.map((row) => ({ wageType: String(row.wage_type), total: Number(row.total) })),
  };
}

export function nextRevisionNumber(employeeId: number) {
  return queryOne<PayrollRow>(
    'SELECT COALESCE(MAX(revision_number), 0) AS last FROM salary_structures WHERE employee_id = ?',
    [employeeId]
  );
}

export function insertStructure(values: Record<string, SqlValue>, tx?: TxClient) {
  const columns = Object.keys(values);
  const sql = `INSERT INTO salary_structures (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`;
  const params = Object.values(values);
  return tx ? tx.insert(sql, params) : insert(sql, params);
}

export function updateStructure(id: number, values: Record<string, SqlValue>, tx?: TxClient) {
  const columns = Object.keys(values);
  if (!columns.length) return Promise.resolve(0);
  const sql = `UPDATE salary_structures SET ${columns.map((column) => `${column} = ?`).join(', ')} WHERE id = ?`;
  const params = [...Object.values(values), id];
  return tx ? tx.execute(sql, params) : execute(sql, params);
}

export function replaceStructureItems(structureId: number, rows: Record<string, SqlValue>[], tx?: TxClient) {
  const remove = () => (tx ? tx.execute('DELETE FROM salary_structure_items WHERE salary_structure_id = ?', [structureId])
                           : execute('DELETE FROM salary_structure_items WHERE salary_structure_id = ?', [structureId]));
  const add = async () => {
    for (const row of rows) {
      const values = { salary_structure_id: structureId, ...row };
      const columns = Object.keys(values);
      const sql = `INSERT INTO salary_structure_items (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`;
      const params = Object.values(values);
      if (tx) await tx.execute(sql, params);
      else await execute(sql, params);
    }
  };
  return remove().then(add);
}

export function supersedeStructures(employeeId: number, effectiveFrom: string, tx?: TxClient) {
  const sql = `UPDATE salary_structures SET is_active = 0, effective_to = DATE_SUB(?, INTERVAL 1 DAY)
                WHERE employee_id = ? AND deleted_at IS NULL AND is_active = 1 AND effective_from < ?`;
  const params = [effectiveFrom, employeeId, effectiveFrom];
  return tx ? tx.execute(sql, params) : execute(sql, params);
}

/* ═══════════════════════════════ attendance ═════════════════════════════ */

export interface AttendanceListFilters extends ListQuery {
  employerId?: number | null;
  unitId?: number | null;
  departmentId?: number | null;
  employeeId?: number | null;
  month?: number | null;
  year?: number | null;
  status?: string | null;
  fromDate?: string | null;
  toDate?: string | null;
  scopeEmployerId?: number | null;
  scopeEmployeeId?: number | null;
}

const ATTENDANCE_COLUMNS = `a.id, a.employer_id, a.unit_id, a.department_id, a.employee_id, a.attendance_date,
  a.month, a.year, a.status, a.leave_type, a.shift_name, a.in_time, a.out_time, a.worked_hours,
  a.overtime_hours, a.late_minutes, a.early_minutes, a.is_paid, a.remarks, a.source, a.created_at,
  emp.name AS employee_name, emp.employee_number, emp.designation, e.company_name`;

const ATTENDANCE_JOINS = `FROM attendance a
  JOIN employees emp ON emp.id = a.employee_id
  JOIN employers e ON e.id = a.employer_id`;

function attendanceWhere(filters: AttendanceListFilters, params: SqlValue[]): string {
  const where: string[] = ['a.deleted_at IS NULL'];
  const search = buildSearch(filters.search ?? null, ['emp.name', 'emp.employee_number', 'a.remarks'], params);
  if (search) where.push(search.replace(/^\s*AND\s*/i, ''));
  const employer = filters.scopeEmployerId ?? filters.employerId;
  if (employer) where.push(eqFilter('a.employer_id', employer, params).replace(/^\s*AND\s*/i, ''));
  if (filters.unitId) where.push(eqFilter('a.unit_id', filters.unitId, params).replace(/^\s*AND\s*/i, ''));
  if (filters.departmentId) where.push(eqFilter('a.department_id', filters.departmentId, params).replace(/^\s*AND\s*/i, ''));
  const employee = filters.scopeEmployeeId ?? filters.employeeId;
  if (employee) where.push(eqFilter('a.employee_id', employee, params).replace(/^\s*AND\s*/i, ''));
  if (filters.month) where.push(eqFilter('a.month', filters.month, params).replace(/^\s*AND\s*/i, ''));
  if (filters.year) where.push(eqFilter('a.year', filters.year, params).replace(/^\s*AND\s*/i, ''));
  if (filters.status && filters.status !== 'all') where.push(eqFilter('a.status', filters.status, params).replace(/^\s*AND\s*/i, ''));
  const range = dateRangeFilter('a.attendance_date', filters.fromDate ?? null, filters.toDate ?? null, params);
  if (range) where.push(range.replace(/^\s*AND\s*/i, ''));
  return `WHERE ${where.join(' AND ')}`;
}

export function findAttendance(filters: AttendanceListFilters) {
  const params: SqlValue[] = [];
  const whereSql = attendanceWhere(filters, params);
  return paginatedQuery<PayrollRow>(
    `SELECT ${ATTENDANCE_COLUMNS} ${ATTENDANCE_JOINS} ${whereSql}`,
    `SELECT COUNT(*) ${ATTENDANCE_JOINS} ${whereSql}`,
    params,
    {
      ...filters,
      allowedSortColumns: ['attendance_date', 'employee_name', 'status', 'overtime_hours', 'created_at'],
      defaultSort: 'attendance_date',
    }
  );
}

/** The month's attendance for one employee, as the engine reads it. */
export function attendanceForEmployeeMonth(employeeId: number, year: number, month: number, tx?: TxClient) {
  const sql = `SELECT a.attendance_date, a.status, a.overtime_hours, a.worked_hours, a.leave_type,
                      lt.is_paid AS leave_paid
                 FROM attendance a
                 LEFT JOIN leave_types lt ON lt.name = a.leave_type
                WHERE a.employee_id = ? AND a.year = ? AND a.month = ? AND a.deleted_at IS NULL
                ORDER BY a.attendance_date ASC`;
  const params = [employeeId, year, month];
  return tx ? tx.query<PayrollRow>(sql, params) : query<PayrollRow>(sql, params);
}

export async function attendanceStats(filters: AttendanceListFilters = {}) {
  const params: SqlValue[] = [];
  const whereSql = attendanceWhere({ ...filters, status: 'all' }, params);
  const [counts] = await query<PayrollRow>(
    `SELECT COUNT(*) AS total,
            SUM(a.status IN ('Present','On Duty','Late','Comp Off')) AS present,
            SUM(a.status = 'Absent') AS absent,
            SUM(a.status = 'Half Day') AS half_days,
            SUM(a.status = 'Leave') AS leave_days,
            SUM(a.status = 'Holiday') AS holidays,
            SUM(a.status = 'Weekly Off') AS weekly_offs,
            SUM(a.overtime_hours) AS overtime_hours,
            SUM(a.worked_hours) AS worked_hours,
            COUNT(DISTINCT a.employee_id) AS employees
       ${ATTENDANCE_JOINS} ${whereSql}`,
    params
  );
  const byStatus = await query<PayrollRow>(
    `SELECT a.status, COUNT(*) AS total ${ATTENDANCE_JOINS} ${whereSql} GROUP BY a.status ORDER BY total DESC`,
    params
  );
  return {
    total: Number(counts?.total ?? 0),
    present: Number(counts?.present ?? 0),
    absent: Number(counts?.absent ?? 0),
    halfDays: Number(counts?.half_days ?? 0),
    leaveDays: Number(counts?.leave_days ?? 0),
    holidays: Number(counts?.holidays ?? 0),
    weeklyOffs: Number(counts?.weekly_offs ?? 0),
    overtimeHours: Number(counts?.overtime_hours ?? 0),
    workedHours: Number(counts?.worked_hours ?? 0),
    employees: Number(counts?.employees ?? 0),
    byStatus: byStatus.map((row) => ({ status: String(row.status), total: Number(row.total) })),
  };
}

/** Day-level upsert: re-importing a month corrects days rather than repeating them. */
export function upsertAttendance(values: Record<string, SqlValue>, tx?: TxClient) {
  const columns = Object.keys(values);
  const updates = columns
    .filter((column) => !['employee_id', 'attendance_date'].includes(column))
    .map((column) => `${column} = VALUES(${column})`)
    .join(', ');
  const sql = `INSERT INTO attendance (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})
               ON DUPLICATE KEY UPDATE ${updates}`;
  const params = Object.values(values);
  return tx ? tx.execute(sql, params) : execute(sql, params);
}

/** The month's leave rows for one employee, so unpaid leave can be spotted. */
export function approvedLeaveForMonth(employeeId: number, from: string, to: string, tx?: TxClient) {
  const sql = `SELECT la.id, la.date_from, la.date_to, la.total_days, la.is_half_day, lt.is_paid, lt.name AS leave_name
                 FROM leave_applications la
                 JOIN leave_types lt ON lt.id = la.leave_type_id
                WHERE la.employee_id = ? AND la.deleted_at IS NULL AND la.status = 'Approved'
                  AND la.date_from <= ? AND la.date_to >= ?`;
  const params = [employeeId, to, from];
  return tx ? tx.query<PayrollRow>(sql, params) : query<PayrollRow>(sql, params);
}

/* ══════════════════════════════ leave book ══════════════════════════════ */

/**
 * Leave types in force for a company: its own, plus every platform default (employer_id NULL)
 * it has not overridden by code. Without the defaults a newly added company would have no
 * leave types at all, and nobody could apply for leave or be accrued a balance.
 */
export function findLeaveTypes(employerId?: number | null) {
  const params: SqlValue[] = [];
  let scope = '1 = 1';
  if (employerId) {
    scope = `(employer_id = ? OR (employer_id IS NULL AND code NOT IN (SELECT code FROM leave_types WHERE employer_id = ?)))`;
    params.push(employerId, employerId);
  }
  return query<PayrollRow>(
    `SELECT id, employer_id, code, name, name_ta, is_paid, max_days_per_year, carry_forward, max_carry_forward,
            encashable, requires_document, min_days_notice, status
       FROM leave_types WHERE ${scope} ORDER BY name ASC`,
    params
  );
}

export interface LeaveListFilters extends ListQuery {
  employerId?: number | null;
  employeeId?: number | null;
  leaveTypeId?: number | null;
  status?: string | null;
  fromDate?: string | null;
  toDate?: string | null;
  scopeEmployerId?: number | null;
  scopeEmployeeId?: number | null;
}

export function findLeaveApplications(filters: LeaveListFilters) {
  const params: SqlValue[] = [];
  const where: string[] = ['la.deleted_at IS NULL'];
  const search = buildSearch(filters.search ?? null, ['la.application_number', 'emp.name', 'emp.employee_number'], params);
  if (search) where.push(search.replace(/^\s*AND\s*/i, ''));
  const employer = filters.scopeEmployerId ?? filters.employerId;
  if (employer) where.push(eqFilter('la.employer_id', employer, params).replace(/^\s*AND\s*/i, ''));
  const employee = filters.scopeEmployeeId ?? filters.employeeId;
  if (employee) where.push(eqFilter('la.employee_id', employee, params).replace(/^\s*AND\s*/i, ''));
  if (filters.leaveTypeId) where.push(eqFilter('la.leave_type_id', filters.leaveTypeId, params).replace(/^\s*AND\s*/i, ''));
  if (filters.status && filters.status !== 'all') where.push(eqFilter('la.status', filters.status, params).replace(/^\s*AND\s*/i, ''));
  const range = dateRangeFilter('la.date_from', filters.fromDate ?? null, filters.toDate ?? null, params);
  if (range) where.push(range.replace(/^\s*AND\s*/i, ''));
  const whereSql = `WHERE ${where.join(' AND ')}`;

  return paginatedQuery<PayrollRow>(
    `SELECT la.id, la.uuid, la.application_number, la.employer_id, la.employee_id, la.leave_type_id,
            la.date_from, la.date_to, la.total_days, la.is_half_day, la.reason, la.document_file_id,
            la.status, la.approved_by, la.approved_at, la.approver_comments, la.applied_at, la.created_at,
            lt.name AS leave_name, lt.is_paid, emp.name AS employee_name, emp.employee_number, emp.designation,
            e.company_name, ap.first_name AS approver_first, ap.last_name AS approver_last
       FROM leave_applications la
       JOIN employees emp ON emp.id = la.employee_id
       JOIN employers e ON e.id = la.employer_id
       LEFT JOIN leave_types lt ON lt.id = la.leave_type_id
       LEFT JOIN users ap ON ap.id = la.approved_by
       ${whereSql}`,
    `SELECT COUNT(*) FROM leave_applications la JOIN employees emp ON emp.id = la.employee_id ${whereSql}`,
    params,
    {
      ...filters,
      allowedSortColumns: ['date_from', 'date_to', 'employee_name', 'status', 'created_at'],
      defaultSort: 'date_from',
    }
  );
}

export function findLeaveApplicationById(id: number) {
  return queryOne<PayrollRow>(
    `SELECT la.*, lt.name AS leave_name, lt.is_paid, emp.name AS employee_name, emp.employee_number
       FROM leave_applications la
       JOIN employees emp ON emp.id = la.employee_id
       LEFT JOIN leave_types lt ON lt.id = la.leave_type_id
      WHERE la.id = ? AND la.deleted_at IS NULL LIMIT 1`,
    [id]
  );
}

export async function leaveStats(filters: LeaveListFilters = {}) {
  const params: SqlValue[] = [];
  const where: string[] = ['la.deleted_at IS NULL'];
  const employer = filters.scopeEmployerId ?? filters.employerId;
  if (employer) where.push(eqFilter('la.employer_id', employer, params).replace(/^\s*AND\s*/i, ''));
  const employee = filters.scopeEmployeeId ?? filters.employeeId;
  if (employee) where.push(eqFilter('la.employee_id', employee, params).replace(/^\s*AND\s*/i, ''));
  const [counts] = await query<PayrollRow>(
    `SELECT COUNT(*) AS total,
            SUM(la.status = 'Pending') AS pending,
            SUM(la.status = 'Approved') AS approved,
            SUM(la.status = 'Rejected') AS rejected,
            SUM(la.status = 'Approved' AND lt.is_paid = 1) AS paid_days,
            SUM(la.status = 'Approved' AND lt.is_paid = 0) AS unpaid_days
       FROM leave_applications la
       LEFT JOIN leave_types lt ON lt.id = la.leave_type_id
      WHERE ${where.join(' AND ')}`,
    params
  );
  return {
    total: Number(counts?.total ?? 0),
    pending: Number(counts?.pending ?? 0),
    approved: Number(counts?.approved ?? 0),
    rejected: Number(counts?.rejected ?? 0),
    paidDays: Number(counts?.paid_days ?? 0),
    unpaidDays: Number(counts?.unpaid_days ?? 0),
  };
}

/**
 * The leave ledger: opening, accrued, availed, encashed, lapsed, closing, per
 * employee per type per year. The unique key (`employee_id, leave_type_id,
 * year`) is what makes an accrual re-run idempotent.
 */
export function findLeaveLedger(filters: { employerId?: number | null; employeeId?: number | null; year?: number | null; scopeEmployerId?: number | null; scopeEmployeeId?: number | null; limit?: number }) {
  const params: SqlValue[] = [];
  const where: string[] = ['ll.deleted_at IS NULL'];
  const employer = filters.scopeEmployerId ?? filters.employerId;
  if (employer) where.push(eqFilter('ll.employer_id', employer, params).replace(/^\s*AND\s*/i, ''));
  const employee = filters.scopeEmployeeId ?? filters.employeeId;
  if (employee) where.push(eqFilter('ll.employee_id', employee, params).replace(/^\s*AND\s*/i, ''));
  if (filters.year) where.push(eqFilter('ll.year', filters.year, params).replace(/^\s*AND\s*/i, ''));
  return query<PayrollRow>(
    `SELECT ll.id, ll.employer_id, ll.employee_id, ll.leave_type_id, ll.year, ll.opening_balance, ll.accrued,
            ll.availed, ll.encashed, ll.lapsed, ll.closing_balance, lt.name AS leave_name, lt.is_paid,
            lt.max_days_per_year, emp.name AS employee_name, emp.employee_number
       FROM leave_ledgers ll
       JOIN leave_types lt ON lt.id = ll.leave_type_id
       JOIN employees emp ON emp.id = ll.employee_id
      WHERE ${where.join(' AND ')}
      ORDER BY emp.employee_number ASC, lt.name ASC
      LIMIT ${Math.min(Number(filters.limit ?? 500), 2000)}`,
    params
  );
}

export function upsertLeaveLedger(values: Record<string, SqlValue>, tx?: TxClient) {
  const columns = Object.keys(values);
  const updates = columns
    .filter((column) => !['employee_id', 'leave_type_id', 'year'].includes(column))
    .map((column) => `${column} = VALUES(${column})`)
    .join(', ');
  const sql = `INSERT INTO leave_ledgers (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})
               ON DUPLICATE KEY UPDATE ${updates}`;
  const params = Object.values(values);
  return tx ? tx.execute(sql, params) : execute(sql, params);
}

export function insertLeaveApplication(values: Record<string, SqlValue>, tx?: TxClient) {
  const columns = Object.keys(values);
  const sql = `INSERT INTO leave_applications (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`;
  const params = Object.values(values);
  return tx ? tx.insert(sql, params) : insert(sql, params);
}

export function updateLeaveApplication(id: number, values: Record<string, SqlValue>, tx?: TxClient) {
  const columns = Object.keys(values);
  if (!columns.length) return Promise.resolve(0);
  const sql = `UPDATE leave_applications SET ${columns.map((column) => `${column} = ?`).join(', ')} WHERE id = ?`;
  const params = [...Object.values(values), id];
  return tx ? tx.execute(sql, params) : execute(sql, params);
}

export function findLeaveTypeById(id: number) {
  return queryOne<PayrollRow>('SELECT * FROM leave_types WHERE id = ? LIMIT 1', [id]);
}

export function insertLeaveType(values: Record<string, SqlValue>) {
  const columns = Object.keys(values);
  const sql = `INSERT INTO leave_types (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`;
  return insert(sql, Object.values(values));
}

export function updateLeaveType(id: number, values: Record<string, SqlValue>) {
  const columns = Object.keys(values);
  if (!columns.length) return Promise.resolve(0);
  const sql = `UPDATE leave_types SET ${columns.map((column) => `${column} = ?`).join(', ')} WHERE id = ?`;
  return execute(sql, [...Object.values(values), id]);
}

/* ════════════════════════ bonus, gratuity, settlement ═══════════════════ */

export function findBonusRecords(filters: { employerId?: number | null; year?: number | null; status?: string | null; scopeEmployerId?: number | null; limit?: number }) {
  const params: SqlValue[] = [];
  const where: string[] = ['b.deleted_at IS NULL'];
  const employer = filters.scopeEmployerId ?? filters.employerId;
  if (employer) where.push(eqFilter('b.employer_id', employer, params).replace(/^\s*AND\s*/i, ''));
  if (filters.year) where.push(eqFilter('b.bonus_year', filters.year, params).replace(/^\s*AND\s*/i, ''));
  if (filters.status && filters.status !== 'all') where.push(eqFilter('b.payment_status', filters.status, params).replace(/^\s*AND\s*/i, ''));
  return query<PayrollRow>(
    `SELECT b.*, emp.name AS employee_name, emp.employee_number, e.company_name
       FROM bonus_records b
       JOIN employees emp ON emp.id = b.employee_id
       JOIN employers e ON e.id = b.employer_id
      WHERE ${where.join(' AND ')} ORDER BY b.created_at DESC LIMIT ${Math.min(Number(filters.limit ?? 200), 1000)}`,
    params
  );
}

export function findBonusForEmployeeYear(employeeId: number, bonusYear: number) {
  return queryOne<PayrollRow>(
    'SELECT id FROM bonus_records WHERE employee_id = ? AND bonus_year = ? AND deleted_at IS NULL LIMIT 1',
    [employeeId, bonusYear]
  );
}

export function insertBonusRecord(values: Record<string, SqlValue>, tx?: TxClient) {
  const columns = Object.keys(values);
  const sql = `INSERT INTO bonus_records (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`;
  const params = Object.values(values);
  return tx ? tx.insert(sql, params) : insert(sql, params);
}

export function findGratuityRecords(filters: { employerId?: number | null; status?: string | null; scopeEmployerId?: number | null; limit?: number }) {
  const params: SqlValue[] = [];
  const where: string[] = ['g.deleted_at IS NULL'];
  const employer = filters.scopeEmployerId ?? filters.employerId;
  if (employer) where.push(eqFilter('g.employer_id', employer, params).replace(/^\s*AND\s*/i, ''));
  if (filters.status && filters.status !== 'all') where.push(eqFilter('g.payment_status', filters.status, params).replace(/^\s*AND\s*/i, ''));
  return query<PayrollRow>(
    `SELECT g.*, emp.name AS employee_name, emp.employee_number, e.company_name
       FROM gratuity_records g
       JOIN employees emp ON emp.id = g.employee_id
       JOIN employers e ON e.id = g.employer_id
      WHERE ${where.join(' AND ')} ORDER BY g.created_at DESC LIMIT ${Math.min(Number(filters.limit ?? 200), 1000)}`,
    params
  );
}

export function insertGratuityRecord(values: Record<string, SqlValue>) {
  const columns = Object.keys(values);
  const sql = `INSERT INTO gratuity_records (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`;
  return insert(sql, Object.values(values));
}

export function findSettlements(filters: { employerId?: number | null; status?: string | null; scopeEmployerId?: number | null; limit?: number }) {
  const params: SqlValue[] = [];
  const where: string[] = ['f.deleted_at IS NULL'];
  const employer = filters.scopeEmployerId ?? filters.employerId;
  if (employer) where.push(eqFilter('f.employer_id', employer, params).replace(/^\s*AND\s*/i, ''));
  if (filters.status && filters.status !== 'all') where.push(eqFilter('f.status', filters.status, params).replace(/^\s*AND\s*/i, ''));
  return query<PayrollRow>(
    `SELECT f.*, emp.name AS employee_name, emp.employee_number, emp.designation, e.company_name
       FROM full_final_settlements f
       JOIN employees emp ON emp.id = f.employee_id
       JOIN employers e ON e.id = f.employer_id
      WHERE ${where.join(' AND ')} ORDER BY f.created_at DESC LIMIT ${Math.min(Number(filters.limit ?? 200), 1000)}`,
    params
  );
}

export function findSettlementById(id: number) {
  return queryOne<PayrollRow>(
    `SELECT f.*, emp.name AS employee_name, emp.employee_number, emp.designation, emp.date_of_joining,
            emp.basic_salary, emp.da, emp.bank_name, emp.bank_account_number, emp.ifsc_code, e.company_name
       FROM full_final_settlements f
       JOIN employees emp ON emp.id = f.employee_id
       JOIN employers e ON e.id = f.employer_id
      WHERE f.id = ? AND f.deleted_at IS NULL LIMIT 1`,
    [id]
  );
}

export function insertSettlement(values: Record<string, SqlValue>) {
  const columns = Object.keys(values);
  const sql = `INSERT INTO full_final_settlements (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`;
  return insert(sql, Object.values(values));
}

export function updateSettlement(id: number, values: Record<string, SqlValue>) {
  const columns = Object.keys(values);
  if (!columns.length) return Promise.resolve(0);
  const sql = `UPDATE full_final_settlements SET ${columns.map((column) => `${column} = ?`).join(', ')} WHERE id = ?`;
  return execute(sql, [...Object.values(values), id]);
}

/* ══════════════════════════ options & lookups ═══════════════════════════ */

export function employerOptions() {
  return query<PayrollRow>(
    `SELECT id, company_name, employer_code, state FROM employers WHERE deleted_at IS NULL ORDER BY company_name ASC LIMIT 500`
  );
}

export function unitOptions(employerId?: number | null) {
  const params: SqlValue[] = [];
  const where = employerId ? eqFilter('u.employer_id', employerId, params).replace(/^\s*AND\s*/i, '') : '1 = 1';
  return query<PayrollRow>(
    `SELECT u.id, u.unit_name, u.employer_id FROM company_units u WHERE u.deleted_at IS NULL AND ${where} ORDER BY u.unit_name ASC LIMIT 500`,
    params
  );
}

export function departmentOptions(employerId?: number | null) {
  const params: SqlValue[] = [];
  const where = employerId ? eqFilter('d.employer_id', employerId, params).replace(/^\s*AND\s*/i, '') : '1 = 1';
  return query<PayrollRow>(
    `SELECT d.id, d.department_name, d.employer_id FROM departments d WHERE d.deleted_at IS NULL AND ${where} ORDER BY d.department_name ASC LIMIT 500`,
    params
  );
}

/** The employees a run includes: active, in scope, not deleted. */
export function payrollEmployees(employerId: number, unitId?: number | null, departmentId?: number | null) {
  const params: SqlValue[] = [employerId];
  const extra: string[] = [];
  if (unitId) extra.push(eqFilter('emp.unit_id', unitId, params).replace(/^\s*AND\s*/i, ''));
  if (departmentId) extra.push(eqFilter('emp.department_id', departmentId, params).replace(/^\s*AND\s*/i, ''));
  return query<PayrollRow>(
    `SELECT emp.id, emp.employee_number, emp.name, emp.designation, emp.unit_id, emp.department_id,
            emp.date_of_joining, emp.date_of_resignation, emp.bank_name, emp.bank_account_number, emp.ifsc_code,
            emp.weekly_off, emp.wage_type, emp.basic_salary, emp.da, emp.gross_salary, emp.status,
            emp.pf_number, emp.esi_number, u.unit_name, d.department_name
       FROM employees emp
       LEFT JOIN company_units u ON u.id = emp.unit_id
       LEFT JOIN departments d ON d.id = emp.department_id
      WHERE emp.deleted_at IS NULL AND emp.status = 'active' AND emp.employer_id = ?
        ${extra.length ? `AND ${extra.join(' AND ')}` : ''}
      ORDER BY emp.employee_number ASC`,
    params
  );
}

export function employeeRow(employeeId: number) {
  return queryOne<PayrollRow>(
    `SELECT emp.*, e.company_name, e.state AS employer_state, u.unit_name, d.department_name
       FROM employees emp
       JOIN employers e ON e.id = emp.employer_id
       LEFT JOIN company_units u ON u.id = emp.unit_id
       LEFT JOIN departments d ON d.id = emp.department_id
      WHERE emp.id = ? AND emp.deleted_at IS NULL LIMIT 1`,
    [employeeId]
  );
}

/** Holiday dates in a month that apply to an employer (its own + platform-wide). */
export function holidayDatesInMonth(employerId: number, from: string, to: string) {
  return query<PayrollRow>(
    `SELECT DISTINCT holiday_date FROM holidays
      WHERE deleted_at IS NULL AND holiday_date BETWEEN ? AND ?
        AND (employer_id IS NULL OR employer_id = ?)
      ORDER BY holiday_date ASC`,
    [from, to, employerId]
  );
}

/** Twelve months of payroll totals, for the employer's and admin's charts. */
export function monthlyTrend(employerId: number | null, year: number) {
  const params: SqlValue[] = [year];
  const scope = employerId ? eqFilter('employer_id', employerId, params).replace(/^\s*AND\s*/i, '') : '1 = 1';
  return query<PayrollRow>(
    `SELECT month, COUNT(*) AS runs, SUM(total_employees) AS employees, SUM(total_gross) AS gross,
            SUM(total_net) AS net, SUM(total_pf_employee) AS pf, SUM(total_esi_employee) AS esi
       FROM payroll_runs WHERE deleted_at IS NULL AND year = ? AND status <> 'Cancelled' AND ${scope}
      GROUP BY month ORDER BY month ASC`,
    params
  );
}

/* ═══════════════════════ attendance register (month matrix) ═══════════════════════ */

/**
 * One row per employee for the month, with the day-by-day codes beside the
 * totals — the shape a statutory attendance register is printed in.
 *
 * The per-day codes come back as a padded string of comma-separated codes
 * ("P,P,A,L,…") rather than as columns, because the number of days in a month
 * is not known to SQL here and the register is printed as a grid either way.
 */
export function attendanceMatrix(
  employerId: number,
  month: number,
  year: number,
  unitId?: number | null,
  departmentId?: number | null,
  limit = 500
) {
  const params: SqlValue[] = [employerId, year, month];
  const scope: string[] = [];
  if (unitId) scope.push(eqFilter('a.unit_id', unitId, params).replace(/^\s*AND\s*/i, ''));
  if (departmentId) scope.push(eqFilter('a.department_id', departmentId, params).replace(/^\s*AND\s*/i, ''));
  const extra = scope.length ? ` AND ${scope.join(' AND ')}` : '';

  return query<PayrollRow>(
    `SELECT emp.id AS employee_id, emp.name AS employee_name, emp.employee_number, emp.designation,
            COUNT(a.id) AS days_marked,
            SUM(CASE WHEN a.status IN ('Present','On Duty','Late','Comp Off') THEN 1 ELSE 0 END) AS present_days,
            SUM(CASE WHEN a.status = 'Half Day' THEN 1 ELSE 0 END) AS half_days,
            SUM(CASE WHEN a.status = 'Absent' THEN 1 ELSE 0 END) AS absent_days,
            SUM(CASE WHEN a.status = 'Leave' THEN 1 ELSE 0 END) AS leave_days,
            SUM(CASE WHEN a.status = 'Holiday' THEN 1 ELSE 0 END) AS holiday_days,
            SUM(CASE WHEN a.status = 'Weekly Off' THEN 1 ELSE 0 END) AS weekly_off_days,
            ROUND(COALESCE(SUM(a.worked_hours), 0), 1) AS worked_hours,
            ROUND(COALESCE(SUM(a.overtime_hours), 0), 1) AS overtime_hours,
            SUM(CASE WHEN a.late_minutes > 0 THEN 1 ELSE 0 END) AS late_count
       FROM attendance a
       JOIN employees emp ON emp.id = a.employee_id
      WHERE a.deleted_at IS NULL AND a.employer_id = ? AND a.year = ? AND a.month = ?${extra}
      GROUP BY emp.id, emp.name, emp.employee_number, emp.designation
      ORDER BY emp.employee_number ASC
      LIMIT ${Math.min(Number(limit ?? 500), 2000)}`,
    params
  );
}

/** The day-by-day codes behind the register: one row per employee per marked day. */
export function attendanceDayCodes(
  employerId: number,
  month: number,
  year: number,
  unitId?: number | null,
  departmentId?: number | null
) {
  const params: SqlValue[] = [employerId, year, month];
  const scope: string[] = [];
  if (unitId) scope.push(eqFilter('a.unit_id', unitId, params).replace(/^\s*AND\s*/i, ''));
  if (departmentId) scope.push(eqFilter('a.department_id', departmentId, params).replace(/^\s*AND\s*/i, ''));
  const extra = scope.length ? ` AND ${scope.join(' AND ')}` : '';

  return query<PayrollRow>(
    `SELECT a.employee_id, DATE_FORMAT(a.attendance_date, '%d') AS day_of_month, a.status
       FROM attendance a
      WHERE a.deleted_at IS NULL AND a.employer_id = ? AND a.year = ? AND a.month = ?${extra}
      ORDER BY a.employee_id ASC, a.attendance_date ASC`,
    params
  );
}
