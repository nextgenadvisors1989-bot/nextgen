/**
 * The employee's own working day, as the client sketched the profile: status, wage seen as today / this week / this month,
 * working days and hours, benefits, the month's deductions, PF / UAN, the salary slip, the full and final statement, and the
 * three things an employee does at work: check in, check out and ask for a short permission.
 *
 * Everything here is scoped to one employee id taken from the session, never from the request.
 */
import { execute, query, queryOne, type RowDataPacket } from '@/lib/db/mysql';

const n = (value: unknown) => Number(value ?? 0);
const round2 = (value: number) => Math.round(value * 100) / 100;
const pad = (value: number) => String(value).padStart(2, '0');
const ymd = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const hms = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;

/** Days a person is paid for: present, a half day counts half, paid leave, holiday and weekly off follow the register's own is_paid flag. */
const PAID_STATUSES = ['Present', 'Late', 'On Duty', 'Comp Off'];

function serviceError(message: string, code: string): Error {
  return Object.assign(new Error(message), { code });
}

export type WorkStatus = 'Active' | 'Long leave' | 'Exit';

export async function getWorkday(employeeId: number) {
  const employee = await queryOne<RowDataPacket>(
    `SELECT e.id, e.employer_id, e.name, e.employee_number, e.designation, e.department, e.photo, e.status, e.category, e.workforce_origin, e.employment_type, e.date_of_joining,
            e.gross_salary, e.wage_type, e.basic_salary, e.da, e.pf_number, e.uan, e.esi_number, e.working_hours_from, e.working_hours_to, em.company_name
       FROM employees e JOIN employers em ON em.id = e.employer_id WHERE e.id = ? AND e.deleted_at IS NULL`, [employeeId]);
  if (!employee) throw serviceError('Employee not found', 'NOT_FOUND');

  const now = new Date();
  const today = ymd(now);
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const monthStart = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;

  const [structure, rows, longLeave, payslip, increments, settlement, permissions] = await Promise.all([
    queryOne<RowDataPacket>(
      `SELECT gross_salary, wage_type, daily_wage FROM salary_structures WHERE employee_id = ? AND is_active = 1 AND deleted_at IS NULL AND effective_from <= ? AND (effective_to IS NULL OR effective_to >= ?)
        ORDER BY effective_from DESC LIMIT 1`, [employeeId, today, today]),
    query<RowDataPacket>(
      `SELECT attendance_date, status, in_time, out_time, worked_hours, overtime_hours, is_paid FROM attendance
        WHERE employee_id = ? AND deleted_at IS NULL AND attendance_date BETWEEN ? AND ? ORDER BY attendance_date`, [employeeId, monthStart, today]),
    queryOne<RowDataPacket>(
      `SELECT date_from, date_to, total_days FROM leave_applications WHERE employee_id = ? AND status = 'Approved' AND deleted_at IS NULL AND date_from <= ? AND date_to >= ? AND total_days >= 15
        ORDER BY date_from LIMIT 1`, [employeeId, today, today]),
    queryOne<RowDataPacket>(
      `SELECT id, month, year, gross_earnings, total_deductions, net_pay, pf_employee, esi_employee, professional_tax, lwf_amount, tds_amount, advance_deduction, canteen_deduction,
              other_deductions, lop_days, bonus_amount, overtime_amount, arrears_amount, paid_days
         FROM payslips WHERE employee_id = ? AND is_published = 1 AND deleted_at IS NULL ORDER BY year DESC, month DESC LIMIT 1`, [employeeId]),
    query<RowDataPacket>(
      `SELECT effective_from, gross_salary, revision_reason FROM salary_structures WHERE employee_id = ? AND deleted_at IS NULL ORDER BY effective_from DESC LIMIT 4`, [employeeId]),
    queryOne<RowDataPacket>(
      `SELECT id, settlement_number, status, net_settlement_amount FROM full_final_settlements WHERE employee_id = ? AND status IN ('Approved','Paid') AND deleted_at IS NULL ORDER BY id DESC LIMIT 1`, [employeeId]),
    query<RowDataPacket>(
      `SELECT id, permission_date, from_time, to_time, minutes, reason, status FROM employee_permissions WHERE employee_id = ? ORDER BY permission_date DESC, id DESC LIMIT 5`, [employeeId]),
  ]);

  // Pay rate per working day: a day-rated wage is the rate itself; a monthly wage is spread over 26 working days.
  const perDay = (structure?.wage_type ?? employee.wage_type) === 'Per Day'
    ? n(structure?.daily_wage ?? structure?.gross_salary ?? employee.gross_salary)
    : n(structure?.gross_salary ?? employee.gross_salary) / 26;
  const credit = (row: RowDataPacket) => (row.status === 'Half Day' ? 0.5 : PAID_STATUSES.includes(String(row.status)) ? 1 : 0);
  const weekFrom = ymd(monday);
  const dayOf = (row: RowDataPacket) => String(row.attendance_date instanceof Date ? ymd(row.attendance_date) : row.attendance_date).slice(0, 10);
  const earned = (predicate: (row: RowDataPacket) => boolean) => round2(rows.filter(predicate).reduce((sum, row) => sum + credit(row) * perDay, 0));
  const todayRow = rows.find((row) => dayOf(row) === today) ?? null;

  const workedDays = rows.reduce((sum, row) => sum + credit(row), 0);
  const workedHours = round2(rows.reduce((sum, row) => sum + n(row.worked_hours), 0));

  const status: WorkStatus = ['resigned', 'terminated', 'retired', 'absconding'].includes(String(employee.status)) ? 'Exit' : longLeave ? 'Long leave' : 'Active';
  const lop = payslip ? n(payslip.lop_days) : 0;

  return {
    employee: {
      id: Number(employee.id), name: String(employee.name), employeeNumber: String(employee.employee_number), designation: employee.designation ?? null, department: employee.department ?? null,
      photo: employee.photo ?? null, company: String(employee.company_name), joined: employee.date_of_joining ?? null, workforceOrigin: employee.workforce_origin ?? null, employmentType: employee.employment_type ?? null,
      category: employee.category ?? null,
    },
    status,
    longLeave: longLeave ? { from: longLeave.date_from, to: longLeave.date_to, days: n(longLeave.total_days) } : null,
    wage: { perDay: round2(perDay), today: earned((row) => dayOf(row) === today), week: earned((row) => dayOf(row) >= weekFrom), month: earned(() => true) },
    month: { label: `${now.toLocaleString('en-IN', { month: 'long' })} ${now.getFullYear()}`, workingDays: workedDays, workingHours: workedHours },
    today: todayRow ? { status: String(todayRow.status), inTime: todayRow.in_time ?? null, outTime: todayRow.out_time ?? null, workedHours: todayRow.worked_hours === null ? null : n(todayRow.worked_hours) } : null,
    benefits: {
      bonus: payslip ? n(payslip.bonus_amount) : 0, incentive: payslip ? n(payslip.overtime_amount) : 0, arrears: payslip ? n(payslip.arrears_amount) : 0,
      increments: increments.map((row) => ({ from: row.effective_from, gross: n(row.gross_salary), reason: row.revision_reason ?? null })),
    },
    deductions: payslip ? {
      period: `${n(payslip.month)}/${n(payslip.year)}`, total: n(payslip.total_deductions),
      esi: n(payslip.esi_employee), pf: n(payslip.pf_employee), other: round2(n(payslip.professional_tax) + n(payslip.lwf_amount) + n(payslip.tds_amount) + n(payslip.other_deductions)),
      damageOrLoss: n(payslip.other_deductions), absenceFromDuty: round2(lop * perDay), advanceRecovery: n(payslip.advance_deduction) + n(payslip.canteen_deduction),
    } : null,
    statutory: { pf: employee.pf_number ?? null, uan: employee.uan ?? null, esi: employee.esi_number ?? null },
    payslipId: payslip ? Number(payslip.id) : null,
    settlement: settlement ? { id: Number(settlement.id), number: String(settlement.settlement_number), status: String(settlement.status), net: n(settlement.net_settlement_amount) } : null,
    permissions: permissions.map((row) => ({ id: Number(row.id), date: row.permission_date, from: String(row.from_time).slice(0, 5), to: String(row.to_time).slice(0, 5), minutes: n(row.minutes), reason: String(row.reason), status: String(row.status) })),
  };
}

