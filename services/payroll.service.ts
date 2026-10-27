/**
 * The payroll engine and the registers around it.
 *
 * The engine is deliberately a pure function of rows it can re-read: given a run
 * and a month, it loads each employee's live salary structure, that month's
 * attendance, the approved leave, the holidays and the employer's statutory
 * switches, and produces one payslip per employee with every wage head split
 * out into `payroll_items`. Recomputing a run replaces what was there — it never
 * appends — which is what makes "recalculate" safe to press.
 *
 * Order of operations, and why:
 *
 *   1. **Load the scope.** Active employees of the employer, narrowed to the
 *      unit/department, minus anyone the caller excluded and minus anyone whose
 *      employment started after the period ended or ended before it began.
 *   2. **Count the days.** Attendance for the month decides present, absent,
 *      half, leave, holiday and weekly-off days, and the overtime hours. When no
 *      attendance has been marked at all the calendar decides (weekly offs and
 *      holidays are still paid days off) — the engine never invents absences.
 *   3. **Prorate the contract.** A monthly wage is paid in full when every day
 *      is payable, and in proportion otherwise. Per-day structures multiply the
 *      daily wage by the paid days instead.
 *   4. **Apply the heads.** Basic, DA, HRA, TA, PA, EA, NPBA, other allowances,
 *      then the extra heads the structure carries (from the 25-head catalogue),
 *      then overtime at twice the ordinary rate.
 *   5. **Take the deductions.** PF and ESI from the statutory rates (or the
 *      structure's overrides), professional tax from the state table unless the
 *      structure sets its own, LWF in the months the state collects it, VPF, and
 *      a *provisional* TDS that is labelled as provisional everywhere it shows.
 *   6. **Write it down.** The payslip totals are stored, not recomputed on read,
 *      because a payslip is a statement of what was paid — the numbers must not
 *      move when a policy changes next year.
 *
 * Runs move Draft → Calculated → Approved → Locked → Paid. Only Draft and
 * Calculated are editable; locking freezes the payslips, paying publishes them
 * to the employees and stamps the payment.
 */
import { randomUUID } from 'node:crypto';
import { execute, query, queryOne } from '@/lib/db/mysql';
import type { PayrollRow } from '@/repositories/payroll.repository';
import type { SqlValue } from '@/lib/db/query-helpers';
import { withTransaction } from '@/lib/db/transactions';
import * as repo from '@/repositories/payroll.repository';
import {
  payrollRunSchema, payrollRunUpdateSchema, salaryStructureSchema,
  bonusSchema, gratuitySchema, settlementSchema, attendanceRowSchema, attendanceBulkSchema,
  leaveApplicationSchema, leaveDecisionSchema, leaveTypeSchema, PAYROLL_RUN_STATUSES,
  PAYMENT_STATUSES, monthBounds, monthLabel,
} from '@/lib/validations/payroll.validation';
import {
  STATUTORY_RATES, professionalTax, labourWelfareFund, provisionalMonthlyTds,
  gratuityAmount, statutoryBonus, tallyAttendance, prorate, pfWages,
} from '@/lib/payroll/statutory';
import { writeActivityLog } from '@/lib/logger/activity-log';
import { notifyMany, usersWithRole } from '@/lib/notifications/notification-service';
import { sendTemplateEmail } from '@/lib/notifications/email-service';
import { sendTemplateSms } from '@/lib/notifications/sms-service';
import { sendTemplateWhatsApp } from '@/lib/notifications/whatsapp-service';
import { nextDocumentNumber } from '@/lib/utils/report-number';
import { APP_URL } from '@/lib/utils/constants';
import { formatCurrency, numberToWords } from '@/lib/utils/formatting';
import { generatePayslipPdf } from '@/lib/pdf/payslip-pdf';
import { saveGeneratedFile } from '@/lib/files/file-service';
import type { AuthUser } from '@/types/user';

export interface ActorContext {
  user: AuthUser;
  ip?: string | null;
  userAgent?: string | null;
}

type ServiceError = Error & { code: string; issues?: { field: string; message: string }[] };

const notFound = (resource: string): ServiceError => Object.assign(new Error(`${resource} not found`), { code: 'NOT_FOUND' });
const conflict = (code: string, message: string): ServiceError => Object.assign(new Error(message), { code });
const validationFailed = (issues: { field: string; message: string }[]): ServiceError =>
  Object.assign(new Error('Please correct the highlighted fields'), { code: 'VALIDATION_FAILED', issues });
const forbidden = (message: string): ServiceError => Object.assign(new Error(message), { code: 'FORBIDDEN' });

function actorFields(actor: ActorContext) {
  return {
    userId: actor.user.id,
    userName: actor.user.fullName,
    userRole: actor.user.primaryRole,
    employerId: actor.user.employerId ?? null,
    ipAddress: actor.ip ?? null,
    userAgent: actor.userAgent ?? null,
  };
}

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/* ══════════════════════════════════ runs ════════════════════════════════ */

export async function listRuns(filters: repo.RunListFilters) {
  const [result, stats] = await Promise.all([repo.findRuns(filters), repo.runStats(filters)]);
  return { ...result, stats, data: result.data.map(shapeRun) };
}

function shapeRun(row: PayrollRow) {
  return Object.assign(row, {
    id: Number(row.id),
    employer_id: Number(row.employer_id),
    unit_id: row.unit_id === null ? null : Number(row.unit_id),
    department_id: row.department_id === null ? null : Number(row.department_id),
    month: Number(row.month),
    year: Number(row.year),
    period_from: row.period_from ? String(row.period_from).slice(0, 10) : null,
    period_to: row.period_to ? String(row.period_to).slice(0, 10) : null,
    total_employees: Number(row.total_employees ?? 0),
    total_gross: Number(row.total_gross ?? 0),
    total_deductions: Number(row.total_deductions ?? 0),
    total_net: Number(row.total_net ?? 0),
    payslip_count: Number(row.payslip_count ?? 0),
    month_label: monthLabel(Number(row.month), Number(row.year)),
    processed_by: row.processed_by === null || row.processed_by === undefined ? null : Number(row.processed_by),
    processed_by_name: row.processed_by_first
      ? `${String(row.processed_by_first)} ${String(row.processed_by_last ?? '')}`.trim()
      : null,
    approved_by_name: row.approved_by_first
      ? `${String(row.approved_by_first)} ${String(row.approved_by_last ?? '')}`.trim()
      : null,
  });
}

export async function getRun(runId: number, employerId?: number | null) {
  const row = await repo.findRunById(runId, employerId);
  if (!row) throw notFound('Payroll run');
  const [payslips, stats] = await Promise.all([repo.findRunPayslips(runId), repo.payslipStats({ runId })]);
  return Object.assign(shapeRun(row), { payslips: payslips.map(shapePayslip), stats });
}

export async function createRun(payload: unknown, actor: ActorContext) {
  const input = payrollRunSchema.parse(payload);
  const bounds = monthBounds(input.year, input.month);

  const employer = await queryOne<PayrollRow>(
    'SELECT id, company_name, employer_code FROM employers WHERE id = ? AND deleted_at IS NULL LIMIT 1',
    [input.employer_id]
  );
  if (!employer) throw validationFailed([{ field: 'employer_id', message: 'That company does not exist' }]);

  const existing = await repo.findRunForPeriod(input.employer_id, input.month, input.year, input.unit_id ?? null, input.department_id ?? null);
  if (existing) {
    throw conflict(
      'DUPLICATE',
      `Payroll for ${monthLabel(input.month, input.year)} has already been created for ${String(employer.company_name)} — ${String(existing.run_number)} (${String(existing.status)})`
    );
  }

  const runNumber = await nextDocumentNumber('payrollRun');
  const runId = await repo.insertRun({
    uuid: randomUUID(),
    run_number: runNumber,
    employer_id: input.employer_id,
    unit_id: input.unit_id ?? null,
    department_id: input.department_id ?? null,
    month: input.month,
    year: input.year,
    period_from: input.period_from || bounds.from,
    period_to: input.period_to || bounds.to,
    status: 'Draft',
    calculation_notes: input.calculation_notes ?? null,
    excluded_employee_ids: input.exclude_employee_ids?.length ? JSON.stringify(input.exclude_employee_ids) : null,
    created_by: actor.user.id,
    updated_by: actor.user.id,
  });

  await writeActivityLog({
    ...actorFields(actor),
    action: 'created',
    module: 'payroll',
    entityType: 'payroll_run',
    entityId: runId,
    entityLabel: runNumber,
    description: `Payroll run ${runNumber} created for ${String(employer.company_name)} — ${monthLabel(input.month, input.year)}`,
    newValues: { employer_id: input.employer_id, month: input.month, year: input.year, unit_id: input.unit_id ?? null },
  });

  return getRun(runId);
}

export async function updateRun(runId: number, payload: unknown, actor: ActorContext,
  scope?: { employerId?: number | null },
) {
  const run = await repo.findRunById(runId, scope?.employerId ?? null);
  if (!run) throw notFound('Payroll run');
  if (!['Draft', 'Calculated'].includes(String(run.status))) {
    throw conflict('INVALID_STATE', `A ${String(run.status).toLowerCase()} run cannot be edited — reopen it first`);
  }
  const input = payrollRunUpdateSchema.parse(payload);
  const changed: Record<string, { from: unknown; to: unknown }> = {};
  const values: Record<string, string | number | null> = {};

  const map: [string, unknown][] = [
    ['period_from', input.period_from === undefined ? undefined : input.period_from],
    ['period_to', input.period_to === undefined ? undefined : input.period_to],
    ['calculation_notes', input.calculation_notes === undefined ? undefined : input.calculation_notes],
    ['unit_id', input.unit_id === undefined ? undefined : input.unit_id],
    ['department_id', input.department_id === undefined ? undefined : input.department_id],
  ];
  for (const [column, value] of map) {
    if (value === undefined) continue;
    const current = (run as unknown as Record<string, unknown>)[column];
    const next = value === null ? null : (value as string | number);
    if (String(current ?? '') !== String(next ?? '')) {
      changed[column] = { from: current, to: next };
      values[column] = next as string | number | null;
    }
  }
  if (!Object.keys(changed).length) throw conflict('NO_CHANGE', 'Nothing about this run was changed');

  values.updated_by = actor.user.id;
  await repo.updateRun(runId, values);
  await writeActivityLog({
    ...actorFields(actor),
    action: 'updated',
    module: 'payroll',
    entityType: 'payroll_run',
    entityId: runId,
    entityLabel: String(run.run_number),
    description: `Payroll run ${String(run.run_number)} updated — ${Object.keys(changed).join(', ')}`,
    oldValues: Object.fromEntries(Object.entries(changed).map(([key, value]) => [key, value.from])),
    newValues: Object.fromEntries(Object.entries(changed).map(([key, value]) => [key, value.to])),
  });
  return getRun(runId);
}

/**
 * Computes (or recomputes) a run.
 *
 * This is the engine. It is idempotent: the payslips of the run are deleted and
 * rebuilt inside one transaction, so a recalculation after an attendance
 * correction produces exactly the payroll that the corrected data implies.
 */
