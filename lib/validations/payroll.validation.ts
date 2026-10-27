/**
 * Payroll contracts.
 *
 * The payroll side of the platform has five moving parts, and each has its own
 * schema here:
 *
 *   1. **Runs** — a month of payroll for one employer (optionally narrowed to a
 *      unit or department). The run is the unit of work: it is created, the
 *      engine computes it, it is approved, locked, paid and its payslips
 *      published. Nothing about a locked run can move afterwards.
 *   2. **Salary structures** — the contract with the employee: monthly amounts
 *      per head, a revision chain, and the statutory switches (PF/ESI/PT/LWF)
 *      the engine obeys. A structure is never edited into history; a new
 *      revision supersedes it from its effective date.
 *   3. **Statutory extras** — bonus, gratuity and the full-and-final
 *      settlement, each with its own calculation inputs.
 *   4. **Payslips** — queried and filtered here; written only by the engine.
 *   5. **Attendance** — the days the engine counts. Present/Absent/Half Day/
 *      Leave/Holiday/Weekly Off, per employee per day, with overtime hours.
 *
 * Optional fields follow the platform rule: an absent key stays `undefined`
 * (so a partial update leaves the column alone) and only an explicit `''`
 * clears it to `null`.
 */
import { z } from 'zod';

const asTuple = <T extends string>(values: readonly T[]): [T, ...T[]] => [...values] as [T, ...T[]];

const optionalString = (max: number) =>
  z.string().trim().max(max).optional().nullable()
    .transform((value) => (value === undefined ? undefined : value === '' ? null : value));

const optionalDate = z
  .union([z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the date picker'), z.literal('')])
  .optional()
  .nullable()
  .transform((value) => (value === undefined ? undefined : value === '' || value === null ? null : value));

const optionalId = z.coerce.number().int().positive().optional().nullable();
const money = z.coerce.number().min(0, 'An amount cannot be negative').max(99_99_99_999).optional();
const booleanish = z
  .union([z.boolean(), z.literal(0), z.literal(1), z.literal('0'), z.literal('1'), z.literal('true'), z.literal('false')])
  .transform((value) => value === true || value === 1 || value === '1' || value === 'true');

/* ────────────────────────────── catalogues ─────────────────────────────── */

export const PAYROLL_RUN_STATUSES = ['Draft', 'Calculated', 'Approved', 'Locked', 'Paid', 'Cancelled'] as const;
export const PAYROLL_RUN_STATUS_LABELS: Record<string, string> = {
  Draft: 'Draft — created, not yet computed',
  Calculated: 'Calculated — payslips generated, editable',
  Approved: 'Approved — signed off, awaiting lock',
  Locked: 'Locked — payslips frozen, ready to pay',
  Paid: 'Paid — money disbursed, payslips published',
  Cancelled: 'Cancelled — the run was withdrawn',
};

export const PAYMENT_STATUSES = ['Pending', 'Paid', 'Failed', 'On Hold'] as const;
export const PAYMENT_MODES = ['Bank Transfer', 'Cash', 'Cheque', 'UPI'] as const;
export const SETTLEMENT_STATUSES = ['Draft', 'Submitted', 'Approved', 'Paid', 'Cancelled'] as const;
export const BONUS_TYPES = ['Statutory Bonus', 'Ex-gratia', 'Festival Bonus', 'Performance Bonus'] as const;
export const SALARY_REVISION_REASONS = [
  'Annual increment', 'Promotion', 'Statutory revision (minimum wages)', 'Correction', 'Transfer', 'Other',
] as const;

export const ATTENDANCE_STATUSES = [
  'Present', 'Absent', 'Half Day', 'Leave', 'Holiday', 'Weekly Off', 'On Duty', 'Late', 'Comp Off',
] as const;

/** Attendance rows that count as a full day worked. */
export const PRESENT_STATUSES: readonly string[] = ['Present', 'On Duty', 'Late', 'Comp Off'];
/** Attendance rows that count as half a day worked. */
export const HALF_DAY_STATUS: string = 'Half Day';
/** Attendance rows that are paid but not worked. */
export const PAID_NON_WORKING_STATUSES: readonly string[] = ['Leave', 'Holiday', 'Weekly Off'];
/** Attendance rows that cost pay. */
export const UNPAID_STATUSES: readonly string[] = ['Absent'];

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

/**
 * Days in a month that are actually payable without attendance.
 *
 * The engine treats a holiday and the weekly off as paid days off (they fall in
 * whichever attendance scheme the establishment keeps) and prorates a monthly
 * wage by the days in the calendar month minus the loss-of-pay days, which is
 * the convention Indian monthly-rated payroll uses.
 */
export function monthBounds(year: number, month: number): { from: string; to: string; days: number } {
  const days = new Date(year, month, 0).getDate();
  const pad = (value: number) => String(value).padStart(2, '0');
  return {
    from: `${year}-${pad(month)}-01`,
    to: `${year}-${pad(month)}-${pad(days)}`,
    days,
  };
}

export const monthLabel = (month: number, year: number) => `${MONTH_NAMES[month - 1] ?? month} ${year}`;

/* ──────────────────────────────── runs ─────────────────────────────────── */

export const payrollRunSchema = z.object({
  employer_id: z.coerce.number().int().positive('Choose the company the payroll is for'),
  unit_id: optionalId,
  department_id: optionalId,
  month: z.coerce.number().int().min(1, 'Choose the month').max(12, 'Choose the month'),
  year: z.coerce.number().int().min(2000).max(2100),
  period_from: optionalDate,
  period_to: optionalDate,
  calculation_notes: optionalString(2000),
  /** Employees to leave out of the run, e.g. someone whose settlement is open. */
  exclude_employee_ids: z.array(z.coerce.number().int().positive()).max(1000).optional(),
});

export const payrollRunUpdateSchema = z.object({
  period_from: optionalDate,
  period_to: optionalDate,
  calculation_notes: optionalString(2000),
  unit_id: optionalId,
  department_id: optionalId,
});

export const payrollRunListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(10),
  search: z.string().trim().max(200).optional(),
  status: z.union([z.enum(asTuple(PAYROLL_RUN_STATUSES)), z.literal('all'), z.literal('')]).optional().default('all'),
  employer_id: z.union([z.coerce.number().int().positive(), z.literal(''), z.literal('all')]).optional(),
  unit_id: z.union([z.coerce.number().int().positive(), z.literal(''), z.literal('all')]).optional(),
  month: z.union([z.coerce.number().int().min(1).max(12), z.literal(''), z.literal('all')]).optional(),
  year: z.union([z.coerce.number().int().min(2000).max(2100), z.literal(''), z.literal('all')]).optional(),
  from_date: z.union([z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal('')]).optional().default(''),
  to_date: z.union([z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal('')]).optional().default(''),
  sortBy: z.string().trim().max(40).optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
});

