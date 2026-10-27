/**
 * The statutory half of the payroll engine — everything that is fixed by law
 * rather than by the contract, kept in one place so a rate change is one edit.
 *
 * What is here and where each number comes from:
 *
 *   * **PF (EPF)** — 12% of PF wages from the employee and 12% from the
 *     employer, of which 8.33% is diverted to EPS and 0.5% EDLI + 0.5%
 *     administrative charges are the employer's own. PF wages are capped at the
 *     statutory ceiling (₹15,000 a month) for the *contribution base*, which is
 *     how the ceiling is applied in practice; a structure may override both the
 *     percentages and the ceiling, and may switch PF off entirely for an
 *     employee who is not covered.
 *   * **ESI** — 0.75% employee, 3.25% employer, on gross wages up to the
 *     ₹21,000 monthly ceiling. Above the ceiling the employee is out of ESI for
 *     that month (the contribution is not merely zero-rated: it stops).
 *   * **Professional tax** — a state levy on the *monthly gross*, charged in
 *     slabs. The table below carries the southern states the platform's clients
 *     operate in; a structure's own `pt_amount` always wins over the table, so
 *     an establishment that knows its own rate is never second-guessed.
 *   * **LWF** — Labour Welfare Fund, a small contribution that Tamil Nadu and
 *     Karnataka collect **half-yearly**, deducted from the June and December
 *     payroll. The employee rate is per state; the run only raises it in the
 *     two months the state asks for it, unless the structure says otherwise.
 *   * **TDS** — a *provisional* estimate, and deliberately labelled as one: the
 *     platform does not have the employee's investment declarations, so it
 *     annualises the month's taxable earnings, applies the standard deduction
 *     and the new-regime slabs, and spreads the result over twelve months. The
 *     amount lands on the payslip as `tds_amount` and can be overridden per
 *     employee before the run is approved.
 *
 * None of this is a substitute for a payroll bureau's opinion — it is the
 * arithmetic, applied consistently, with every rate visible and overridable.
 * What it is not is guessed: a rate that changes is changed here, in one file,
 * and every run computed afterwards reflects it.
 */

export interface StatutoryRates {
  pf: {
    employeePercent: number;
    employerPercent: number;
    ceiling: number;
    epsPercent: number;
    edliPercent: number;
    adminPercent: number;
  };
  esi: {
    employeePercent: number;
    employerPercent: number;
    ceiling: number;
  };
  /** Payment of Bonus Act: eligibility and calculation ceiling. */
  bonus: { eligibilityCeiling: number; calculationCeiling: number; percent: number; minPercent: number; maxPercent: number };
  gratuity: { daysPerYear: number; divisor: number; maxExempt: number };
  /** Overtime is paid at twice the ordinary rate of wages (Factories Act). */
  overtime: { multiplier: number; monthlyDivisor: number; hoursPerDay: number };
}

export const STATUTORY_RATES: StatutoryRates = {
  pf: {
    employeePercent: 12,
    employerPercent: 12,
    ceiling: 15000,
    epsPercent: 8.33,
    edliPercent: 0.5,
    adminPercent: 0.5,
  },
  esi: { employeePercent: 0.75, employerPercent: 3.25, ceiling: 21000 },
  bonus: { eligibilityCeiling: 21000, calculationCeiling: 7000, percent: 8.33, minPercent: 8.33, maxPercent: 20 },
  gratuity: { daysPerYear: 15, divisor: 26, maxExempt: 2000000 },
  overtime: { multiplier: 2, monthlyDivisor: 26, hoursPerDay: 8 },
};

/* ────────────────────────── professional tax ───────────────────────────── */

interface PtSlab { upTo: number | null; amount: number }

/**
 * Monthly professional tax slabs. `null` as the last `upTo` means "and above".
 * Amounts are the monthly instalments of each state's half-yearly charge.
 */