export async function calculateRun(runId: number, actor: ActorContext,
  scope?: { employerId?: number | null },
) {
  const run = await repo.findRunById(runId, scope?.employerId ?? null);
  if (!run) throw notFound('Payroll run');
  if (['Locked', 'Paid', 'Cancelled'].includes(String(run.status))) {
    throw conflict('INVALID_STATE', `A ${String(run.status).toLowerCase()} run cannot be recalculated`);
  }

  const employerId = Number(run.employer_id);
  const month = Number(run.month);
  const year = Number(run.year);
  const unitId = run.unit_id === null ? null : Number(run.unit_id);
  const departmentId = run.department_id === null ? null : Number(run.department_id);
  const bounds = monthBounds(year, month);
  const periodFrom = run.period_from ? String(run.period_from).slice(0, 10) : bounds.from;
  const periodTo = run.period_to ? String(run.period_to).slice(0, 10) : bounds.to;
  const calendarDays = bounds.days;

  const [employees, holidays, employerRow] = await Promise.all([
    repo.payrollEmployees(employerId, unitId, departmentId),
    repo.holidayDatesInMonth(employerId, periodFrom, periodTo),
    queryOne<PayrollRow>('SELECT company_name, state FROM employers WHERE id = ? LIMIT 1', [employerId]),
  ]);

  // Employees the operator left out when the run was created stay out of a
  // recalculation too — excluding them once must not be undone by pressing
  // calculate again.
  let excludedIds: number[] = [];
  try {
    const raw = (run as unknown as { excluded_employee_ids?: unknown }).excluded_employee_ids;
    if (raw) excludedIds = (typeof raw === 'string' ? JSON.parse(raw) : raw) as number[];
  } catch {
    excludedIds = [];
  }
  const excluded = new Set(excludedIds.map((value) => Number(value)));

  const eligible = employees.filter((row) => {
    const joining = row.date_of_joining ? String(row.date_of_joining).slice(0, 10) : null;
    const leaving = row.date_of_resignation ? String(row.date_of_resignation).slice(0, 10) : null;
    if (joining && joining > periodTo) return false;
    if (leaving && leaving < periodFrom) return false;
    if (excluded.has(Number(row.id))) return false;
    return true;
  });

  if (!eligible.length) {
    throw conflict(
      'NO_EMPLOYEES',
      `No active employee falls in this period for ${String(employerRow?.company_name ?? 'this company')}${unitId || departmentId ? ' in that unit/department' : ''}`
    );
  }

  const holidayCount = holidays.length;
  const skipped: { employee: string; reason: string }[] = [];
  const computed: {
    employeeId: number;
    values: Record<string, unknown>;
    items: { head_code: string; head_name: string; head_name_ta: string | null; head_type: string; amount: number; is_statutory: number; sort_order: number }[];
  }[] = [];

  // The head catalogue, so the extras on a structure carry their Tamil name and
  // whether they are statutory.
  const heads = await query<PayrollRow>(
    'SELECT id, head_code, head_name, head_name_ta, head_type, is_statutory, sort_order FROM payroll_heads WHERE status = ?',
    ['active']
  );
  const headByCode = new Map(heads.map((head) => [String(head.head_code).toUpperCase(), head]));

  for (const employee of eligible) {
    const employeeId = Number(employee.id);
    const structure = await repo.liveStructure(employeeId, periodTo);
    if (!structure) {
      skipped.push({
        employee: `${String(employee.employee_number)} — ${String(employee.name)}`,
        reason: 'No salary structure is in force. Give the employee a structure and recalculate.',
      });
      continue;
    }

    const [attendanceRows, structureItems] = await Promise.all([
      repo.attendanceForEmployeeMonth(employeeId, year, month),
      repo.liveStructureItems(Number(structure.id)),
    ]);

    const tallies = tallyAttendance(
      attendanceRows.map((row) => ({
        status: String(row.status),
        overtime_hours: row.overtime_hours,
        leave_paid: row.leave_paid,
      })),
      {
        year,
        month,
        weeklyOffDay: Number(employee.weekly_off ?? 0),
        holidays: holidayCount,
      }
    );

    // `tallyAttendance` has already discounted unpaid leave, because every
    // attendance row carries the paid flag of the leave type behind it.
    const lopDays = round2(tallies.lopDays);
    const paidDays = round2(tallies.paidDays);

    const perDay = String(structure.wage_type) === 'Per Day';
    const paid = perDay ? round2(Number(structure.daily_wage ?? 0) * tallies.paidDays) : prorate(Number(structure.basic ?? 0), tallies.paidDays, calendarDays);
    const factor = perDay
      ? (Number(structure.basic ?? 0) > 0 ? paid / Number(structure.basic) : 1)
      : calendarDays > 0 ? Math.max(0, Math.min(1, tallies.paidDays / calendarDays)) : 0;

    const basic = round2(paid);
    const da = perDay ? round2(Number(structure.da ?? 0) * tallies.paidDays) : prorate(Number(structure.da ?? 0), tallies.paidDays, calendarDays);
    const hra = prorate(Number(structure.hra ?? 0), perDay ? tallies.paidDays : calendarDays * factor, calendarDays);
    const ta = prorate(Number(structure.ta ?? 0), perDay ? tallies.paidDays : calendarDays * factor, calendarDays);
    const pa = prorate(Number(structure.pa ?? 0), perDay ? tallies.paidDays : calendarDays * factor, calendarDays);
    const ea = prorate(Number(structure.ea ?? 0), perDay ? tallies.paidDays : calendarDays * factor, calendarDays);
    const npba = prorate(Number(structure.npba ?? 0), perDay ? tallies.paidDays : calendarDays * factor, calendarDays);
    const other = prorate(Number(structure.other_allowances ?? 0), perDay ? tallies.paidDays : calendarDays * factor, calendarDays);

    const contractMonthly = round2(
      Number(structure.basic ?? 0) + Number(structure.da ?? 0) + Number(structure.hra ?? 0) + Number(structure.ta ?? 0) +
      Number(structure.pa ?? 0) + Number(structure.ea ?? 0) + Number(structure.npba ?? 0) + Number(structure.other_allowances ?? 0)
    );

    // Overtime is paid at twice the ordinary rate; the ordinary rate is the
    // monthly basic + DA spread over 26 days of 8 hours.
    const overtimeRate = ((Number(structure.basic ?? 0) + Number(structure.da ?? 0)) / STATUTORY_RATES.overtime.monthlyDivisor)
      / STATUTORY_RATES.overtime.hoursPerDay;
    const overtimeAmount = round2(tallies.overtimeHours * overtimeRate * STATUTORY_RATES.overtime.multiplier);

    const extraEarnings: { code: string; name: string; nameTa: string | null; amount: number; statutory: boolean; order: number }[] = [];
    for (const item of structureItems) {
      if (String(item.head_type) !== 'Earning') continue;
      const code = String(item.head_code).toUpperCase();
      const amount = item.percent_of_basic !== null && Number(item.percent_of_basic) > 0
        ? round2((basic * Number(item.percent_of_basic)) / 100)
        : round2(Number(item.amount ?? 0) * factor);
      if (amount === 0) continue;
      const head = headByCode.get(code);
      extraEarnings.push({
        code,
        name: String(head?.head_name ?? item.head_name),
        nameTa: (head?.head_name_ta as string | null) ?? null,
        amount,
        statutory: Number(head?.is_statutory ?? 0) === 1,
        order: Number(head?.sort_order ?? 900) + Number(item.sort_order ?? 0),
      });
    }

    const grossEarnings = round2(
      basic + da + hra + ta + pa + ea + npba + other + overtimeAmount +
      extraEarnings.reduce((total, item) => total + item.amount, 0)
    );

    /* ── deductions ─────────────────────────────────────────────────── */

    const pfBase = pfWages(basic, da, structure.pf_wage_ceiling === null ? undefined : Number(structure.pf_wage_ceiling));
    const pfEmployeePercent = structure.pf_employee_percent === null ? STATUTORY_RATES.pf.employeePercent : Number(structure.pf_employee_percent);
    const pfEmployerPercent = structure.pf_employer_percent === null ? STATUTORY_RATES.pf.employerPercent : Number(structure.pf_employer_percent);
    const pfEmployee = Number(structure.pf_applicable) === 1 ? round2((pfBase * pfEmployeePercent) / 100) : 0;
    const pfEmployer = Number(structure.pf_applicable) === 1 ? round2((pfBase * pfEmployerPercent) / 100) : 0;
    const vpf = Number(structure.pf_applicable) === 1 && Number(structure.vpf_percent ?? 0) > 0
      ? round2((pfBase * Number(structure.vpf_percent)) / 100)
      : 0;

    const esiCeiling = structure.esi_wage_ceiling === null ? STATUTORY_RATES.esi.ceiling : Number(structure.esi_wage_ceiling);
    const esiApplies = Number(structure.esi_applicable) === 1 && (esiCeiling <= 0 || grossEarnings <= esiCeiling);
    const esiEmployeePercent = structure.esi_employee_percent === null ? STATUTORY_RATES.esi.employeePercent : Number(structure.esi_employee_percent);
    const esiEmployerPercent = structure.esi_employer_percent === null ? STATUTORY_RATES.esi.employerPercent : Number(structure.esi_employer_percent);
    const esiEmployee = esiApplies ? Math.ceil((grossEarnings * esiEmployeePercent) / 100) : 0;
    const esiEmployer = esiApplies ? Math.ceil((grossEarnings * esiEmployerPercent) / 100) : 0;

    const employerState = structure.pt_state
      ? String(structure.pt_state)
      : (employee as unknown as { employer_state?: string }).employer_state ?? (employerRow?.state as string | null) ?? 'Tamil Nadu';
    const professionalTaxAmount = Number(structure.pt_amount ?? 0) > 0
      ? Number(structure.pt_amount)
      : professionalTax(employerState, grossEarnings);

    const lwf = Number(structure.lwf_applicable) === 1
      ? labourWelfareFund(employerState, month, structure.lwf_amount === null ? null : Number(structure.lwf_amount))
      : { applies: false, employee: 0, employer: 0 };

    const monthlyTaxable = grossEarnings;
    const tds = provisionalMonthlyTds(monthlyTaxable);

    const extraDeductions: { code: string; name: string; nameTa: string | null; amount: number; statutory: boolean; order: number }[] = [];
    for (const item of structureItems) {
      if (String(item.head_type) !== 'Deduction') continue;
      const code = String(item.head_code).toUpperCase();
      if (['PF', 'ESI', 'PT', 'LWF', 'TDS', 'VPF'].includes(code)) continue; // already computed above
      const amount = item.percent_of_basic !== null && Number(item.percent_of_basic) > 0
        ? round2((basic * Number(item.percent_of_basic)) / 100)
        : round2(Number(item.amount ?? 0));
      if (amount === 0) continue;
      const head = headByCode.get(code);
      extraDeductions.push({
        code,
        name: String(head?.head_name ?? item.head_name),
        nameTa: (head?.head_name_ta as string | null) ?? null,
        amount,
        statutory: Number(head?.is_statutory ?? 0) === 1,
        order: Number(head?.sort_order ?? 900) + Number(item.sort_order ?? 0),
      });
    }

    const totalDeductions = round2(
      pfEmployee + vpf + esiEmployee + professionalTaxAmount + lwf.employee + tds +
      extraDeductions.reduce((total, item) => total + item.amount, 0)
    );
    const netPay = round2(Math.max(0, grossEarnings - totalDeductions));

    computed.push({
      employeeId,
      values: {
        employer_id: employerId,
        employee_id: employeeId,
        unit_id: employee.unit_id === null ? null : Number(employee.unit_id),
        department_id: employee.department_id === null ? null : Number(employee.department_id),
        month,
        year,
        period_from: periodFrom,
        period_to: periodTo,
        working_days: calendarDays - tallies.weeklyOffDays - tallies.holidayDays,
        paid_days: tallies.paidDays,
        lop_days: lopDays,
        present_days: tallies.presentDays,
        absent_days: tallies.absentDays,
        leave_days: tallies.leaveDays,
        holiday_days: tallies.holidayDays,
        weekly_off_days: tallies.weeklyOffDays,
        overtime_hours: tallies.overtimeHours,
        basic,
        da,
        hra,
        ta,
        pa,
        ea,
        npba,
        other_allowances: other,
        overtime_amount: overtimeAmount,
        bonus_amount: 0,
        arrears_amount: 0,
        gross_earnings: grossEarnings,
        pf_employee: pfEmployee,
        pf_employer: pfEmployer,
        vpf_amount: vpf,
        esi_employee: esiEmployee,
        esi_employer: esiEmployer,
        professional_tax: professionalTaxAmount,
        lwf_amount: lwf.employee,
        tds_amount: tds,
        total_deductions: totalDeductions,
        net_pay: netPay,
        net_pay_in_words: numberToWords(netPay, { currency: true }),
        payment_mode: 'Bank Transfer',
        payment_status: 'Pending',
        is_published: 0,
        bank_name: employee.bank_name ?? null,
        bank_account_number: employee.bank_account_number ?? null,
        ifsc_code: employee.ifsc_code ?? null,
        remarks: null,
        __contractMonthly: contractMonthly,
      },
      items: [
        { head_code: 'BASIC', head_name: 'Basic Salary', head_name_ta: 'அடிப்படை ஊதியம்', head_type: 'Earning', amount: basic, is_statutory: 0, sort_order: 10 },
        ...(da ? [{ head_code: 'DA', head_name: 'Dearness Allowance', head_name_ta: 'அகவிலைப்படி', head_type: 'Earning', amount: da, is_statutory: 0, sort_order: 20 }] : []),
        ...(hra ? [{ head_code: 'HRA', head_name: 'House Rent Allowance', head_name_ta: 'வீட்டு வாடகைப்படி', head_type: 'Earning', amount: hra, is_statutory: 0, sort_order: 30 }] : []),
        ...(ta ? [{ head_code: 'TA', head_name: 'Travel Allowance', head_name_ta: 'பயணப்படி', head_type: 'Earning', amount: ta, is_statutory: 0, sort_order: 40 }] : []),
        ...(pa ? [{ head_code: 'PA', head_name: 'Personal Allowance', head_name_ta: null, head_type: 'Earning', amount: pa, is_statutory: 0, sort_order: 50 }] : []),
        ...(ea ? [{ head_code: 'EA', head_name: 'Education Allowance', head_name_ta: null, head_type: 'Earning', amount: ea, is_statutory: 0, sort_order: 60 }] : []),
        ...(npba ? [{ head_code: 'NPBA', head_name: 'Non-Practising Allowance', head_name_ta: null, head_type: 'Earning', amount: npba, is_statutory: 0, sort_order: 70 }] : []),
        ...(other ? [{ head_code: 'OTHER', head_name: 'Other Allowances', head_name_ta: null, head_type: 'Earning', amount: other, is_statutory: 0, sort_order: 80 }] : []),
        ...extraEarnings.map((item) => ({
          head_code: item.code, head_name: item.name, head_name_ta: item.nameTa, head_type: 'Earning',
          amount: item.amount, is_statutory: item.statutory ? 1 : 0, sort_order: item.order,
        })),
        ...(overtimeAmount ? [{ head_code: 'OT', head_name: 'Overtime', head_name_ta: 'கூடுதல் நேரம்', head_type: 'Earning', amount: overtimeAmount, is_statutory: 0, sort_order: 90 }] : []),
        ...(pfEmployee ? [{ head_code: 'PF', head_name: 'Provident Fund (EPF)', head_name_ta: 'வருங்கால வைப்பு நிதி', head_type: 'Deduction', amount: pfEmployee, is_statutory: 1, sort_order: 200 }] : []),
        ...(vpf ? [{ head_code: 'VPF', head_name: 'Voluntary Provident Fund', head_name_ta: null, head_type: 'Deduction', amount: vpf, is_statutory: 0, sort_order: 210 }] : []),
        ...(esiEmployee ? [{ head_code: 'ESI', head_name: 'ESI Contribution', head_name_ta: 'ஈ.எஸ்.ஐ பங்களிப்பு', head_type: 'Deduction', amount: esiEmployee, is_statutory: 1, sort_order: 220 }] : []),
        ...(professionalTaxAmount ? [{ head_code: 'PT', head_name: 'Professional Tax', head_name_ta: 'தொழில் வரி', head_type: 'Deduction', amount: professionalTaxAmount, is_statutory: 1, sort_order: 230 }] : []),
        ...(lwf.employee ? [{ head_code: 'LWF', head_name: 'Labour Welfare Fund', head_name_ta: 'தொழிலாளர் நல நிதி', head_type: 'Deduction', amount: lwf.employee, is_statutory: 1, sort_order: 240 }] : []),
        ...(tds ? [{ head_code: 'TDS', head_name: 'TDS / Income Tax (provisional)', head_name_ta: null, head_type: 'Deduction', amount: tds, is_statutory: 1, sort_order: 250 }] : []),
        ...extraDeductions.map((item) => ({
          head_code: item.code, head_name: item.name, head_name_ta: item.nameTa, head_type: 'Deduction',
          amount: item.amount, is_statutory: item.statutory ? 1 : 0, sort_order: item.order,
        })),
        ...(pfEmployer ? [{ head_code: 'PF_ER', head_name: 'Employer PF Contribution', head_name_ta: null, head_type: 'Employer Contribution', amount: pfEmployer, is_statutory: 1, sort_order: 300 }] : []),
        ...(esiEmployer ? [{ head_code: 'ESI_ER', head_name: 'Employer ESI Contribution', head_name_ta: null, head_type: 'Employer Contribution', amount: esiEmployer, is_statutory: 1, sort_order: 310 }] : []),
      ],
    });
  }

  if (!computed.length) {
    throw conflict('NO_EMPLOYEES', 'None of the employees in this period has a salary structure — nothing could be calculated');
  }

  // Write it all in one transaction: a half-written run is worse than none.
  await withTransaction(async (tx) => {
    await repo.deleteRunPayslips(runId, tx);

    for (const slip of computed) {
      const values = { ...slip.values };
      delete (values as Record<string, unknown>).__contractMonthly;
      const payslipNumber = await nextDocumentNumber('payslip');
      const payslipId = await repo.insertPayslip({
        uuid: randomUUID(),
        payslip_number: payslipNumber,
        payroll_run_id: runId,
        ...values,
        created_by: actor.user.id,
        updated_by: actor.user.id,
      } as Record<string, SqlValue>, tx);

      await repo.insertPayrollItems(
        slip.items.map((item, index) => ({
          payslip_id: payslipId,
          payroll_run_id: runId,
          head_id: null,
          head_code: item.head_code,
          head_name: item.head_name,
          head_name_ta: item.head_name_ta,
          head_type: item.head_type,
          amount: item.amount,
          is_statutory: item.is_statutory,
          sort_order: item.sort_order * 10 + index,
        })),
        tx
      );
    }

    const [totals] = await tx.query<PayrollRow>(
      `SELECT COUNT(*) AS employees, SUM(gross_earnings) AS gross, SUM(total_deductions) AS deductions,
              SUM(net_pay) AS net, SUM(pf_employee) AS pf_employee, SUM(pf_employer) AS pf_employer,
              SUM(esi_employee) AS esi_employee, SUM(esi_employer) AS esi_employer, SUM(professional_tax) AS pt,
              SUM(lwf_amount) AS lwf, SUM(overtime_amount) AS overtime, SUM(paid_days) AS paid_days
         FROM payslips WHERE payroll_run_id = ?`,
      [runId]
    );

    await repo.refreshRunTotals(runId, {
      total_employees: Number(totals?.employees ?? 0),
      total_gross: round2(Number(totals?.gross ?? 0)),
      total_deductions: round2(Number(totals?.deductions ?? 0)),
      total_net: round2(Number(totals?.net ?? 0)),
      total_pf_employee: round2(Number(totals?.pf_employee ?? 0)),
      total_pf_employer: round2(Number(totals?.pf_employer ?? 0)),
      total_esi_employee: round2(Number(totals?.esi_employee ?? 0)),
      total_esi_employer: round2(Number(totals?.esi_employer ?? 0)),
      total_pt: round2(Number(totals?.pt ?? 0)),
      total_lwf: round2(Number(totals?.lwf ?? 0)),
      total_overtime: round2(Number(totals?.overtime ?? 0)),
      paid_days_total: round2(Number(totals?.paid_days ?? 0)),
      status: 'Calculated',
      processed_by: actor.user.id,
      processed_at: new Date(),
      updated_by: actor.user.id,
    }, tx);
  });

  await writeActivityLog({
    ...actorFields(actor),
    action: 'executed',
    module: 'payroll',
    entityType: 'payroll_run',
    entityId: runId,
    entityLabel: String(run.run_number),
    description: `Payroll ${String(run.run_number)} calculated — ${computed.length} payslip(s) for ${monthLabel(month, year)}${skipped.length ? `, ${skipped.length} employee(s) skipped` : ''}`,
    newValues: { employees: computed.length, skipped: skipped.length },
  });

  const detail = await getRun(runId);
  return { ...detail, skipped };
}