/** The bank file is generated for the payslips of one run. */
export const bankFileSchema = z.object({
  format: z.enum(['csv', 'neft', 'nach']).optional().default('csv'),
  mode: z.enum(asTuple(PAYMENT_MODES)).optional().default('Bank Transfer'),
});

/* ──────────────────────────── salary structures ────────────────────────── */

export const salaryStructureSchema = z
  .object({
    employee_id: z.coerce.number().int().positive('Choose the employee'),
    structure_name: optionalString(120),
    effective_from: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose the date the structure starts'),
    effective_to: optionalDate,
    basic: money,
    da: money,
    hra: money,
    ta: money,
    pa: money,
    ea: money,
    npba: money,
    other_allowances: money,
    wage_type: z.enum(['Per Day', 'Per Month']).optional().default('Per Month'),
    daily_wage: money,
    pf_applicable: booleanish.optional().default(true),
    pf_employee_percent: z.coerce.number().min(0).max(100).optional(),
    pf_employer_percent: z.coerce.number().min(0).max(100).optional(),
    pf_wage_ceiling: z.coerce.number().min(0).max(1_000_000).optional(),
    vpf_percent: z.coerce.number().min(0).max(100).optional(),
    esi_applicable: booleanish.optional().default(true),
    esi_employee_percent: z.coerce.number().min(0).max(100).optional(),
    esi_employer_percent: z.coerce.number().min(0).max(100).optional(),
    esi_wage_ceiling: z.coerce.number().min(0).max(1_000_000).optional(),
    pt_state: optionalString(60),
    pt_amount: money,
    lwf_applicable: booleanish.optional().default(true),
    lwf_amount: money,
    revision_reason: optionalString(200),
    /** Extra heads beyond the eight contractual columns, straight from the head catalogue. */
    items: z
      .array(
        z.object({
          payroll_head_id: optionalId,
          head_code: z.string().trim().min(1).max(30),
          head_name: z.string().trim().min(1).max(120),
          head_type: z.enum(['Earning', 'Deduction', 'Employer Contribution']).optional(),
          amount: z.coerce.number().min(0).max(99_99_99_999).optional(),
          percent_of_basic: z.coerce.number().min(0).max(1000).optional(),
        })
      )
      .max(40)
      .optional(),
  })
  .refine(
    (value) => !value.effective_to || !value.effective_from || value.effective_to >= value.effective_from,
    { message: 'The structure cannot end before it starts', path: ['effective_to'] }
  )
  .refine(
    (value) => [value.basic, value.da, value.hra, value.ta, value.pa, value.ea, value.npba, value.other_allowances]
      .some((amount) => Number(amount ?? 0) > 0),
    { message: 'Give the structure at least one wage head', path: ['basic'] }
  );