/** Check in or check out for today. In sets the arrival time; out sets the departure and works out the hours. */
export async function punch(employeeId: number, action: 'in' | 'out') {
  const employee = await queryOne<RowDataPacket>('SELECT id, employer_id, unit_id, department_id, status FROM employees WHERE id = ? AND deleted_at IS NULL', [employeeId]);
  if (!employee) throw serviceError('Employee not found', 'NOT_FOUND');
  if (String(employee.status) !== 'active') throw serviceError('Only an active employee can check in or out', 'INVALID_STATE');
  const now = new Date();
  const today = ymd(now);
  const existing = await queryOne<RowDataPacket>('SELECT id, in_time, out_time, status FROM attendance WHERE employee_id = ? AND attendance_date = ? AND deleted_at IS NULL', [employeeId, today]);

  if (action === 'in') {
    if (existing?.in_time) throw serviceError(`You already checked in today at ${String(existing.in_time).slice(0, 5)}`, 'INVALID_STATE');
    if (existing && ['Leave', 'Holiday', 'Weekly Off'].includes(String(existing.status))) throw serviceError(`Today is marked ${String(existing.status)} on your attendance`, 'INVALID_STATE');
    if (existing) {
      await execute("UPDATE attendance SET in_time = ?, status = 'Present', source = 'Self', updated_by = NULL WHERE id = ?", [hms(now), existing.id]);
    } else {
      await execute(
        `INSERT INTO attendance (employer_id, unit_id, department_id, employee_id, attendance_date, month, year, status, in_time, is_paid, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'Present', ?, 1, 'Self')`,
        [employee.employer_id, employee.unit_id, employee.department_id, employeeId, today, now.getMonth() + 1, now.getFullYear(), hms(now)]);
    }
    return { action, time: hms(now).slice(0, 5) };
  }

  if (!existing?.in_time) throw serviceError('Check in first - there is no arrival time for today', 'INVALID_STATE');
  if (existing.out_time) throw serviceError(`You already checked out today at ${String(existing.out_time).slice(0, 5)}`, 'INVALID_STATE');
  const [h, m, s] = String(existing.in_time).split(':').map(Number);
  const arrived = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, s ?? 0);
  const hours = round2(Math.max(0, (now.getTime() - arrived.getTime()) / 3600000));
  await execute('UPDATE attendance SET out_time = ?, worked_hours = ?, source = ? WHERE id = ?', [hms(now), hours, 'Self', existing.id]);
  return { action, time: hms(now).slice(0, 5), workedHours: hours };
}