/** Moves a calculated run to Approved, then Locked. */
export async function setRunStatus(runId: number, status: string, actor: ActorContext,
  note?: string | null,
  scope?: { employerId?: number | null },
) {
  if (!PAYROLL_RUN_STATUSES.includes(status as (typeof PAYROLL_RUN_STATUSES)[number])) {
    throw notFound(`Status — one of ${PAYROLL_RUN_STATUSES.join(', ')}`);
  }
  const run = await repo.findRunById(runId, scope?.employerId ?? null);
  if (!run) throw notFound('Payroll run');
  const current = String(run.status);
  if (current === status) throw conflict('INVALID_STATE', `That run is already ${status.toLowerCase()}`);

  const allowed: Record<string, string[]> = {
    Draft: ['Calculated', 'Cancelled'],
    Calculated: ['Draft', 'Approved', 'Cancelled'],
    Approved: ['Calculated', 'Locked', 'Cancelled'],
    Locked: ['Approved', 'Paid'],
    Paid: [],
    Cancelled: [],
  };
  if (!(allowed[current] ?? []).includes(status)) {
    throw conflict('INVALID_STATE', `A ${current.toLowerCase()} run cannot be moved to ${status.toLowerCase()}`);
  }
  if (status === 'Approved' && !Number(run.total_employees ?? 0)) {
    throw conflict('INVALID_STATE', 'Calculate the run before approving it — it has no payslips yet');
  }

  const values: Record<string, string | number | Date> = { status, updated_by: actor.user.id };
  if (status === 'Approved') {
    values.approved_by = actor.user.id;
    values.approved_at = new Date();
  }
  if (status === 'Locked') {
    values.locked_by = actor.user.id;
    values.locked_at = new Date();
  }
  if (status === 'Paid') {
    values.locked_at = run.locked_at ?? new Date();
  }
  if (note) values.calculation_notes = note;
  await repo.updateRun(runId, values);

  await writeActivityLog({
    ...actorFields(actor),
    action: 'updated',
    module: 'payroll',
    entityType: 'payroll_run',
    entityId: runId,
    entityLabel: String(run.run_number),
    description: `Payroll ${String(run.run_number)} moved from ${current} to ${status}${note ? ` — ${note}` : ''}`,
    oldValues: { status: current },
    newValues: { status },
  });

  return getRun(runId);
}

export async function deleteRun(runId: number, actor: ActorContext, payload: { confirm?: boolean; reason?: string | null } = {},
  scope?: { employerId?: number | null },
) {
  const run = await repo.findRunById(runId, scope?.employerId ?? null);
  if (!run) throw notFound('Payroll run');
  const status = String(run.status);
  if (['Paid', 'Locked'].includes(status) && !payload.confirm) {
    throw conflict(
      'IN_USE',
      `Payroll ${String(run.run_number)} is ${status.toLowerCase()} — its payslips are the record of money that moved. Confirm to withdraw it from the register.`
    );
  }
  await repo.softDeleteRun(runId);
  await writeActivityLog({
    ...actorFields(actor),
    action: 'deleted',
    module: 'payroll',
    entityType: 'payroll_run',
    entityId: runId,
    entityLabel: String(run.run_number),
    description: `Payroll run ${String(run.run_number)} withdrawn from the register${payload.reason ? ` — ${payload.reason}` : ''}`,
    oldValues: { status, total_net: run.total_net, total_employees: run.total_employees },
  });
  return { id: runId };
}

/* ═══════════════════════════════ payslips ══════════════════════════════ */

function shapePayslip(row: PayrollRow) {
  return Object.assign(row, {
    id: Number(row.id),
    employer_id: Number(row.employer_id),
    employee_id: Number(row.employee_id),
    payroll_run_id: Number(row.payroll_run_id),
    month: Number(row.month),
    year: Number(row.year),
    period_from: row.period_from ? String(row.period_from).slice(0, 10) : null,
    period_to: row.period_to ? String(row.period_to).slice(0, 10) : null,
    net_pay: Number(row.net_pay ?? 0),
    gross_earnings: Number(row.gross_earnings ?? 0),
    total_deductions: Number(row.total_deductions ?? 0),
    is_published: Boolean(Number(row.is_published)),
    month_label: monthLabel(Number(row.month), Number(row.year)),
  });
}

export async function listPayslips(filters: repo.PayslipListFilters) {
  const [result, stats] = await Promise.all([repo.findPayslips(filters), repo.payslipStats(filters)]);
  return { ...result, stats, data: result.data.map(shapePayslip) };
}

export async function getPayslip(payslipId: number, scope?: { employerId?: number | null; employeeId?: number | null }) {
  const row = await repo.findPayslipById(payslipId, scope);
  if (!row) throw notFound('Payslip');
  const items = await repo.findPayslipItems(payslipId);
  return Object.assign(shapePayslip(row), {
    items: items.map((item) => Object.assign(item, { amount: Number(item.amount ?? 0), is_statutory: Boolean(Number(item.is_statutory)) })),
  });
}

/**
 * The employee's own view of one payslip. An unpublished payslip is invisible to
 * the employee — it is still being checked — and opening a published one stamps
 * the first-view time the payroll office uses to prove the payslip was received.
 */
export async function viewOwnPayslip(payslipId: number, employeeId: number) {
  const slip = await repo.findPayslipById(payslipId, { employeeId });
  if (!slip) throw notFound('Payslip');
  if (!Number(slip.is_published)) throw conflict('INVALID_STATE', 'That payslip has not been published yet');
  if (!slip.employee_viewed_at) {
    await repo.updatePayslip(payslipId, { employee_viewed_at: new Date() });
  }
  return getPayslip(payslipId, { employeeId });
}

/** Marks a set of payslips paid (or held), and records how. */
export async function markPayslipsPaid(payload: unknown, actor: ActorContext,
  scope?: { employerId?: number | null },
) {
  const input = auditPayment(payload);
  const fetched = await repo.payslipsForIds(input.ids);
  // An employer may only settle its own payslips; ids from another company are
  // dropped rather than reported, so a probe cannot confirm they exist.
  const rows = scope?.employerId
    ? fetched.filter((row) => Number(row.employer_id) === Number(scope.employerId))
    : fetched;
  if (!rows.length) throw notFound('Payslip');

  const runIds = [...new Set(rows.map((row) => Number(row.payroll_run_id)))];
  await withTransaction(async (tx) => {
    for (const row of rows) {
      await repo.updatePayslip(Number(row.id), {
        payment_status: input.payment_status,
        payment_mode: input.payment_mode ?? row.payment_mode ?? 'Bank Transfer',
        payment_reference: input.payment_reference ?? row.payment_reference ?? null,
        paid_at: input.payment_status === 'Paid' ? (input.paid_at || new Date().toISOString().slice(0, 10)) : null,
        updated_by: actor.user.id,
      }, tx);
    }
    // A run whose payslips are all paid becomes Paid itself.
    for (const runId of runIds) {
      const [counts] = await tx.query<PayrollRow>(
        `SELECT COUNT(*) AS total, SUM(payment_status = 'Paid') AS paid FROM payslips WHERE payroll_run_id = ?`,
        [runId]
      );
      if (Number(counts?.total ?? 0) > 0 && Number(counts?.paid ?? 0) === Number(counts?.total ?? 0)) {
        await repo.updateRun(runId, { status: 'Paid', updated_by: actor.user.id }, tx);
      }
    }
  });

  await writeActivityLog({
    ...actorFields(actor),
    action: 'updated',
    module: 'payslip',
    entityType: 'payslip',
    entityId: rows[0] ? Number(rows[0].id) : null,
    entityLabel: `${rows.length} payslip(s)`,
    description: `${rows.length} payslip(s) marked ${input.payment_status}${input.payment_reference ? ` — ref ${input.payment_reference}` : ''}`,
    newValues: { ids: input.ids.slice(0, 50), payment_status: input.payment_status, payment_reference: input.payment_reference ?? null },
  });

  return { updated: rows.length, runIds };
}

/** Validates the payment payload without importing the schema twice. */
function auditPayment(payload: unknown) {  const raw = (payload ?? {}) as Record<string, unknown>;
  const ids = Array.isArray(raw.ids) ? raw.ids.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0) : [];
  if (!ids.length) throw validationFailed([{ field: 'ids', message: 'Select at least one payslip' }]);
  const status = String(raw.payment_status ?? '');
  if (!PAYMENT_STATUSES.includes(status as (typeof PAYMENT_STATUSES)[number])) {
    throw validationFailed([{ field: 'payment_status', message: `Use one of ${PAYMENT_STATUSES.join(', ')}` }]);
  }
  return {
    ids,
    payment_status: status,
    payment_mode: raw.payment_mode ? String(raw.payment_mode) : undefined,
    payment_reference: raw.payment_reference === undefined || raw.payment_reference === '' ? undefined : String(raw.payment_reference),
    paid_at: raw.paid_at ? String(raw.paid_at) : undefined,
  };
}