export const salaryStructureUpdateSchema = salaryStructureSchema;

export const salaryStructureListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(10),
  search: z.string().trim().max(200).optional(),
  employer_id: z.union([z.coerce.number().int().positive(), z.literal(''), z.literal('all')]).optional(),
  unit_id: z.union([z.coerce.number().int().positive(), z.literal(''), z.literal('all')]).optional(),
  department_id: z.union([z.coerce.number().int().positive(), z.literal(''), z.literal('all')]).optional(),
  live: z.enum(['all', 'yes', 'no']).optional().default('all'),
  pf: z.enum(['all', 'yes', 'no']).optional().default('all'),
  esi: z.enum(['all', 'yes', 'no']).optional().default('all'),
  from_date: z.union([z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal('')]).optional().default(''),
  to_date: z.union([z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal('')]).optional().default(''),
  sortBy: z.string().trim().max(40).optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
});

/* ───────────────────────────────── payslips ────────────────────────────── */

export const payslipListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(10),
  search: z.string().trim().max(200).optional(),
  run_id: z.coerce.number().int().positive().optional(),
  employee_id: z.coerce.number().int().positive().optional(),
  employer_id: z.union([z.coerce.number().int().positive(), z.literal(''), z.literal('all')]).optional(),
  unit_id: z.union([z.coerce.number().int().positive(), z.literal(''), z.literal('all')]).optional(),
  department_id: z.union([z.coerce.number().int().positive(), z.literal(''), z.literal('all')]).optional(),
  month: z.union([z.coerce.number().int().min(1).max(12), z.literal(''), z.literal('all')]).optional(),
  year: z.union([z.coerce.number().int().min(2000).max(2100), z.literal(''), z.literal('all')]).optional(),
  payment_status: z.union([z.enum(asTuple(PAYMENT_STATUSES)), z.literal('all'), z.literal('')]).optional().default('all'),
  published: z.enum(['all', 'yes', 'no']).optional().default('all'),
  sortBy: z.string().trim().max(40).optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
});

export const payslipPaymentSchema = z.object({
  ids: z.array(z.coerce.number().int().positive()).min(1, 'Select at least one payslip').max(2000),
  payment_status: z.enum(asTuple(PAYMENT_STATUSES)),
  payment_mode: z.enum(asTuple(PAYMENT_MODES)).optional(),
  payment_reference: optionalString(120),
  paid_at: optionalDate,
});

/* ────────────────────────────── bonus & gratuity ───────────────────────── */

export const bonusSchema = z.object({
  employee_ids: z.array(z.coerce.number().int().positive()).min(1, 'Select at least one employee').max(2000),
  bonus_year: z.coerce.number().int().min(2000).max(2100),
  bonus_type: z.enum(asTuple(BONUS_TYPES)).optional().default('Statutory Bonus'),
  calculation_from: optionalDate,
  calculation_to: optionalDate,
  bonus_percent: z.coerce.number().min(0).max(100).optional(),
  /** Statutory bonus applies to wages up to this ceiling (Payment of Bonus Act). */
  wage_ceiling: z.coerce.number().min(0).max(1_000_000).optional(),
  payment_date: optionalDate,
  remarks: optionalString(1000),
});

export const gratuitySchema = z
  .object({
    employee_id: z.coerce.number().int().positive('Choose the employee'),
    service_from: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose the date service began'),
    service_to: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose the date service ended'),
    last_drawn_wages: money,
    payment_date: optionalDate,
    calculation_note: optionalString(1000),
  })
  .refine((value) => value.service_to >= value.service_from, {
    message: 'The service period cannot end before it starts',
    path: ['service_to'],
  });