export async function requestPermission(employeeId: number, input: { date: string; from: string; to: string; reason: string }) {
  const employee = await queryOne<RowDataPacket>('SELECT id, employer_id, status FROM employees WHERE id = ? AND deleted_at IS NULL', [employeeId]);
  if (!employee) throw serviceError('Employee not found', 'NOT_FOUND');
  if (String(employee.status) !== 'active') throw serviceError('Only an active employee can ask for permission', 'INVALID_STATE');
  const toMinutes = (value: string) => { const [h, m] = value.split(':').map(Number); return h * 60 + m; };
  const minutes = toMinutes(input.to) - toMinutes(input.from);
  if (!(minutes > 0)) throw serviceError('The end time must be after the start time', 'VALIDATION_FAILED');
  if (minutes > 240) throw serviceError('A permission is for up to 4 hours; apply for leave for longer', 'VALIDATION_FAILED');
  if (input.date < ymd(new Date())) throw serviceError('A permission cannot be asked for a past date', 'VALIDATION_FAILED');
  const overlap = await queryOne<RowDataPacket>(
    `SELECT id FROM employee_permissions WHERE employee_id = ? AND permission_date = ? AND status IN ('Pending','Approved') AND from_time < ? AND to_time > ?`, [employeeId, input.date, input.to, input.from]);
  if (overlap) throw serviceError('You already have a permission request for that time', 'DUPLICATE');
  const result = await execute(
    'INSERT INTO employee_permissions (employer_id, employee_id, permission_date, from_time, to_time, minutes, reason) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [employee.employer_id, employeeId, input.date, input.from, input.to, minutes, input.reason.trim()]);
  return { id: result.insertId, minutes };
}

export async function cancelPermission(employeeId: number, permissionId: number) {
  const row = await queryOne<RowDataPacket>('SELECT id, status FROM employee_permissions WHERE id = ? AND employee_id = ?', [permissionId, employeeId]);
  if (!row) throw serviceError('Permission request not found', 'NOT_FOUND');
  if (row.status !== 'Pending') throw serviceError(`A ${String(row.status).toLowerCase()} request cannot be cancelled`, 'INVALID_STATE');
  await execute("UPDATE employee_permissions SET status = 'Cancelled' WHERE id = ?", [permissionId]);
}

/* ───────────────────────────── employer side ───────────────────────────── */

export async function listPermissions(employerId: number, status: string | null) {
  return query<RowDataPacket>(
    `SELECT p.id, p.permission_date, p.from_time, p.to_time, p.minutes, p.reason, p.status, p.decision_note, p.decided_at, e.name AS employee_name, e.employee_number
       FROM employee_permissions p JOIN employees e ON e.id = p.employee_id
      WHERE p.employer_id = ? ${status ? 'AND p.status = ?' : ''} ORDER BY (p.status = 'Pending') DESC, p.permission_date DESC, p.id DESC LIMIT 200`,
    status ? [employerId, status] : [employerId]);
}

export async function decidePermission(employerId: number, permissionId: number, decision: 'Approved' | 'Rejected', userId: number, note: string | null) {
  const row = await queryOne<RowDataPacket>('SELECT id, status FROM employee_permissions WHERE id = ? AND employer_id = ?', [permissionId, employerId]);
  if (!row) throw serviceError('Permission request not found', 'NOT_FOUND');
  if (row.status !== 'Pending') throw serviceError(`This request is already ${String(row.status).toLowerCase()}`, 'INVALID_STATE');
  await execute('UPDATE employee_permissions SET status = ?, decided_by = ?, decided_at = NOW(), decision_note = ? WHERE id = ?', [decision, userId, note, permissionId]);
}