/** Publishes payslips to the employees they belong to (and notifies them). */
export async function publishPayslips(runId: number, actor: ActorContext,
  scope?: { employerId?: number | null },
) {
  const run = await repo.findRunById(runId, scope?.employerId ?? null);
  if (!run) throw notFound('Payroll run');
  if (!['Locked', 'Paid', 'Approved', 'Calculated'].includes(String(run.status))) {
    throw conflict('INVALID_STATE', `A ${String(run.status).toLowerCase()} run cannot be published`);
  }
  const payslips = await repo.findRunPayslips(runId);
  if (!payslips.length) throw conflict('INVALID_STATE', 'Calculate the run before publishing it');

  const unpublished = payslips.filter((row) => Number(row.is_published) === 0);
  for (const row of unpublished) {
    await repo.updatePayslip(Number(row.id), {
      is_published: 1,
      published_at: new Date(),
      updated_by: actor.user.id,
    });
  }

  const employeeIds = unpublished.map((row) => Number(row.employee_id));
  // An employee's portal login hangs off the employee record (`employees.user_id`),
  // which is the only link the schema keeps between the two.
  const users = employeeIds.length
    ? await query<PayrollRow>(
        `SELECT u.id, e.id AS employee_id
           FROM employees e
           JOIN users u ON u.id = e.user_id
          WHERE e.id IN (${employeeIds.map(() => '?').join(', ')})
            AND e.deleted_at IS NULL AND u.deleted_at IS NULL`,
        employeeIds
      )
    : [];

  if (users.length) {
    await notifyMany(users.map((row) => Number(row.id)), {
      title: `Payslip for ${monthLabel(Number(run.month), Number(run.year))} is ready`,
      message: `Your payslip for ${monthLabel(Number(run.month), Number(run.year))} has been published. Open Payslips to view or download it.`,
      category: 'PAYROLL',
      actionUrl: '/employee/payslips',
      actionLabel: 'View payslips',
    });
  }

  // The employee hears about it on every channel they gave us: the portal, by
  // email and — where a mobile number is on record — by SMS and WhatsApp.
  const deliveries = { email: 0, sms: 0, whatsapp: 0, failures: [] as string[] };
  for (const slip of unpublished) {
    const label = monthLabel(Number(slip.month), Number(slip.year));
    const data = {
      employee_name: String(slip.employee_name),
      employee_number: String(slip.employee_number),
      month_year: label,
      payslip_number: String(slip.payslip_number),
      paid_days: Number(slip.paid_days ?? 0),
      gross_earnings: formatCurrency(Number(slip.gross_earnings ?? 0)),
      total_deductions: formatCurrency(Number(slip.total_deductions ?? 0)),
      net_pay: formatCurrency(Number(slip.net_pay ?? 0)),
      payslip_url: `${APP_URL}/employee/payslips/${Number(slip.id)}`,
    };
    const email = slip.employee_email ? String(slip.employee_email) : null;
    const mobile = slip.employee_mobile ? String(slip.employee_mobile) : null;
    if (email) {
      try {
        await sendTemplateEmail({ to: email, templateCode: 'payslip.published', data, entityType: 'PAYSLIP', entityId: Number(slip.id), sentBy: actor.user.id });
        deliveries.email += 1;
      } catch (error) {
        deliveries.failures.push(`email ${email}: ${(error as Error).message}`);
      }
    }
    if (mobile) {
      const smsData = {
        month_year: label,
        net_pay: Number(slip.net_pay ?? 0).toFixed(2),
        payslip_url: data.payslip_url,
      };
      try {
        await sendTemplateSms({ to: mobile, templateCode: 'sms.payslip', data: smsData, entityType: 'PAYSLIP', entityId: Number(slip.id), sentBy: actor.user.id });
        deliveries.sms += 1;
      } catch (error) {
        deliveries.failures.push(`sms ${mobile}: ${(error as Error).message}`);
      }
      try {
        await sendTemplateWhatsApp({ to: mobile, templateCode: 'whatsapp.payslip', data: smsData, entityType: 'PAYSLIP', entityId: Number(slip.id), sentBy: actor.user.id });
        deliveries.whatsapp += 1;
      } catch (error) {
        deliveries.failures.push(`whatsapp ${mobile}: ${(error as Error).message}`);
      }
    }
  }

  await writeActivityLog({
    ...actorFields(actor),
    action: 'published',
    module: 'payslip',
    entityType: 'payroll_run',
    entityId: runId,
    entityLabel: String(run.run_number),
    description: `Payslips for ${String(run.run_number)} published — ${unpublished.length} employee(s) notified`,
    newValues: { published: unpublished.length },
  });

  return { published: unpublished.length, notified: users.length, deliveries };
}

/**
 * Generates (or regenerates) the PDF for one payslip and files it in the vault.
 * The payslip keeps a pointer to the file, so a reprint years later is the same
 * document rather than a fresh rendering.
 */
export async function generatePayslipDocument(payslipId: number, actor: ActorContext,
  scope?: { employerId?: number | null },
) {
  const detail = await getPayslip(payslipId, { employerId: scope?.employerId ?? null });
  const buffer = await generatePayslipPdf(payslipId, {
    generatedByName: actor.user.fullName,
    generatedByRole: actor.user.primaryRole,
  });
  if (!buffer) throw notFound('Payslip');

  const fileId = await saveGeneratedFile(buffer, {
    fileName: `${String(detail.payslip_number).replace(/\//g, '-')}.pdf`,
    title: `Payslip ${String(detail.payslip_number)} — ${String(detail.employee_name)}`,
    entityType: 'PAYSLIP',
    entityId: payslipId,
    category: 'Payroll',
  }, actor);

  await repo.updatePayslip(payslipId, {
    pdf_file_id: fileId,
    pdf_generated_at: new Date(),
    updated_by: actor.user.id,
  });

  await writeActivityLog({
    ...actorFields(actor),
    action: 'generated',
    module: 'payslip',
    entityType: 'payslip',
    entityId: payslipId,
    entityLabel: String(detail.payslip_number),
    description: `Payslip PDF generated for ${String(detail.employee_name)} — ${String(detail.payslip_number)}`,
    newValues: { fileId },
  });

  return { fileId, fileUrl: `/api/files/${fileId}/download`, size: buffer.byteLength };
}

/** Generates the whole run's payslips, one PDF each. */
export async function generateRunDocuments(runId: number, actor: ActorContext,
  scope?: { employerId?: number | null },
) {
  const run = await repo.findRunById(runId, scope?.employerId ?? null);
  if (!run) throw notFound('Payroll run');
  const payslips = await repo.findRunPayslips(runId);
  if (!payslips.length) throw conflict('INVALID_STATE', 'Calculate the run before generating its payslips');

  let generated = 0;
  const failures: string[] = [];
  for (const row of payslips) {
    try {
      await generatePayslipDocument(Number(row.id), actor);
      generated += 1;
    } catch (error) {
      failures.push(`${String(row.payslip_number)}: ${(error as Error).message}`);
    }
  }
  await repo.updateRun(runId, { payslips_generated_at: new Date(), updated_by: actor.user.id });
  return { generated, total: payslips.length, failures };
}

/**
 * The bank file: one line per payslip with the net pay and the account it goes
 * to. The column set follows what Indian banks ask for on a salary upload, and
 * the file is offered as CSV (the format every bank's portal accepts) or as a
 * NEFT batch listing.
 */