export const settlementSchema = z.object({
  employee_id: z.coerce.number().int().positive('Choose the employee'),
  resignation_date: optionalDate,
  relieving_date: optionalDate,
  last_working_day: optionalDate,
  notice_period_days: z.coerce.number().int().min(0).max(365).optional(),
  notice_period_served_days: z.coerce.number().int().min(0).max(365).optional(),
  leave_encashment: money,
  bonus_payable: money,
  gratuity_payable: money,
  arrears_payable: money,
  other_earnings: money,
  advance_recovery: money,
  asset_recovery: money,
  loan_recovery: money,
  tds_deduction: money,
  other_deductions: money,
  remarks: optionalString(2000),
});

/* ─────────────────────────────── attendance ────────────────────────────── */

export const attendanceRowSchema = z.object({
  employee_id: z.coerce.number().int().positive('Choose the employee'),
  attendance_date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the date picker'),
  status: z.enum(asTuple(ATTENDANCE_STATUSES)),
  leave_type: optionalString(60),
  in_time: optionalString(20),
  out_time: optionalString(20),
  worked_hours: z.coerce.number().min(0).max(24).optional(),
  overtime_hours: z.coerce.number().min(0).max(24).optional(),
  remarks: optionalString(500),
});

export const attendanceBulkSchema = z.object({
  employer_id: z.coerce.number().int().positive(),
  unit_id: optionalId,
  department_id: optionalId,
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000).max(2100),
  /** Every working day of the month defaults to Present; the exceptions follow. */
  default_status: z.enum(asTuple(ATTENDANCE_STATUSES)).optional().default('Present'),
  rows: z.array(attendanceRowSchema).max(5000).optional(),
});

export const attendanceListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(10),
  search: z.string().trim().max(200).optional(),
  employer_id: z.union([z.coerce.number().int().positive(), z.literal(''), z.literal('all')]).optional(),
  unit_id: z.union([z.coerce.number().int().positive(), z.literal(''), z.literal('all')]).optional(),
  department_id: z.union([z.coerce.number().int().positive(), z.literal(''), z.literal('all')]).optional(),
  employee_id: z.coerce.number().int().positive().optional(),
  month: z.union([z.coerce.number().int().min(1).max(12), z.literal(''), z.literal('all')]).optional(),
  year: z.union([z.coerce.number().int().min(2000).max(2100), z.literal(''), z.literal('all')]).optional(),
  status: z.union([z.enum(asTuple(ATTENDANCE_STATUSES)), z.literal('all'), z.literal('')]).optional().default('all'),
  from_date: z.union([z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal('')]).optional().default(''),
  to_date: z.union([z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal('')]).optional().default(''),
  sortBy: z.string().trim().max(40).optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
});

/* ──────────────────────────── leave applications ───────────────────────── */

export const leaveApplicationSchema = z
  .object({
    employee_id: z.coerce.number().int().positive('Choose the employee'),
    leave_type_id: z.coerce.number().int().positive('Choose the leave type'),
    date_from: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose the date leave begins'),
    date_to: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose the date leave ends'),
    is_half_day: booleanish.optional().default(false),
    reason: z.string().trim().min(3, 'Give the reason for the leave').max(2000),
    document_file_id: optionalId,
  })
  .refine((value) => value.date_to >= value.date_from, {
    message: 'Leave cannot end before it starts',
    path: ['date_to'],
  });

export const leaveDecisionSchema = z.object({
  decision: z.enum(['approve', 'reject', 'withdraw']),
  approver_comments: optionalString(1000),
});

export const leaveTypeSchema = z.object({
  name: z.string().trim().min(2, 'Give the leave type a name').max(120),
  name_ta: optionalString(120),
  is_paid: booleanish.optional().default(true),
  max_days_per_year: z.coerce.number().int().min(0).max(365).optional(),
  carry_forward: booleanish.optional().default(false),
  max_carry_forward: z.coerce.number().int().min(0).max(365).optional(),
  encashable: booleanish.optional().default(false),
  requires_document: booleanish.optional().default(false),
  min_days_notice: z.coerce.number().int().min(0).max(90).optional(),
});

/* ────────────────────────────── payroll reads ──────────────────────────── */

/** The window every payroll dashboard reads: a month, an employer, a unit. */
export const payrollWindowQuerySchema = z.object({
  month: z.coerce.number().int().min(1).max(12).optional().default(new Date().getMonth() + 1),
  year: z.coerce.number().int().min(2000).max(2100).optional().default(new Date().getFullYear()),
  employer_id: z.union([z.coerce.number().int().positive(), z.literal('all'), z.literal('')]).optional(),
  unit_id: z.union([z.coerce.number().int().positive(), z.literal('all'), z.literal('')]).optional(),
});

export function toIsoDay(value: Date | string): string {
  if (value instanceof Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  return String(value).slice(0, 10);
}