export const PROFESSIONAL_TAX_SLABS: Record<string, PtSlab[]> = {
  'Tamil Nadu': [
    { upTo: 15000, amount: 0 },
    { upTo: 20000, amount: 208 },
    { upTo: 30000, amount: 312 },
    { upTo: 45000, amount: 462 },
    { upTo: 60000, amount: 625 },
    { upTo: null, amount: 1250 },
  ],
  Karnataka: [
    { upTo: 25000, amount: 0 },
    { upTo: null, amount: 200 },
  ],
  Maharashtra: [
    { upTo: 7500, amount: 0 },
    { upTo: 10000, amount: 175 },
    { upTo: null, amount: 200 },
  ],
  'Andhra Pradesh': [
    { upTo: 15000, amount: 0 },
    { upTo: 20000, amount: 150 },
    { upTo: null, amount: 200 },
  ],
  Telangana: [
    { upTo: 15000, amount: 0 },
    { upTo: 20000, amount: 150 },
    { upTo: null, amount: 200 },
  ],
  Kerala: [
    { upTo: 11999, amount: 0 },
    { upTo: 17999, amount: 20 },
    { upTo: 29999, amount: 30 },
    { upTo: 44999, amount: 50 },
    { upTo: 59999, amount: 100 },
    { upTo: 79999, amount: 125 },
    { upTo: 99999, amount: 166 },
    { upTo: 124999, amount: 208 },
    { upTo: null, amount: 250 },
  ],
};

/** The professional tax a monthly gross attracts in a state, or 0 if unlisted. */
export function professionalTax(state: string | null | undefined, monthlyGross: number): number {
  const slabs = state ? PROFESSIONAL_TAX_SLABS[state.trim()] : undefined;
  if (!slabs) return 0;
  for (const slab of slabs) {
    if (slab.upTo === null || monthlyGross <= slab.upTo) return slab.amount;
  }
  return 0;
}

/* ───────────────────────────── labour welfare ──────────────────────────── */

/** Employee and employer LWF contributions, and the months they are collected in. */
export const LWF_RATES: Record<string, { employee: number; employer: number; months: number[] }> = {
  'Tamil Nadu': { employee: 20, employer: 40, months: [6, 12] },
  Karnataka: { employee: 20, employer: 40, months: [6, 12] },
  Maharashtra: { employee: 25, employer: 75, months: [6, 12] },
  Kerala: { employee: 20, employer: 20, months: [6, 12] },
};

/**
 * Whether LWF falls due this month for a state, and how much the employee owes.
 * `amountOverride` (from the structure) is charged every month it is set, which
 * is what an establishment that collects it monthly expects.
 */
export function labourWelfareFund(
  state: string | null | undefined,
  month: number,
  amountOverride?: number | null
): { applies: boolean; employee: number; employer: number } {
  const rate = state ? LWF_RATES[state.trim()] : undefined;
  if (amountOverride !== null && amountOverride !== undefined && amountOverride > 0) {
    return { applies: true, employee: amountOverride, employer: amountOverride * 2 };
  }
  if (!rate) return { applies: false, employee: 0, employer: 0 };
  if (!rate.months.includes(month)) return { applies: false, employee: 0, employer: 0 };
  return { applies: true, employee: rate.employee, employer: rate.employer };
}

/* ──────────────────────────── income tax (provisional) ─────────────────── */

/** New-regime slabs, FY 2025-26 onward. `null` means "and above". */
const TDS_SLABS: { upTo: number | null; rate: number }[] = [
  { upTo: 400000, rate: 0 },
  { upTo: 800000, rate: 5 },
  { upTo: 1200000, rate: 10 },
  { upTo: 1600000, rate: 15 },
  { upTo: 2000000, rate: 20 },
  { upTo: 2400000, rate: 25 },
  { upTo: null, rate: 30 },
];

export const TDS_STANDARD_DEDUCTION = 75000;
export const TDS_CESS_PERCENT = 4;