export async function bankFile(runId: number, format: string, actor: ActorContext,
  scope?: { employerId?: number | null },
) {
  const run = await repo.findRunById(runId, scope?.employerId ?? null);
  if (!run) throw notFound('Payroll run');
  const payslips = await repo.findRunPayslips(runId);
  if (!payslips.length) throw conflict('INVALID_STATE', 'Calculate the run before generating a bank file');

  const missing = payslips.filter((row) => !row.bank_account_number || !row.ifsc_code);
  const outputFormat = format === 'neft' || format === 'nach' ? format : 'csv';
  const header = outputFormat === 'csv'
    ? ['Employee Code', 'Employee Name', 'Bank Name', 'Account Number', 'IFSC', 'Net Pay', 'Narration']
    : ['BENEFICIARY_NAME', 'BENEFICIARY_ACCOUNT', 'IFSC_CODE', 'AMOUNT', 'NARRATION'];
  const narration = `SALARY ${monthLabel(Number(run.month), Number(run.year)).toUpperCase().replace(' ', '-')}`;
  const cell = (value: unknown) => {
    const text = value === null || value === undefined ? '' : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  const lines = [header.join(',')];
  for (const row of payslips) {
    lines.push((outputFormat === 'csv'
      ? [row.employee_number, row.employee_name, row.bank_name ?? '', row.bank_account_number ?? '', row.ifsc_code ?? '', Number(row.net_pay ?? 0).toFixed(2), narration]
      : [row.employee_name, row.bank_account_number ?? '', row.ifsc_code ?? '', Number(row.net_pay ?? 0).toFixed(2), narration]
    ).map(cell).join(','));
  }

  await repo.updateRun(runId, { bank_file_generated_at: new Date(), updated_by: actor.user.id });
  await writeActivityLog({
    ...actorFields(actor),
    action: 'generated',
    module: 'payroll',
    entityType: 'payroll_run',
    entityId: runId,
    entityLabel: String(run.run_number),
    description: `Bank file generated for ${String(run.run_number)} — ${payslips.length} line(s), format ${outputFormat}`,
    newValues: { lines: payslips.length, missingBankDetails: missing.length },
  });

  return {
    body: `${lines.join('\n')}\n`,
    fileName: `payroll-${String(run.run_number).replace(/\//g, '-')}-${outputFormat}.csv`,
    lines: payslips.length,
    missingBankDetails: missing.map((row) => `${String(row.employee_number)} — ${String(row.employee_name)}`),
  };
}

/* ═══════════════════════════ salary structures ══════════════════════════ */

export async function listStructures(filters: repo.StructureListFilters) {
  const [result, stats] = await Promise.all([repo.findStructures(filters), repo.structureStats(filters)]);
  return { ...result, stats, data: result.data.map(shapeStructure) };
}

function shapeStructure(row: PayrollRow) {
  const heads = ['basic', 'da', 'hra', 'ta', 'pa', 'ea', 'npba', 'other_allowances'] as const;
  const gross = round2(heads.reduce((total, head) => total + Number(row[head] ?? 0), 0));
  return Object.assign(row, {
    id: Number(row.id),
    employer_id: Number(row.employer_id),
    employee_id: Number(row.employee_id),
    effective_from: row.effective_from ? String(row.effective_from).slice(0, 10) : null,
    effective_to: row.effective_to ? String(row.effective_to).slice(0, 10) : null,
    gross_salary: Number(row.gross_salary ?? gross ?? 0),
    computed_gross: gross,
    is_active: Boolean(Number(row.is_active)),
    pf_applicable: Boolean(Number(row.pf_applicable)),
    esi_applicable: Boolean(Number(row.esi_applicable)),
    lwf_applicable: Boolean(Number(row.lwf_applicable)),
    revision_number: Number(row.revision_number ?? 1),
  });
}

export async function getStructure(structureId: number, employerId?: number | null) {
  const row = await repo.findStructureById(structureId, employerId);
  if (!row) throw notFound('Salary structure');
  const items = await repo.findStructureItems(structureId);
  return Object.assign(shapeStructure(row), {
    items: items.map((item) => Object.assign(item, { amount: Number(item.amount ?? 0), percent_of_basic: Number(item.percent_of_basic ?? 0) })),
  });
}

export async function createStructure(payload: unknown, actor: ActorContext, scope?: { employerId?: number | null }) {
  const input = salaryStructureSchema.parse(payload);
  const employee = await repo.employeeRow(input.employee_id);
  if (!employee) throw validationFailed([{ field: 'employee_id', message: 'That employee does not exist' }]);
  if (scope?.employerId && Number(employee.employer_id) !== scope.employerId) {
    throw forbidden('That employee belongs to another company');
  }

  const gross = round2(
    Number(input.basic ?? 0) + Number(input.da ?? 0) + Number(input.hra ?? 0) + Number(input.ta ?? 0) +
    Number(input.pa ?? 0) + Number(input.ea ?? 0) + Number(input.npba ?? 0) + Number(input.other_allowances ?? 0)
  );
  const last = await repo.nextRevisionNumber(input.employee_id);
  const revision = Number(last?.last ?? 0) + 1;

  const structureId = await withTransaction(async (tx) => {
    await repo.supersedeStructures(input.employee_id, input.effective_from, tx);
    const id = await repo.insertStructure({
      employer_id: Number(employee.employer_id),
      employee_id: input.employee_id,
      structure_name: input.structure_name ?? (revision === 1 ? 'Initial structure' : `Revision ${revision}`),
      effective_from: input.effective_from,
      effective_to: input.effective_to ?? null,
      basic: Number(input.basic ?? 0),
      da: Number(input.da ?? 0),
      hra: Number(input.hra ?? 0),
      ta: Number(input.ta ?? 0),
      pa: Number(input.pa ?? 0),
      ea: Number(input.ea ?? 0),
      npba: Number(input.npba ?? 0),
      other_allowances: Number(input.other_allowances ?? 0),
      gross_salary: gross,
      wage_type: input.wage_type,
      daily_wage: input.daily_wage ? Number(input.daily_wage) : null,
      pf_applicable: input.pf_applicable ? 1 : 0,
      pf_employee_percent: input.pf_employee_percent ?? STATUTORY_RATES.pf.employeePercent,
      pf_employer_percent: input.pf_employer_percent ?? STATUTORY_RATES.pf.employerPercent,
      pf_wage_ceiling: input.pf_wage_ceiling ?? STATUTORY_RATES.pf.ceiling,
      vpf_percent: input.vpf_percent ?? 0,
      esi_applicable: input.esi_applicable ? 1 : 0,
      esi_employee_percent: input.esi_employee_percent ?? STATUTORY_RATES.esi.employeePercent,
      esi_employer_percent: input.esi_employer_percent ?? STATUTORY_RATES.esi.employerPercent,
      esi_wage_ceiling: input.esi_wage_ceiling ?? STATUTORY_RATES.esi.ceiling,
      pt_state: input.pt_state ?? String(employee.employer_state ?? 'Tamil Nadu'),
      // pt_amount and lwf_amount are NOT NULL with a 0 default: an absent
      // figure means "let the statutory slab decide", which is 0 here.
      pt_amount: Number(input.pt_amount ?? 0),
      lwf_applicable: input.lwf_applicable ? 1 : 0,
      lwf_amount: Number(input.lwf_amount ?? 0),
      is_active: 1,
      revision_number: revision,
      revision_reason: input.revision_reason ?? (revision === 1 ? 'Initial structure' : 'Revision'),
      created_by: actor.user.id,
      updated_by: actor.user.id,
    }, tx);

    if (input.items?.length) {
      await repo.replaceStructureItems(id, input.items.map((item, index) => ({
        payroll_head_id: item.payroll_head_id ?? null,
        head_code: item.head_code,
        head_name: item.head_name,
        head_type: item.head_type ?? 'Earning',
        amount: Number(item.amount ?? 0),
        percent_of_basic: Number(item.percent_of_basic ?? 0),
        sort_order: (index + 1) * 10,
      })), tx);
    }
    return id;
  });

  // The employee record carries the contractual wage the other modules read.
  await execute(
    'UPDATE employees SET basic_salary = ?, da = ?, hra = ?, ta = ?, pa = ?, ea = ?, npba = ?, other_allowances = ?, gross_salary = ?, updated_by = ? WHERE id = ?',
    [
      Number(input.basic ?? 0), Number(input.da ?? 0), Number(input.hra ?? 0), Number(input.ta ?? 0),
      Number(input.pa ?? 0), Number(input.ea ?? 0), Number(input.npba ?? 0), Number(input.other_allowances ?? 0),
      gross, actor.user.id, input.employee_id,
    ]
  );

  await writeActivityLog({
    ...actorFields(actor),
    action: 'created',
    module: 'salary_structure',
    entityType: 'salary_structure',
    entityId: structureId,
    entityLabel: String(employee.name),
    description: `Salary structure revision ${revision} set for ${String(employee.name)} (${String(employee.employee_number)}) — gross ${formatCurrency(gross)} from ${input.effective_from}`,
    newValues: { gross, effective_from: input.effective_from, revision, reason: input.revision_reason ?? null },
  });

  return getStructure(structureId);
}

export async function updateStructure(structureId: number, payload: unknown, actor: ActorContext, scope?: { employerId?: number | null }) {
  const existing = await repo.findStructureById(structureId, scope?.employerId ?? null);
  if (!existing) throw notFound('Salary structure');
  const input = salaryStructureSchema.parse(payload);
  const gross = round2(
    Number(input.basic ?? 0) + Number(input.da ?? 0) + Number(input.hra ?? 0) + Number(input.ta ?? 0) +
    Number(input.pa ?? 0) + Number(input.ea ?? 0) + Number(input.npba ?? 0) + Number(input.other_allowances ?? 0)
  );

  const changed: Record<string, { from: unknown; to: unknown }> = {};
  const values: Record<string, string | number | null> = {};
  const map: [string, unknown][] = [
    ['structure_name', input.structure_name],
    ['effective_from', input.effective_from],
    ['effective_to', input.effective_to],
    ['basic', Number(input.basic ?? 0)],
    ['da', Number(input.da ?? 0)],
    ['hra', Number(input.hra ?? 0)],
    ['ta', Number(input.ta ?? 0)],
    ['pa', Number(input.pa ?? 0)],
    ['ea', Number(input.ea ?? 0)],
    ['npba', Number(input.npba ?? 0)],
    ['other_allowances', Number(input.other_allowances ?? 0)],
    ['gross_salary', gross],
    ['wage_type', input.wage_type],
    ['revision_reason', input.revision_reason],
  ];
  for (const [column, value] of map) {
    if (value === undefined) continue;
    const current = (existing as unknown as Record<string, unknown>)[column];
    if (String(current ?? '') !== String(value ?? '')) {
      changed[column] = { from: current, to: value };
      values[column] = value as string | number | null;
    }
  }
  if (!Object.keys(changed).length) throw conflict('NO_CHANGE', 'Nothing about this structure was changed');

  values.updated_by = actor.user.id;
  await repo.updateStructure(structureId, values);

  // Keep the employee's contractual wage in step with the structure.
  await execute(
    'UPDATE employees SET basic_salary = ?, da = ?, hra = ?, ta = ?, pa = ?, ea = ?, npba = ?, other_allowances = ?, gross_salary = ?, updated_by = ? WHERE id = ?',
    [
      Number(input.basic ?? 0), Number(input.da ?? 0), Number(input.hra ?? 0), Number(input.ta ?? 0),
      Number(input.pa ?? 0), Number(input.ea ?? 0), Number(input.npba ?? 0), Number(input.other_allowances ?? 0),
      gross, actor.user.id, Number(existing.employee_id),
    ]
  );

  await writeActivityLog({
    ...actorFields(actor),
    action: 'updated',
    module: 'salary_structure',
    entityType: 'salary_structure',
    entityId: structureId,
    entityLabel: String(existing.employee_name ?? existing.structure_name ?? ''),
    description: `Salary structure for ${String(existing.employee_name ?? 'employee')} revised — ${Object.keys(changed).join(', ')}`,
    oldValues: Object.fromEntries(Object.entries(changed).map(([key, value]) => [key, value.from])),
    newValues: Object.fromEntries(Object.entries(changed).map(([key, value]) => [key, value.to])),
  });

  return getStructure(structureId);
}

export async function deleteStructure(structureId: number, actor: ActorContext, scope?: { employerId?: number | null }) {
  const existing = await repo.findStructureById(structureId, scope?.employerId ?? null);
  if (!existing) throw notFound('Salary structure');
  const rows = await query<PayrollRow>(
    'SELECT COUNT(*) AS total FROM payslips WHERE employee_id = ? AND deleted_at IS NULL',
    [Number(existing.employee_id)]
  );
  if (Number(rows[0]?.total ?? 0) > 0) {
    throw conflict(
      'IN_USE',
      `${String(existing.employee_name)} already has ${Number(rows[0].total)} payslip(s) computed from a structure. Give the employee a new revision instead — history is not editable.`
    );
  }
  await repo.updateStructure(structureId, { deleted_at: new Date(), is_active: 0, updated_by: actor.user.id });
  await writeActivityLog({
    ...actorFields(actor),
    action: 'deleted',
    module: 'salary_structure',
    entityType: 'salary_structure',
    entityId: structureId,
    entityLabel: String(existing.employee_name ?? ''),
    description: `Salary structure removed for ${String(existing.employee_name ?? 'employee')}`,
    oldValues: { gross_salary: existing.gross_salary, effective_from: existing.effective_from },
  });
  return { id: structureId };
}

/* ═══════════════════════════ attendance register ═══════════════════════ */

export async function listAttendance(filters: repo.AttendanceListFilters) {
  const [result, stats] = await Promise.all([repo.findAttendance(filters), repo.attendanceStats(filters)]);
  return {
    ...result,
    stats,
    data: result.data.map((row) => Object.assign(row, { id: Number(row.id), month: Number(row.month), year: Number(row.year) })),
  };
}

/** Records one day for one employee (idempotent on employee + date). */
export async function recordAttendance(payload: unknown, actor: ActorContext, scope?: { employerId?: number | null }) {
  const input = attendanceRowSchema.parse(payload);
  const employee = await repo.employeeRow(input.employee_id);
  if (!employee) throw validationFailed([{ field: 'employee_id', message: 'That employee does not exist' }]);
  if (scope?.employerId && Number(employee.employer_id) !== scope.employerId) {
    throw forbidden('That employee belongs to another company');
  }
  const date = input.attendance_date;
  const [year, month] = [Number(date.slice(0, 4)), Number(date.slice(5, 7))];

  await repo.upsertAttendance({
    employer_id: Number(employee.employer_id),
    unit_id: employee.unit_id ?? null,
    department_id: employee.department_id ?? null,
    employee_id: input.employee_id,
    attendance_date: date,
    month,
    year,
    status: input.status,
    leave_type: input.leave_type ?? null,
    in_time: input.in_time ?? null,
    out_time: input.out_time ?? null,
    worked_hours: input.worked_hours ?? null,
    overtime_hours: input.overtime_hours ?? 0,
    is_paid: ['Present', 'On Duty', 'Late', 'Comp Off', 'Half Day', 'Leave', 'Holiday', 'Weekly Off'].includes(input.status) ? 1 : 0,
    remarks: input.remarks ?? null,
    source: 'Manual',
    created_by: actor.user.id,
    updated_by: actor.user.id,
  });

  await writeActivityLog({
    ...actorFields(actor),
    action: 'updated',
    module: 'attendance',
    entityType: 'attendance',
    entityId: input.employee_id,
    entityLabel: `${String(employee.name)} — ${date}`,
    description: `Attendance for ${String(employee.name)} on ${date} recorded as ${input.status}${input.overtime_hours ? ` (${input.overtime_hours}h overtime)` : ''}`,
    newValues: { date, status: input.status, overtime_hours: input.overtime_hours ?? 0 },
  });

  return { employee_id: input.employee_id, attendance_date: date, status: input.status };
}

/**
 * Marks a month for a scope in one pass: every working day defaults to the
 * chosen status (Present), then the exceptions in `rows` overwrite the days they
 * name, and the weekly offs and holidays are filled from the calendar.
 */
export async function bulkAttendance(payload: unknown, actor: ActorContext, scope?: { employerId?: number | null }) {
  const input = attendanceBulkSchema.parse(payload);
  // A scoped caller writes for its own company only: naming another company in
  // the body is refused rather than quietly redirected, so a mistake is visible.
  if (scope?.employerId && Number(input.employer_id) !== Number(scope.employerId)) {
    throw forbidden('You can only mark attendance for your own company');
  }
  const employerId = scope?.employerId ?? input.employer_id;
  const employer = await queryOne<PayrollRow>('SELECT id, company_name FROM employers WHERE id = ? AND deleted_at IS NULL LIMIT 1', [employerId]);
  if (!employer) throw validationFailed([{ field: 'employer_id', message: 'That company does not exist' }]);

  const employees = await repo.payrollEmployees(employerId, input.unit_id ?? null, input.department_id ?? null);
  if (!employees.length) throw conflict('NO_EMPLOYEES', 'No active employee falls in that scope');

  const bounds = monthBounds(input.year, input.month);
  const holidays = await repo.holidayDatesInMonth(employerId, bounds.from, bounds.to);
  const holidayDates = new Set(holidays.map((row) => String(row.holiday_date).slice(0, 10)));

  const overrides = new Map<string, { status: string; overtime: number; leaveType: string | null }>();
  for (const row of input.rows ?? []) {
    overrides.set(`${row.employee_id}:${row.attendance_date}`, {
      status: row.status,
      overtime: Number(row.overtime_hours ?? 0),
      leaveType: row.leave_type ?? null,
    });
  }

  const rowsWritten: number[] = [];
  await withTransaction(async (tx) => {
    for (const employee of employees) {
      const weeklyOff = Number(employee.weekly_off ?? 0);
      const employeeId = Number(employee.id);
      for (let day = 1; day <= bounds.days; day += 1) {
        const date = `${bounds.from.slice(0, 7)}-${String(day).padStart(2, '0')}`;
        const weekday = new Date(input.year, input.month - 1, day).getDay();
        const override = overrides.get(`${employeeId}:${date}`);
        const joining = employee.date_of_joining ? String(employee.date_of_joining).slice(0, 10) : null;
        if (joining && date < joining) continue;

        const status = override?.status
          ?? (holidayDates.has(date) ? 'Holiday' : weekday === weeklyOff ? 'Weekly Off' : input.default_status);

        await repo.upsertAttendance({
          employer_id: employerId,
          unit_id: employee.unit_id ?? null,
          department_id: employee.department_id ?? null,
          employee_id: employeeId,
          attendance_date: date,
          month: input.month,
          year: input.year,
          status,
          leave_type: override?.leaveType ?? (status === 'Leave' ? 'Earned Leave' : null),
          overtime_hours: override?.overtime ?? 0,
          is_paid: ['Present', 'On Duty', 'Late', 'Comp Off', 'Half Day', 'Leave', 'Holiday', 'Weekly Off'].includes(status) ? 1 : 0,
          source: 'Bulk Upload',
          created_by: actor.user.id,
          updated_by: actor.user.id,
        }, tx);
        rowsWritten.push(employeeId);
      }
    }
  });

  await writeActivityLog({
    ...actorFields(actor),
    action: 'created',
    module: 'attendance',
    entityType: 'attendance',
    entityId: null,
    entityLabel: `${monthLabel(input.month, input.year)} attendance`,
    description: `Attendance for ${monthLabel(input.month, input.year)} marked for ${employees.length} employee(s) of ${String(employer.company_name)} — ${rowsWritten.length} day(s)`,
    newValues: { employees: employees.length, days: rowsWritten.length, default: input.default_status, exceptions: (input.rows ?? []).length },
  });

  return { employees: employees.length, days: rowsWritten.length, holidays: holidayDates.size };
}

/** The month grid a screen fills in: employees × days, with what is already marked. */
export async function attendanceSheet(employerId: number, year: number, month: number, unitId?: number | null, departmentId?: number | null) {
  const bounds = monthBounds(year, month);
  const [employees, rows, holidays] = await Promise.all([
    repo.payrollEmployees(employerId, unitId ?? null, departmentId ?? null),
    query<PayrollRow>(
      `SELECT employee_id, DAY(attendance_date) AS day, status, overtime_hours FROM attendance
        WHERE employer_id = ? AND year = ? AND month = ? AND deleted_at IS NULL`,
      [employerId, year, month]
    ),
    repo.holidayDatesInMonth(employerId, bounds.from, bounds.to),
  ]);

  const marks = new Map<string, { status: string; overtime: number }>();
  for (const row of rows) {
    marks.set(`${Number(row.employee_id)}:${Number(row.day)}`, {
      status: String(row.status),
      overtime: Number(row.overtime_hours ?? 0),
    });
  }

  return {
    year,
    month,
    from: bounds.from,
    to: bounds.to,
    days: bounds.days,
    holidays: holidays.map((row) => String(row.holiday_date).slice(0, 10)),
    employees: employees.map((row) => ({
      id: Number(row.id),
      employee_number: String(row.employee_number),
      name: String(row.name),
      designation: row.designation ? String(row.designation) : null,
      unit_name: row.unit_name ? String(row.unit_name) : null,
      department_name: row.department_name ? String(row.department_name) : null,
      weekly_off: Number(row.weekly_off ?? 0),
      marks: Array.from({ length: bounds.days }, (_, index) => {
        const day = index + 1;
        const mark = marks.get(`${Number(row.id)}:${day}`);
        return mark ? { day, ...mark } : { day, status: null, overtime: 0 };
      }),
    })),
  };
}

/* ══════════════════════════════ leave book ═════════════════════════════ */

export async function listLeaveTypes(employerId?: number | null) {
  const rows = await repo.findLeaveTypes(employerId ?? null);
  return rows.map((row) => Object.assign(row, { id: Number(row.id), is_paid: Boolean(Number(row.is_paid)) }));
}

export async function createLeaveType(payload: unknown, actor: ActorContext, employerId: number, employerCode?: string | null) {
  const input = leaveTypeSchema.parse(payload);
  const label = employerCode
    || String((await queryOne<PayrollRow>('SELECT employer_code FROM employers WHERE id = ? LIMIT 1', [employerId]))?.employer_code ?? 'the company');
  const code = String(input.name).toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 6) || 'LEAVE';
  const typeId = await repo.insertLeaveType({
    employer_id: employerId,
    code: `${code}${Math.floor(Math.random() * 90 + 10)}`,
    name: input.name,
    name_ta: input.name_ta ?? null,
    is_paid: input.is_paid ? 1 : 0,
    max_days_per_year: input.max_days_per_year ?? 12,
    carry_forward: input.carry_forward ? 1 : 0,
    max_carry_forward: input.max_carry_forward ?? 0,
    encashable: input.encashable ? 1 : 0,
    requires_document: input.requires_document ? 1 : 0,
    min_days_notice: input.min_days_notice ?? 0,
    status: 'active',
  });
  await writeActivityLog({
    ...actorFields(actor),
    action: 'created',
    module: 'leave',
    entityType: 'leave_type',
    entityId: typeId,
    entityLabel: input.name,
    description: `Leave type ${input.name} added for ${label}`,
    newValues: { name: input.name, is_paid: input.is_paid, max_days_per_year: input.max_days_per_year ?? 12 },
  });
  return { id: typeId };
}