/** Annual tax on a taxable income, new regime, cess included. */
export function annualTax(taxableIncome: number): number {
  let remaining = Math.max(0, taxableIncome);
  let previous = 0;
  let tax = 0;
  for (const slab of TDS_SLABS) {
    const ceiling = slab.upTo ?? Infinity;
    const band = Math.min(remaining, ceiling - previous);
    if (band > 0) tax += (band * slab.rate) / 100;
    remaining -= band;
    previous = ceiling;
    if (remaining <= 0) break;
  }
  return Math.round(tax * (1 + TDS_CESS_PERCENT / 100));
}

/**
 * The month's provisional TDS: the month's taxable earnings annualised, less the
 * standard deduction, taxed, then spread back over twelve months.
 *
 * A payroll officer who knows better overrides the figure on the payslip before
 * approving the run — the number here is a starting point, not a filing.
 */
export function provisionalMonthlyTds(monthlyTaxableEarnings: number): number {
  const annual = Math.max(0, monthlyTaxableEarnings * 12 - TDS_STANDARD_DEDUCTION);
  if (annual <= 400000) return 0;
  return Math.round(annualTax(annual) / 12);
}

/* ───────────────────────────── gratuity & bonus ────────────────────────── */

/**
 * Gratuity under the Payment of Gratuity Act: 15 days' wages for every completed
 * year of service, on the last drawn wages (basic + DA), 26-day divisor, capped
 * at ₹20 lakh. Part-years over six months are rounded up; six months or less
 * are dropped.
 */
export function gratuityAmount(lastDrawnWages: number, serviceFrom: string | Date, serviceTo: string | Date) {
  const from = new Date(serviceFrom);
  const to = new Date(serviceTo);
  let years = to.getFullYear() - from.getFullYear();
  let months = to.getMonth() - from.getMonth();
  let days = to.getDate() - from.getDate();
  if (days < 0) months -= 1;
  if (months < 0) { years -= 1; months += 12; }
  const completedYears = years + (months > 6 || (months === 6 && days > 0) ? 1 : 0);
  const eligible = completedYears >= 5;
  const raw = (lastDrawnWages * STATUTORY_RATES.gratuity.daysPerYear * completedYears) / STATUTORY_RATES.gratuity.divisor;
  const capped = Math.min(raw, STATUTORY_RATES.gratuity.maxExempt);
  return {
    totalServiceYears: completedYears,
    isStatutoryEligible: eligible,
    amount: eligible ? Math.round(capped) : 0,
    note: eligible
      ? `${completedYears} year(s) of service × 15 days ÷ 26 on ${lastDrawnWages.toFixed(2)}`
      : `Not eligible — ${completedYears} completed year(s) of service (five are required)`,
  };
}

/**
 * Statutory bonus under the Payment of Bonus Act: 8.33% (minimum) up to 20% of
 * the wages actually paid in the year, calculated on the higher of the minimum
 * wage and ₹7,000 a month. Only employees drawing up to ₹21,000 a month are
 * eligible.
 */
export function statutoryBonus(latestMonthlyWages: number, wagesPaidInYear: number, percent?: number | null) {
  const eligible = latestMonthlyWages <= STATUTORY_RATES.bonus.eligibilityCeiling;
  const rate = Math.min(
    Math.max(percent ?? STATUTORY_RATES.bonus.percent, STATUTORY_RATES.bonus.minPercent),
    STATUTORY_RATES.bonus.maxPercent
  );
  const eligibleWages = Math.min(wagesPaidInYear, (STATUTORY_RATES.bonus.calculationCeiling * 12));
  return {
    isEligible: eligible,
    eligibleWages,
    percent: rate,
    amount: eligible ? Math.round((eligibleWages * rate) / 100) : 0,
    note: eligible
      ? `${rate}% of ${eligibleWages.toFixed(2)} — wages capped at ₹${STATUTORY_RATES.bonus.calculationCeiling}/month`
      : `Not eligible — monthly wages above ₹${STATUTORY_RATES.bonus.eligibilityCeiling}`,
  };
}

/* ─────────────────────────────── day maths ─────────────────────────────── */