export async function listLeaveApplications(filters: repo.LeaveListFilters) {
  const [result, stats] = await Promise.all([repo.findLeaveApplications(filters), repo.leaveStats(filters)]);
  return {
    ...result,
    stats,
    data: result.data.map((row) => Object.assign(row, {
      id: Number(row.id),
      date_from: String(row.date_from).slice(0, 10),
      date_to: String(row.date_to).slice(0, 10),
      total_days: Number(row.total_days ?? 0),
      is_paid: Boolean(Number(row.is_paid ?? 0)),
    })),
  };
}

/** Applies for leave: checks the ledger, then books the days. */
export async function applyLeave(payload: unknown, actor: ActorContext, scope?: { employerId?: number | null; employeeId?: number | null }) {
  const input = leaveApplicationSchema.parse(payload);
  const employeeId = scope?.employeeId ?? input.employee_id;
  const employee = await repo.employeeRow(employeeId);
  if (!employee) throw validationFailed([{ field: 'employee_id', message: 'That employee does not exist' }]);
  if (scope?.employerId && Number(employee.employer_id) !== scope.employerId) {
    throw forbidden('That employee belongs to another company');
  }

  const type = await repo.findLeaveTypeById(input.leave_type_id);
  if (!type) throw validationFailed([{ field: 'leave_type_id', message: 'That leave type does not exist' }]);
  if (Number(type.requires_document) === 1 && !input.document_file_id) {
    throw validationFailed([{ field: 'document_file_id', message: `${String(type.name)} needs a supporting document` }]);
  }

  // Count working days between the dates: weekly offs and holidays are not leave.
  const bounds = { from: input.date_from, to: input.date_to };
  const [holidays, weeklyOff] = await Promise.all([
    repo.holidayDatesInMonth(Number(employee.employer_id), bounds.from, bounds.to),
    Promise.resolve(Number(employee.weekly_off ?? 0)),
  ]);
  const holidayDates = new Set(holidays.map((row) => String(row.holiday_date).slice(0, 10)));
  let workingLeaveDays = 0;
  for (let time = new Date(`${bounds.from}T00:00:00`).getTime(); time <= new Date(`${bounds.to}T00:00:00`).getTime(); time += 86_400_000) {
    const date = new Date(time);
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    if (date.getDay() === weeklyOff) continue;
    if (holidayDates.has(iso)) continue;
    workingLeaveDays += 1;
  }
  const totalDays = input.is_half_day ? 0.5 : workingLeaveDays;
  if (totalDays <= 0) {
    throw validationFailed([{ field: 'date_from', message: 'Those dates are all weekly offs or holidays — no leave is needed' }]);
  }

  const year = Number(input.date_from.slice(0, 4));
  const ledger = await queryOne<PayrollRow>(
    'SELECT * FROM leave_ledgers WHERE employee_id = ? AND leave_type_id = ? AND year = ? AND deleted_at IS NULL LIMIT 1',
    [employeeId, input.leave_type_id, year]
  );
  const balance = ledger
    ? Number(ledger.opening_balance ?? 0) + Number(ledger.accrued ?? 0) - Number(ledger.availed ?? 0) - Number(ledger.encashed ?? 0)
    : Number(type.max_days_per_year ?? 0);
  if (totalDays > balance) {
    throw conflict(
      'INSUFFICIENT_BALANCE',
      `${String(employee.name)} has ${balance} day(s) of ${String(type.name)} left this year — ${totalDays} day(s) requested`
    );
  }

  const applicationNumber = await nextDocumentNumber('leaveApplication');
  const applicationId = await withTransaction(async (tx) => {
    const id = await repo.insertLeaveApplication({
      uuid: randomUUID(),
      application_number: applicationNumber,
      employer_id: Number(employee.employer_id),
      employee_id: employeeId,
      leave_type_id: input.leave_type_id,
      date_from: input.date_from,
      date_to: input.date_to,
      total_days: totalDays,
      is_half_day: input.is_half_day ? 1 : 0,
      reason: input.reason,
      document_file_id: input.document_file_id ?? null,
      status: 'Pending',
      applied_at: new Date(),
      created_by: actor.user.id,
    }, tx);

    if (!ledger) {
      await repo.upsertLeaveLedger({
        employer_id: Number(employee.employer_id),
        employee_id: employeeId,
        leave_type_id: input.leave_type_id,
        year,
        opening_balance: 0,
        accrued: Number(type.max_days_per_year ?? 0),
        availed: 0,
        encashed: 0,
        lapsed: 0,
        closing_balance: Number(type.max_days_per_year ?? 0),
        created_by: actor.user.id,
      }, tx);
    }
    return id;
  });

  // The approvers: the employer's portal users, plus the administrators.
  const approvers = await query<PayrollRow>(
    `SELECT DISTINCT u.id FROM users u
       JOIN employer_users eu ON eu.user_id = u.id
      WHERE eu.employer_id = ? AND u.deleted_at IS NULL AND u.status = 'active'`,
    [Number(employee.employer_id)]
  ).catch(() => [] as PayrollRow[]);
  const adminIds = await usersWithRole('admin');
  const recipients = [...new Set([...approvers.map((row) => Number(row.id)), ...adminIds])];
  if (recipients.length) {
    await notifyMany(recipients, {
      title: 'Leave applied for',
      message: `${String(employee.name)} (${String(employee.employee_number)}) applied for ${totalDays} day(s) of ${String(type.name)} from ${input.date_from} to ${input.date_to}.`,
      category: 'EMPLOYEE',
      actionUrl: '/admin/leave-monitoring',
      actionLabel: 'Review the application',
      entityType: 'leave_application',
      entityId: applicationId,
    });
  }

  await writeActivityLog({
    ...actorFields(actor),
    action: 'created',
    module: 'leave',
    entityType: 'leave_application',
    entityId: applicationId,
    entityLabel: applicationNumber,
    description: `Leave applied for ${String(employee.name)} — ${totalDays} day(s) of ${String(type.name)} (${input.date_from} to ${input.date_to})`,
    newValues: { leave_type: String(type.name), days: totalDays, from: input.date_from, to: input.date_to },
  });

  return { id: applicationId, application_number: applicationNumber, total_days: totalDays, balance_after: round2(balance - totalDays) };
}

/** Approves, rejects or withdraws an application, and moves the ledger. */
export async function decideLeave(applicationId: number, payload: unknown, actor: ActorContext, scope?: { employerId?: number | null; employeeId?: number | null }) {
  const input = leaveDecisionSchema.parse(payload);
  const application = await repo.findLeaveApplicationById(applicationId);
  if (!application) throw notFound('Leave application');
  if (scope?.employerId && Number(application.employer_id) !== scope.employerId) throw forbidden('That application belongs to another company');
  if (scope?.employeeId && Number(application.employee_id) !== scope.employeeId) throw forbidden('That application belongs to another employee');

  const current = String(application.status);
  const isEmployeeWithdraw = input.decision === 'withdraw';
  if (isEmployeeWithdraw && !['Pending', 'Approved'].includes(current)) {
    throw conflict('INVALID_STATE', `A ${current.toLowerCase()} application cannot be withdrawn`);
  }
  if (!isEmployeeWithdraw && current !== 'Pending') {
    throw conflict('INVALID_STATE', `That application was already ${current.toLowerCase()}`);
  }

  const nextStatus = input.decision === 'approve' ? 'Approved' : input.decision === 'reject' ? 'Rejected' : 'Withdrawn';
  const days = Number(application.total_days ?? 0);
  const year = Number(String(application.date_from).slice(0, 4));

  await withTransaction(async (tx) => {
    await repo.updateLeaveApplication(applicationId, {
      status: nextStatus,
      approved_by: input.decision === 'withdraw' ? null : actor.user.id,
      approved_at: input.decision === 'withdraw' ? null : new Date(),
      approver_comments: input.approver_comments ?? null,
    }, tx);

    const ledger = await tx.queryOne<PayrollRow>(
      'SELECT * FROM leave_ledgers WHERE employee_id = ? AND leave_type_id = ? AND year = ? AND deleted_at IS NULL FOR UPDATE',
      [Number(application.employee_id), Number(application.leave_type_id), year]
    );
    if (ledger) {
      const availed = Number(ledger.availed ?? 0);
      const delta = nextStatus === 'Approved' ? days : current === 'Approved' ? -days : 0;
      const nextAvailed = Math.max(0, availed + delta);
      await repo.upsertLeaveLedger({
        employer_id: Number(application.employer_id),
        employee_id: Number(application.employee_id),
        leave_type_id: Number(application.leave_type_id),
        year,
        availed: nextAvailed,
        closing_balance: round2(Number(ledger.opening_balance ?? 0) + Number(ledger.accrued ?? 0) - nextAvailed - Number(ledger.encashed ?? 0) - Number(ledger.lapsed ?? 0)),
        updated_by: actor.user.id,
      }, tx);
    }
  });

  // An approved or withdrawn leave application moves the attendance days too.
  if (['Approved', 'Withdrawn', 'Rejected'].includes(nextStatus)) {
    const status = nextStatus === 'Approved' ? 'Leave' : 'Present';
    for (let time = new Date(`${String(application.date_from).slice(0, 10)}T00:00:00`).getTime();
         time <= new Date(`${String(application.date_to).slice(0, 10)}T00:00:00`).getTime(); time += 86_400_000) {
      const date = new Date(time);
      const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      const employee = await repo.employeeRow(Number(application.employee_id));
      if (!employee) break;
      if (date.getDay() === Number(employee.weekly_off ?? 0)) continue;
      await repo.upsertAttendance({
        employer_id: Number(application.employer_id),
        unit_id: employee.unit_id ?? null,
        department_id: employee.department_id ?? null,
        employee_id: Number(application.employee_id),
        attendance_date: iso,
        month: date.getMonth() + 1,
        year: date.getFullYear(),
        status,
        leave_type: status === 'Leave' ? String(application.leave_name ?? 'Leave') : null,
        is_paid: status === 'Leave' && Number(application.is_paid) === 0 ? 0 : 1,
        remarks: `Leave ${application.application_number ?? ''} ${nextStatus.toLowerCase()}`.trim(),
        source: 'Manual',
        created_by: actor.user.id,
        updated_by: actor.user.id,
      });
    }
  }

  const employee = await repo.employeeRow(Number(application.employee_id));
  const employeeUser = await queryOne<PayrollRow>(
    `SELECT u.id FROM employees e JOIN users u ON u.id = e.user_id
      WHERE e.id = ? AND e.deleted_at IS NULL AND u.deleted_at IS NULL LIMIT 1`,
    [Number(application.employee_id)]
  );
  if (employeeUser) {
    await notifyMany([Number(employeeUser.id)], {
      title: `Leave ${nextStatus.toLowerCase()}`,
      message: `Your ${String(application.leave_name ?? 'leave')} from ${String(application.date_from).slice(0, 10)} to ${String(application.date_to).slice(0, 10)} was ${nextStatus.toLowerCase()}${input.approver_comments ? ` — ${input.approver_comments}` : ''}.`,
      category: 'EMPLOYEE',
      actionUrl: '/employee/leave/history',
      actionLabel: 'View your leave',
      entityType: 'leave_application',
      entityId: applicationId,
    });

    // Email and SMS as well, on the same decision, using the shared templates.
    const decisionData = {
      employee_name: String(employee?.name ?? application.employee_name ?? 'Employee'),
      status: nextStatus,
      application_number: String(application.application_number ?? ''),
      leave_type: String(application.leave_name ?? 'Leave'),
      date_from: String(application.date_from).slice(0, 10),
      date_to: String(application.date_to).slice(0, 10),
      total_days: String(days),
      approver_name: actor.user.fullName,
      comments: input.approver_comments || 'No comments',
      application_url: `${APP_URL}/employee/leave/history`,
    };
    const email = employee?.email ? String(employee.email) : null;
    const mobile = employee?.mobile ? String(employee.mobile) : null;
    if (email && !isEmployeeWithdraw) {
      await sendTemplateEmail({ to: email, templateCode: 'leave.decision', data: decisionData, entityType: 'LEAVE_APPLICATION', entityId: applicationId, sentBy: actor.user.id }).catch((error) => {
        console.warn(`[payroll] leave.decision email failed: ${(error as Error).message}`);
      });
    }
    if (mobile && !isEmployeeWithdraw) {
      await sendTemplateSms({
        to: mobile,
        templateCode: 'sms.leave_decision',
        data: { status: nextStatus, leave_type: decisionData.leave_type, date_from: decisionData.date_from, date_to: decisionData.date_to },
        entityType: 'LEAVE_APPLICATION',
        entityId: applicationId,
        sentBy: actor.user.id,
      }).catch((error) => {
        console.warn(`[payroll] sms.leave_decision failed: ${(error as Error).message}`);
      });
    }
  }

  await writeActivityLog({
    ...actorFields(actor),
    action: nextStatus === 'Approved' ? 'approved' : nextStatus === 'Rejected' ? 'rejected' : 'updated',
    module: 'leave',
    entityType: 'leave_application',
    entityId: applicationId,
    entityLabel: String(application.application_number ?? ''),
    description: `Leave for ${String(employee?.name ?? application.employee_name ?? 'employee')} ${nextStatus.toLowerCase()} — ${days} day(s)${input.approver_comments ? ` — ${input.approver_comments}` : ''}`,
    oldValues: { status: current },
    newValues: { status: nextStatus, comments: input.approver_comments ?? null },
  });

  return { id: applicationId, status: nextStatus, total_days: days };
}