export interface AttendanceTallies {
  presentDays: number;
  halfDays: number;
  leaveDays: number;
  absentDays: number;
  holidayDays: number;
  weeklyOffDays: number;
  overtimeHours: number;
  /** Days the employee is paid for: worked, paid leave, holidays, weekly offs. */
  paidDays: number;
  /** Days that cost pay. */
  lopDays: number;
}

/** Counts how many times a weekday falls in a month. */
export function weekdayCount(year: number, month: number, weekday: number): number {
  const days = new Date(year, month, 0).getDate();
  let count = 0;
  for (let day = 1; day <= days; day += 1) {
    if (new Date(year, month - 1, day).getDay() === weekday) count += 1;
  }
  return count;
}

/**
 * Turns a month's attendance rows into the tallies the engine works from.
 *
 * A day is paid if it was worked (Present, On Duty, Late, Comp Off), is half
 * worked, is paid leave, is a holiday or is the weekly off. A day is lost if it
 * was absent — unless the absence was an approved *paid* leave day recorded as
 * `Leave`, which is why the leave type's paid flag is passed in with the rows.
 */
export function tallyAttendance(
  rows: { status: string; overtime_hours?: unknown; leave_paid?: unknown }[],
  context: { year: number; month: number; weeklyOffDay: number; holidays: number }
): AttendanceTallies {
  let presentDays = 0;
  let halfDays = 0;
  let leaveDays = 0;
  let unpaidLeaveDays = 0;
  let absentDays = 0;
  let holidayDays = 0;
  let weeklyOffDays = 0;
  let overtimeHours = 0;

  for (const row of rows) {
    const status = String(row.status);
    overtimeHours += Number(row.overtime_hours ?? 0);
    switch (status) {
      case 'Present':
      case 'On Duty':
      case 'Late':
      case 'Comp Off':
        presentDays += 1;
        break;
      case 'Half Day':
        halfDays += 1;
        break;
      case 'Leave':
        leaveDays += 1;
        if (row.leave_paid !== undefined && Number(row.leave_paid) === 0) unpaidLeaveDays += 1;
        break;
      case 'Absent':
        absentDays += 1;
        break;
      case 'Holiday':
        holidayDays += 1;
        break;
      case 'Weekly Off':
        weeklyOffDays += 1;
        break;
      default:
        break;
    }
  }

  // When attendance has not been marked for the month, the calendar decides:
  // the weekly offs and the holidays are still paid days off.
  if (!rows.length) {
    weeklyOffDays = weekdayCount(context.year, context.month, context.weeklyOffDay);
    holidayDays = context.holidays;
  }

  const lopDays = absentDays + unpaidLeaveDays;
  const paidDays = presentDays + halfDays * 0.5 + leaveDays + holidayDays + weeklyOffDays;

  return {
    presentDays: presentDays + halfDays * 0.5,
    halfDays,
    leaveDays,
    absentDays,
    holidayDays,
    weeklyOffDays,
    overtimeHours: Math.round(overtimeHours * 100) / 100,
    paidDays: Math.round(paidDays * 100) / 100,
    lopDays: Math.round(lopDays * 100) / 100,
  };
}

/** Prorates a monthly contractual amount by the days actually payable. */
export function prorate(monthlyAmount: number, paidDays: number, calendarDays: number): number {
  if (!monthlyAmount) return 0;
  if (calendarDays <= 0) return 0;
  const ratio = Math.max(0, Math.min(1, paidDays / calendarDays));
  return Math.round(monthlyAmount * ratio * 100) / 100;
}

/**
 * PF wages: basic + DA, capped at the statutory ceiling unless the structure
 * sets its own. The cap is applied to the *wages*, not to the contribution,
 * which is what the EPF scheme does in practice for a capped establishment.
 */
export function pfWages(basic: number, da: number, ceiling: number | null | undefined): number {
  const total = Math.max(0, basic) + Math.max(0, da);
  const cap = ceiling === null || ceiling === undefined ? STATUTORY_RATES.pf.ceiling : ceiling;
  if (cap <= 0) return total;
  return Math.min(total, cap);
}

/** Rounds to the rupee the way a bank statement would. */
export function rupees(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