export async function leaveLedgerReport(filters: { employerId?: number | null; employeeId?: number | null; year?: number | null; scopeEmployerId?: number | null; scopeEmployeeId?: number | null; limit?: number }) {
  const rows = await repo.findLeaveLedger(filters);
  return rows.map((row) => Object.assign(row, {
    id: Number(row.id),
    year: Number(row.year),
    opening_balance: Number(row.opening_balance ?? 0),
    accrued: Number(row.accrued ?? 0),
    availed: Number(row.availed ?? 0),
    encashed: Number(row.encashed ?? 0),
    lapsed: Number(row.lapsed ?? 0),
    closing_balance: Number(row.closing_balance ?? 0),
    available: round2(
      Number(row.opening_balance ?? 0) + Number(row.accrued ?? 0) - Number(row.availed ?? 0) -
      Number(row.encashed ?? 0) - Number(row.lapsed ?? 0)
    ),
    is_paid: Boolean(Number(row.is_paid ?? 0)),
  }));
}

/** Accrues the year's entitlement into the ledger for everyone in scope. */
export async function accrueLeave(employerId: number, year: number, actor: ActorContext) {
  const [employees, types] = await Promise.all([repo.payrollEmployees(employerId), repo.findLeaveTypes(employerId)]);
  if (!employees.length) throw conflict('NO_EMPLOYEES', 'This company has no active employees to accrue for');
  if (!types.length) throw conflict('NO_LEAVE_TYPES', 'This company has no leave types configured');

  let written = 0;
  await withTransaction(async (tx) => {
    for (const employee of employees) {
      for (const type of types) {
        if (String(type.status) !== 'active') continue;
        await repo.upsertLeaveLedger({
          employer_id: employerId,
          employee_id: Number(employee.id),
          leave_type_id: Number(type.id),
          year,
          opening_balance: 0,
          accrued: Number(type.max_days_per_year ?? 12),
          availed: 0,
          encashed: 0,
          lapsed: 0,
          closing_balance: Number(type.max_days_per_year ?? 12),
          created_by: actor.user.id,
        }, tx);
        written += 1;
      }
    }
  });

  await writeActivityLog({
    ...actorFields(actor),
    action: 'executed',
    module: 'leave',
    entityType: 'leave_ledger',
    entityId: null,
    entityLabel: `Leave accrual ${year}`,
    description: `Leave accrued for ${year} — ${employees.length} employee(s) × ${types.length} type(s)`,
    newValues: { year, employees: employees.length, types: types.length },
  });

  return { employees: employees.length, types: types.length, rows: written };
}

/* ═══════════════════════ bonus, gratuity, settlement ═══════════════════ */

export async function listBonus(filters: { employerId?: number | null; year?: number | null; status?: string | null; scopeEmployerId?: number | null; limit?: number }) {
  const rows = await repo.findBonusRecords(filters);
  return rows.map((row) => Object.assign(row, {
    id: Number(row.id),
    bonus_year: Number(row.bonus_year),
    eligible_wages: Number(row.eligible_wages ?? 0),
    bonus_percent: Number(row.bonus_percent ?? 0),
    bonus_amount: Number(row.bonus_amount ?? 0),
    total_days: Number(row.paid_days ?? 0),
  }));
}

/** Computes statutory bonus for a set of employees, from their paid days. */
export async function createBonus(payload: unknown, actor: ActorContext, scope?: { employerId?: number | null }) {
  const input = bonusSchema.parse(payload);
  const from = input.calculation_from || `${input.bonus_year}-04-01`;
  const to = input.calculation_to || `${input.bonus_year + 1}-03-31`;

  const created: { employee: string; amount: number; eligibleWages: number }[] = [];
  const skipped: { employee: string; reason: string }[] = [];

  for (const employeeId of input.employee_ids) {
    const employee = await repo.employeeRow(employeeId);
    if (!employee) {
      skipped.push({ employee: `#${employeeId}`, reason: 'Employee does not exist' });
      continue;
    }
    if (scope?.employerId && Number(employee.employer_id) !== scope.employerId) {
      skipped.push({ employee: String(employee.name), reason: 'Belongs to another company' });
      continue;
    }
    const existing = await repo.findBonusForEmployeeYear(employeeId, input.bonus_year);
    if (existing) {
      skipped.push({ employee: String(employee.name), reason: `Bonus for ${input.bonus_year} is already recorded` });
      continue;
    }

    const [wagesRow, structure] = await Promise.all([
      queryOne<PayrollRow>(
        `SELECT SUM(gross_earnings) AS wages, COUNT(*) AS months, MAX(gross_earnings) AS latest
           FROM payslips WHERE employee_id = ? AND deleted_at IS NULL AND CONCAT(year, '-', LPAD(month, 2, '0')) BETWEEN ? AND ?`,
        [employeeId, from.slice(0, 7), to.slice(0, 7)]
      ),
      repo.liveStructure(employeeId, to),
    ]);

    const monthlyWages = Number(structure?.gross_salary ?? employee.gross_salary ?? 0);
    const paidDays = Number((await queryOne<PayrollRow>(
      `SELECT COUNT(*) AS days FROM attendance WHERE employee_id = ? AND deleted_at IS NULL
         AND status IN ('Present','On Duty','Late','Comp Off','Leave','Holiday','Weekly Off','Half Day')
         AND attendance_date BETWEEN ? AND ?`,
      [employeeId, from, to]
    ))?.days ?? 0);
    const wagesPaid = Number(wagesRow?.wages ?? 0) || round2((monthlyWages / 30) * paidDays);

    const calc = statutoryBonus(monthlyWages, Math.min(wagesPaid, STATUTORY_RATES.bonus.calculationCeiling * 12), input.bonus_percent);
    const recordId = await repo.insertBonusRecord({
      employer_id: Number(employee.employer_id),
      employee_id: employeeId,
      bonus_year: input.bonus_year,
      bonus_type: input.bonus_type,
      eligible_wages: calc.eligibleWages,
      bonus_percent: Number(input.bonus_percent ?? calc.percent),
      bonus_amount: calc.amount,
      calculation_from: from,
      calculation_to: to,
      paid_days: paidDays,
      payment_date: input.payment_date ?? null,
      payment_status: 'Pending',
      remarks: input.remarks ?? calc.note,
      created_by: actor.user.id,
    });
    created.push({ employee: `${String(employee.employee_number)} — ${String(employee.name)}`, amount: calc.amount, eligibleWages: calc.eligibleWages });
    void recordId;
  }

  await writeActivityLog({
    ...actorFields(actor),
    action: 'created',
    module: 'payroll',
    entityType: 'bonus_record',
    entityId: null,
    entityLabel: `Bonus ${input.bonus_year}`,
    description: `Bonus computed for ${created.length} employee(s) for ${input.bonus_year} (${input.bonus_type})${skipped.length ? `, ${skipped.length} skipped` : ''}`,
    newValues: { employees: created.length, total: round2(created.reduce((total, row) => total + row.amount, 0)) },
  });

  return { created, skipped, total: round2(created.reduce((total, row) => total + row.amount, 0)) };
}

export async function listGratuity(filters: { employerId?: number | null; status?: string | null; scopeEmployerId?: number | null; limit?: number }) {
  const rows = await repo.findGratuityRecords(filters);
  return rows.map((row) => Object.assign(row, {
    id: Number(row.id),
    total_service_years: Number(row.total_service_years ?? 0),
    last_drawn_wages: Number(row.last_drawn_wages ?? 0),
    basic_plus_da: Number(row.basic_plus_da ?? 0),
    gratuity_amount: Number(row.gratuity_amount ?? 0),
    is_statutory_eligible: Boolean(Number(row.is_statutory_eligible)),
  }));
}

export async function createGratuity(payload: unknown, actor: ActorContext, scope?: { employerId?: number | null }) {
  const input = gratuitySchema.parse(payload);
  const employee = await repo.employeeRow(input.employee_id);
  if (!employee) throw validationFailed([{ field: 'employee_id', message: 'That employee does not exist' }]);
  if (scope?.employerId && Number(employee.employer_id) !== scope.employerId) throw forbidden('That employee belongs to another company');

  const structure = await repo.liveStructure(input.employee_id, input.service_to);
  const basicPlusDa = Number(structure?.basic ?? employee.basic_salary ?? 0) + Number(structure?.da ?? employee.da ?? 0);
  const lastDrawn = input.last_drawn_wages !== undefined && input.last_drawn_wages !== null
    ? Number(input.last_drawn_wages)
    : basicPlusDa;
  const calc = gratuityAmount(lastDrawn, input.service_from, input.service_to);

  const recordId = await repo.insertGratuityRecord({
    employer_id: Number(employee.employer_id),
    employee_id: input.employee_id,
    service_from: input.service_from,
    service_to: input.service_to,
    total_service_years: calc.totalServiceYears,
    last_drawn_wages: lastDrawn,
    basic_plus_da: basicPlusDa,
    gratuity_amount: calc.amount,
    is_statutory_eligible: calc.isStatutoryEligible ? 1 : 0,
    calculation_note: input.calculation_note ?? calc.note,
    payment_date: input.payment_date ?? null,
    payment_status: 'Pending',
    created_by: actor.user.id,
  });

  await writeActivityLog({
    ...actorFields(actor),
    action: 'created',
    module: 'payroll',
    entityType: 'gratuity_record',
    entityId: recordId,
    entityLabel: String(employee.name),
    description: `Gratuity computed for ${String(employee.name)} (${String(employee.employee_number)}) — ${calc.totalServiceYears} year(s), ${formatCurrency(calc.amount)}`,
    newValues: { years: calc.totalServiceYears, amount: calc.amount, eligible: calc.isStatutoryEligible },
  });

  return { id: recordId, ...calc, last_drawn_wages: lastDrawn };
}

export async function listSettlements(filters: { employerId?: number | null; status?: string | null; scopeEmployerId?: number | null; limit?: number }) {
  const rows = await repo.findSettlements(filters);
  return rows.map((row) => Object.assign(row, {
    id: Number(row.id),
    total_earnings: Number(row.total_earnings ?? 0),
    total_deductions: Number(row.total_deductions ?? 0),
    net_settlement_amount: Number(row.net_settlement_amount ?? 0),
  }));
}

/**
 * Full and final settlement: what the employee is owed on the way out, less what
 * they owe. The engine proposes salary payable (the days of the final month),
 * leave encashment (the ledger balance), the statutory gratuity and any bonus
 * already recorded; the caller can overwrite every figure.
 */
export async function createSettlement(payload: unknown, actor: ActorContext, scope?: { employerId?: number | null }) {
  const input = settlementSchema.parse(payload);
  const employee = await repo.employeeRow(input.employee_id);
  if (!employee) throw validationFailed([{ field: 'employee_id', message: 'That employee does not exist' }]);
  if (scope?.employerId && Number(employee.employer_id) !== scope.employerId) throw forbidden('That employee belongs to another company');

  const lastWorkingDay = input.last_working_day || input.relieving_date || employee.date_of_resignation || null;
  const structure = lastWorkingDay ? await repo.liveStructure(input.employee_id, String(lastWorkingDay).slice(0, 10)) : null;
  const monthlyGross = Number(structure?.gross_salary ?? employee.gross_salary ?? 0);

  // Salary payable for the part-month worked: gross ÷ days in the month × days worked.
  let salaryPayable = 0;
  if (lastWorkingDay) {
    const date = new Date(String(lastWorkingDay).slice(0, 10));
    const bounds = monthBounds(date.getFullYear(), date.getMonth() + 1);
    salaryPayable = round2((monthlyGross / bounds.days) * date.getDate());
  }

  // Leave encashment: the ledger's closing balance at the basic + DA rate.
  const ledger = await repo.findLeaveLedger({ employeeId: input.employee_id, limit: 50 });
  const encashable = await query<PayrollRow>(
    'SELECT DISTINCT name FROM leave_types WHERE encashable = 1'
  ).catch(() => [] as PayrollRow[]);
  const encashableNames = new Set(encashable.map((row) => String(row.name)));
  const encashableDays = ledger
    .filter((row) => encashableNames.has(String(row.leave_name)))
    .reduce((total, row) => total + Number(row.closing_balance ?? 0), 0);
  const dailyRate = ((Number(structure?.basic ?? employee.basic_salary ?? 0) + Number(structure?.da ?? employee.da ?? 0)) / 26);
  const leaveEncashment = input.leave_encashment !== undefined && input.leave_encashment !== null
    ? Number(input.leave_encashment)
    : round2(encashableDays * dailyRate);

  // Gratuity: from the joining date to the last working day, if five years served.
  let gratuityPayable = Number(input.gratuity_payable ?? 0);
  if (input.gratuity_payable === undefined || input.gratuity_payable === null) {
    if (employee.date_of_joining && lastWorkingDay) {
      const calc = gratuityAmount(
        Number(structure?.basic ?? employee.basic_salary ?? 0) + Number(structure?.da ?? employee.da ?? 0),
        String(employee.date_of_joining).slice(0, 10),
        String(lastWorkingDay).slice(0, 10)
      );
      gratuityPayable = calc.amount;
    }
  }

  const noticePayRecovery = input.notice_period_days && input.notice_period_served_days !== undefined
    ? round2(Math.max(0, Number(input.notice_period_days) - Number(input.notice_period_served_days)) * (monthlyGross / 30))
    : 0;

  const earnings = {
    salary_payable: salaryPayable,
    leave_encashment: leaveEncashment,
    bonus_payable: Number(input.bonus_payable ?? 0),
    gratuity_payable: gratuityPayable,
    arrears_payable: Number(input.arrears_payable ?? 0),
    other_earnings: Number(input.other_earnings ?? 0),
  };
  const deductions = {
    notice_pay_recovery: noticePayRecovery,
    advance_recovery: Number(input.advance_recovery ?? 0),
    asset_recovery: Number(input.asset_recovery ?? 0),
    loan_recovery: Number(input.loan_recovery ?? 0),
    tds_deduction: Number(input.tds_deduction ?? 0),
    other_deductions: Number(input.other_deductions ?? 0),
  };
  const totalEarnings = round2(Object.values(earnings).reduce((total, value) => total + value, 0));
  const totalDeductions = round2(Object.values(deductions).reduce((total, value) => total + value, 0));
  const net = round2(Math.max(0, totalEarnings - totalDeductions));

  const settlementNumber = await nextDocumentNumber('settlement');
  const settlementId = await repo.insertSettlement({
    uuid: randomUUID(),
    settlement_number: settlementNumber,
    employer_id: Number(employee.employer_id),
    employee_id: input.employee_id,
    resignation_date: input.resignation_date ?? employee.date_of_resignation ?? null,
    relieving_date: input.relieving_date ?? null,
    last_working_day: lastWorkingDay,
    notice_period_days: input.notice_period_days ?? 0,
    notice_period_served_days: input.notice_period_served_days ?? 0,
    notice_pay_recovery: deductions.notice_pay_recovery,
    salary_payable: earnings.salary_payable,
    leave_encashment: earnings.leave_encashment,
    bonus_payable: earnings.bonus_payable,
    gratuity_payable: earnings.gratuity_payable,
    arrears_payable: earnings.arrears_payable,
    other_earnings: earnings.other_earnings,
    total_earnings: totalEarnings,
    advance_recovery: deductions.advance_recovery,
    asset_recovery: deductions.asset_recovery,
    loan_recovery: deductions.loan_recovery,
    tds_deduction: deductions.tds_deduction,
    other_deductions: deductions.other_deductions,
    total_deductions: totalDeductions,
    net_settlement_amount: net,
    status: 'Draft',
    remarks: input.remarks ?? null,
    created_by: actor.user.id,
    updated_by: actor.user.id,
  });

  await writeActivityLog({
    ...actorFields(actor),
    action: 'created',
    module: 'payroll',
    entityType: 'full_final_settlement',
    entityId: settlementId,
    entityLabel: settlementNumber,
    description: `Full & final settlement ${settlementNumber} prepared for ${String(employee.name)} (${String(employee.employee_number)}) — net ${formatCurrency(net)}`,
    newValues: { earnings: totalEarnings, deductions: totalDeductions, net },
  });

  return {
    id: settlementId,
    settlement_number: settlementNumber,
    earnings,
    deductions,
    total_earnings: totalEarnings,
    total_deductions: totalDeductions,
    net_settlement_amount: net,
    encashable_days: round2(encashableDays),
  };
}

export async function decideSettlement(settlementId: number, status: string, actor: ActorContext, note?: string | null) {
  const record = await repo.findSettlementById(settlementId);
  if (!record) throw notFound('Settlement');
  const current = String(record.status);
  const allowed: Record<string, string[]> = {
    Draft: ['Submitted', 'Cancelled'],
    Submitted: ['Approved', 'Draft', 'Cancelled'],
    Approved: ['Paid', 'Cancelled'],
    Paid: [],
    Cancelled: [],
  };
  if (current === status) throw conflict('INVALID_STATE', `That settlement is already ${status.toLowerCase()}`);
  if (!(allowed[current] ?? []).includes(status)) {
    throw conflict('INVALID_STATE', `A ${current.toLowerCase()} settlement cannot be moved to ${status.toLowerCase()}`);
  }
  const values: Record<string, string | number | Date | null> = { status, updated_by: actor.user.id };
  if (status === 'Approved') {
    values.approved_by = actor.user.id;
    values.approved_at = new Date();
  }
  if (status === 'Paid') {
    values.payment_date = new Date().toISOString().slice(0, 10);
    values.payment_reference = note ?? record.payment_reference ?? null;
    await execute('UPDATE employees SET status = ?, updated_by = ? WHERE id = ?', ['resigned', actor.user.id, Number(record.employee_id)]);
  }
  if (note) values.remarks = note;
  await repo.updateSettlement(settlementId, values);

  await writeActivityLog({
    ...actorFields(actor),
    action: status === 'Paid' ? 'approved' : 'updated',
    module: 'payroll',
    entityType: 'full_final_settlement',
    entityId: settlementId,
    entityLabel: String(record.settlement_number),
    description: `Settlement ${String(record.settlement_number)} for ${String(record.employee_name)} moved from ${current} to ${status}${note ? ` — ${note}` : ''}`,
    oldValues: { status: current },
    newValues: { status },
  });

  return { id: settlementId, status };
}

/* ══════════════════════════ oversight & options ════════════════════════ */

/** The admin dashboard over every employer's payroll. */
export async function payrollOverview(window_: unknown, scope: { employerId?: number | null } = {}) {
  const raw = (window_ ?? {}) as Record<string, unknown>;
  const year = Number(raw.year ?? new Date().getFullYear());
  const month = Number(raw.month ?? new Date().getMonth() + 1);
  const employerId = scope.employerId ?? (raw.employer_id && raw.employer_id !== 'all' ? Number(raw.employer_id) : null);

  const [runs, stats, trend, slips, employers, pendingRuns] = await Promise.all([
    repo.findRuns({ page: 1, limit: 12, sortBy: 'period_to', sortDir: 'desc', employerId, scopeEmployerId: scope.employerId ?? null }),
    repo.runStats({ status: 'all', employerId, scopeEmployerId: scope.employerId ?? null }),
    repo.monthlyTrend(scope.employerId ?? employerId, year),
    repo.payslipStats({ month, year, employerId, scopeEmployerId: scope.employerId ?? null }),
    repo.employerOptions(),
    query<PayrollRow>(
      `SELECT e.id, e.company_name, e.employer_code, COUNT(emp.id) AS employees,
              (SELECT COUNT(*) FROM payroll_runs pr WHERE pr.employer_id = e.id AND pr.year = ? AND pr.month = ? AND pr.deleted_at IS NULL) AS runs_this_month
         FROM employers e
         LEFT JOIN employees emp ON emp.employer_id = e.id AND emp.deleted_at IS NULL AND emp.status = 'active'
        WHERE e.deleted_at IS NULL ${scope.employerId ? 'AND e.id = ?' : ''}
        GROUP BY e.id ORDER BY e.company_name ASC LIMIT 100`,
      scope.employerId ? [year, month, scope.employerId] : [year, month]
    ),
  ]);

  const trendByMonth = new Map(trend.map((row) => [Number(row.month), row]));
  const trendSeries = Array.from({ length: 12 }, (_, index) => {
    const row = trendByMonth.get(index + 1);
    return {
      month: index + 1,
      label: monthLabel(index + 1, year).slice(0, 3),
      gross: Number(row?.gross ?? 0),
      net: Number(row?.net ?? 0),
      pf: Number(row?.pf ?? 0),
      esi: Number(row?.esi ?? 0),
      employees: Number(row?.employees ?? 0),
      runs: Number(row?.runs ?? 0),
    };
  });

  return {
    month,
    year,
    monthLabel: monthLabel(month, year),
    stats,
    slips,
    runs: runs.data.map(shapeRun),
    trend: trendSeries,
    employers: employers.map((row) => ({ value: String(row.id), label: String(row.company_name), hint: String(row.employer_code) })),
    outstanding: pendingRuns
      .filter((row) => Number(row.employees ?? 0) > 0 && Number(row.runs_this_month ?? 0) === 0)
      .map((row) => ({
        employer_id: Number(row.id),
        company_name: String(row.company_name),
        employer_code: String(row.employer_code),
        employees: Number(row.employees ?? 0),
      })),
  };
}

export async function payrollOptions(scope: { employerId?: number | null } = {}) {
  const employerId = scope.employerId ?? null;
  const [employers, units, departments, heads, leaveTypes] = await Promise.all([
    employerId ? Promise.resolve([]) : repo.employerOptions(),
    repo.unitOptions(employerId),
    repo.departmentOptions(employerId),
    query<PayrollRow>(
      `SELECT id, head_code, head_name, head_name_ta, head_type, calculation_type, is_statutory
         FROM payroll_heads WHERE status = 'active' ORDER BY head_type ASC, sort_order ASC`
    ),
    repo.findLeaveTypes(employerId),
  ]);
  return {
    employers: employers.map((row) => ({ value: String(row.id), label: String(row.company_name), hint: String(row.employer_code) })),
    units: units.map((row) => ({ value: String(row.id), label: String(row.unit_name), employerId: Number(row.employer_id) })),
    departments: departments.map((row) => ({ value: String(row.id), label: String(row.department_name), employerId: Number(row.employer_id) })),
    heads: heads.map((row) => ({
      value: String(row.id),
      code: String(row.head_code),
      label: String(row.head_name),
      nameTa: row.head_name_ta ? String(row.head_name_ta) : null,
      type: String(row.head_type),
      calculationType: String(row.calculation_type),
      isStatutory: Boolean(Number(row.is_statutory)),
    })),
    leaveTypes: leaveTypes.map((row) => ({
      value: String(row.id),
      label: String(row.name),
      isPaid: Boolean(Number(row.is_paid)),
      maxDays: Number(row.max_days_per_year ?? 0),
      requiresDocument: Boolean(Number(row.requires_document)),
    })),
    paymentModes: ['Bank Transfer', 'Cash', 'Cheque', 'UPI'],
  };
}

/**
 * The pay register: every payslip of a month in one table, with the head totals
 * a payroll officer reconciles against the bank statement. This is the report
 * an inspector asks for and the establishment prints.
 */
export async function payRegister(filters: repo.PayslipListFilters) {
  const result = await repo.findPayslips({ ...filters, limit: Math.min(Number(filters.limit ?? 500), 1000) });
  const slips = result.data;
  const totals = slips.reduce(
    (accumulator, row) => ({
      gross: accumulator.gross + Number(row.gross_earnings ?? 0),
      basic: accumulator.basic + Number(row.basic ?? 0),
      da: accumulator.da + Number(row.da ?? 0),
      hra: accumulator.hra + Number(row.hra ?? 0),
      allowances: accumulator.allowances + Number(row.ta ?? 0) + Number(row.pa ?? 0) + Number(row.ea ?? 0) + Number(row.npba ?? 0) + Number(row.other_allowances ?? 0),
      overtime: accumulator.overtime + Number(row.overtime_amount ?? 0),
      pf: accumulator.pf + Number(row.pf_employee ?? 0),
      esi: accumulator.esi + Number(row.esi_employee ?? 0),
      pt: accumulator.pt + Number(row.professional_tax ?? 0),
      lwf: accumulator.lwf + Number(row.lwf_amount ?? 0),
      tds: accumulator.tds + Number(row.tds_amount ?? 0),
      deductions: accumulator.deductions + Number(row.total_deductions ?? 0),
      net: accumulator.net + Number(row.net_pay ?? 0),
      pfEmployer: accumulator.pfEmployer + Number(row.pf_employer ?? 0),
      esiEmployer: accumulator.esiEmployer + Number(row.esi_employer ?? 0),
    }),
    {
      gross: 0, basic: 0, da: 0, hra: 0, allowances: 0, overtime: 0, pf: 0, esi: 0, pt: 0, lwf: 0, tds: 0,
      deductions: 0, net: 0, pfEmployer: 0, esiEmployer: 0,
    }
  );
  return {
    rows: slips.map(shapePayslip),
    totals: Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, round2(value)])),
    count: slips.length,
  };
}

/* ═══════════════════════ the monthly reminder job ═══════════════════════ */

/**
 * Reminds the office that a payroll month has closed without a run.
 *
 * The ledger key is the employer and the month, so the job nudges once per
 * company per month however often it runs — and stops nudging the moment the
 * run exists.
 */
export async function runPayrollReminders(claim: (
  key: string,
  type: 'PAYROLL_PENDING',
  channel: 'email',
  entityType: string,
  entityId: number,
  recipient: string
) => Promise<boolean>) {
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const month = lastMonth.getMonth() + 1;
  const year = lastMonth.getFullYear();

  const outstanding = await query<PayrollRow>(
    `SELECT e.id, e.company_name, e.employer_code, COUNT(emp.id) AS employees
       FROM employers e
       JOIN employees emp ON emp.employer_id = e.id AND emp.deleted_at IS NULL AND emp.status = 'active'
      WHERE e.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM payroll_runs pr
           WHERE pr.employer_id = e.id AND pr.year = ? AND pr.month = ? AND pr.deleted_at IS NULL
        )
      GROUP BY e.id ORDER BY e.company_name ASC`,
    [year, month]
  );

  const summary = { job: 'payroll-month-reminder', candidates: outstanding.length, dispatched: 0, skipped: 0, errors: [] as string[] };
  if (!outstanding.length) return summary;

  const adminIds = await usersWithRole('admin');
  const label = monthLabel(month, year);

  for (const employer of outstanding) {
    try {
      const recipients = new Set<number>(adminIds);
      const portalUsers = await query<PayrollRow>(
        `SELECT DISTINCT u.id FROM users u JOIN employer_users eu ON eu.user_id = u.id
          WHERE eu.employer_id = ? AND u.deleted_at IS NULL AND u.status = 'active'`,
        [Number(employer.id)]
      ).catch(() => [] as PayrollRow[]);
      for (const row of portalUsers) recipients.add(Number(row.id));

      for (const userId of recipients) {
        const key = `payroll:${employer.id}:${year}-${String(month).padStart(2, '0')}:user:${userId}`;
        const claimed = await claim(key, 'PAYROLL_PENDING', 'email', 'payroll_run', Number(employer.id), String(employer.employer_code ?? ''));
        if (!claimed) {
          summary.skipped += 1;
          continue;
        }
        await notifyMany([userId], {
          title: `Payroll for ${label} has not been run`,
          message: `${String(employer.company_name)} has ${Number(employer.employees)} active employee(s) but no payroll run for ${label}. Create the run and calculate it.`,
          category: 'PAYROLL',
          actionUrl: '/admin/payroll-monitoring',
          actionLabel: 'Open payroll',
          entityType: 'payroll_run',
          entityId: Number(employer.id),
        });
        summary.dispatched += 1;
      }
    } catch (error) {
      summary.errors.push(`${String(employer.company_name)}: ${(error as Error).message}`);
    }
  }

  return summary;
}
