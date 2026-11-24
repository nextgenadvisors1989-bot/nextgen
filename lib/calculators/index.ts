/**
 * The public calculators: payroll statutes, safety performance rates and environmental quantities. Pure functions, unit-tested by
 * `npx tsx scripts/test-calculators.ts`. Every statutory ceiling and rate is an argument with the usual value as its default, because they
 * are revised by notification: the page shows them as editable inputs and says so, and the results are estimates, not legal advice.
 */
const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/* ───────────────────────────── payroll ───────────────────────────── */

export interface EpfResult { wagesConsidered: number; employee: number; employerEpf: number; employerEps: number; employerTotal: number }

/** Employee 12 %; employer 12 % split 8.33 % pension (EPS, on at most the ceiling) and the rest provident fund. */
export function epf(wages: number, options: { ceiling?: number; onActualWage?: boolean; rate?: number } = {}): EpfResult {
  const ceiling = options.ceiling ?? 15000;
  const rate = options.rate ?? 12;
  const considered = options.onActualWage ? wages : Math.min(wages, ceiling);
  const employee = Math.round((considered * rate) / 100);
  const eps = Math.round((Math.min(wages, ceiling) * 8.33) / 100);
  const employerEpf = Math.max(0, Math.round((considered * rate) / 100) - eps);
  return { wagesConsidered: considered, employee, employerEpf, employerEps: eps, employerTotal: employerEpf + eps };
}

export interface EsiResult { covered: boolean; employee: number; employer: number; total: number }

/** ESI applies up to a gross wage ceiling; each contribution is rounded up to the next rupee. */
export function esi(gross: number, options: { ceiling?: number; employeeRate?: number; employerRate?: number } = {}): EsiResult {
  const ceiling = options.ceiling ?? 21000;
  if (!(gross > 0) || gross > ceiling) return { covered: false, employee: 0, employer: 0, total: 0 };
  const employee = Math.ceil(((gross * (options.employeeRate ?? 0.75)) / 100) - 1e-9);
  const employer = Math.ceil(((gross * (options.employerRate ?? 3.25)) / 100) - 1e-9);
  return { covered: true, employee, employer, total: employee + employer };
}

export interface GratuityResult { eligible: boolean; yearsCounted: number; amount: number; capped: boolean; formula: string }

/** Last drawn basic + DA x 15 / 26 x completed years, a part of a year above six months counting as a full year, up to the statutory cap. */
export function gratuity(lastDrawn: number, years: number, months: number, options: { cap?: number; minYears?: number } = {}): GratuityResult {
  const cap = options.cap ?? 2000000;
  const minYears = options.minYears ?? 5;
  const counted = years + (months > 6 ? 1 : 0);
  const eligible = years + months / 12 >= minYears - 1e-9 && counted >= minYears;
  const raw = Math.round((lastDrawn * 15 * counted) / 26);
  const amount = eligible ? Math.min(raw, cap) : 0;
  return { eligible, yearsCounted: counted, amount, capped: eligible && raw > cap, formula: `${lastDrawn} x 15 / 26 x ${counted}` };
}

export interface BonusResult { wageUsed: number; annual: number; payable: number }

/** Bonus is worked on the monthly wage up to a calculation ceiling (or the minimum wage, if higher), at 8.33 % to 20 %, for the months worked. */
export function bonus(monthlyWage: number, monthsWorked: number, options: { ceiling?: number; percent?: number } = {}): BonusResult {
  const wageUsed = Math.min(monthlyWage, options.ceiling ?? 7000);
  const percent = Math.min(20, Math.max(8.33, options.percent ?? 8.33));
  const annual = round2(wageUsed * 12 * (percent / 100));
  return { wageUsed, annual, payable: round2((annual * Math.min(12, Math.max(0, monthsWorked))) / 12) };
}

/** Overtime at the given multiple (double wages by default) of the hourly rate: monthly wage / working days / shift hours. */
export function overtime(monthlyWage: number, hours: number, options: { workingDays?: number; shiftHours?: number; multiple?: number } = {}): { hourly: number; rate: number; amount: number } {
  const hourly = monthlyWage / (options.workingDays ?? 26) / (options.shiftHours ?? 8);
  const rate = hourly * (options.multiple ?? 2);
  return { hourly: round2(hourly), rate: round2(rate), amount: round2(rate * hours) };
}

/* ───────────────────────────── safety ───────────────────────────── */

export interface SafetyRates { manHours: number; frequencyRate: number; severityRate: number; incidenceRate: number; averageDaysLost: number }

/** Frequency rate = injuries per million man-hours; severity rate = days lost per million man-hours; incidence rate = injuries per 1,000 employees. */
export function safetyRates(input: { injuries: number; daysLost: number; manHours: number; averageEmployees: number }): SafetyRates {
  const { injuries, daysLost, manHours, averageEmployees } = input;
  return {
    manHours,
    frequencyRate: manHours > 0 ? round2((injuries * 1000000) / manHours) : 0,
    severityRate: manHours > 0 ? round2((daysLost * 1000000) / manHours) : 0,
    incidenceRate: averageEmployees > 0 ? round2((injuries * 1000) / averageEmployees) : 0,
    averageDaysLost: injuries > 0 ? round2(daysLost / injuries) : 0,
  };
}

export const manHours = (employees: number, hoursPerDay: number, daysWorked: number) => Math.round(employees * hoursPerDay * daysWorked);

/** Risk score from a likelihood and a consequence, each 1 to 5, banded the way the platform's risk registers band it. */
export function riskScore(likelihood: number, consequence: number): { score: number; level: 'Low' | 'Medium' | 'High' | 'Extreme' } {
  const score = Math.max(1, Math.min(5, likelihood)) * Math.max(1, Math.min(5, consequence));
  return { score, level: score <= 4 ? 'Low' : score <= 9 ? 'Medium' : score <= 16 ? 'High' : 'Extreme' };
}

/* ─────────── the safety officer's chart ("Safety Calculations as Safety Officer", client's file, 2026-11-14) ───────────
 * The 15 calculations as the chart prints them, each with the chart's own example in scripts/test-calculators.ts. The chart's multipliers are used as printed
 * (LTIFR and AFR per 1,000,000 man-hours, TRIR and the incident rate per 200,000), so a result can be checked against the chart line by line. */

const rate = (count: number, base: number, per: number) => (base > 0 ? round2((count * per) / base) : 0);

/** LTIFR = lost-time injuries x 1,000,000 / total man-hours worked. */
export const ltifr = (lostTimeInjuries: number, hoursWorked: number) => rate(lostTimeInjuries, hoursWorked, 1000000);
/** TRIR = recordable cases x 200,000 / total man-hours worked. */
export const trir = (recordableCases: number, hoursWorked: number) => rate(recordableCases, hoursWorked, 200000);
/** AFR = total accidents x 1,000,000 / total man-hours worked. */
export const afr = (accidents: number, hoursWorked: number) => rate(accidents, hoursWorked, 1000000);
/** ASR = lost workdays x 1,000,000 / total man-hours worked. */
export const asr = (lostWorkdays: number, hoursWorked: number) => rate(lostWorkdays, hoursWorked, 1000000);
/** Incident rate = incidents x 200,000 / total employees worked, as the chart prints it. */
export const incidentRate = (incidents: number, employees: number) => rate(incidents, employees, 200000);

/** One ABC extinguisher (6 kg) covers about 200 - 250 square metres, "as per risk assessment and applicable standards": the fewest and the most to plan for. */
export function extinguishersFor(areaSqm: number): { fewest: number; most: number } {
  if (!(areaSqm > 0)) return { fewest: 0, most: 0 };
  return { fewest: Math.ceil(areaSqm / 250), most: Math.ceil(areaSqm / 200) };
}

/** The chart's table of permissible exposure: 85 dB 8 hours, 88 dB 4, 91 dB 2, 94 dB 1 (halved for every 3 dB). */
export const NOISE_TABLE: { level: number; hours: number }[] = [{ level: 85, hours: 8 }, { level: 88, hours: 4 }, { level: 91, hours: 2 }, { level: 94, hours: 1 }];
export const permissibleNoiseHours = (level: number) => round2(8 / Math.pow(2, (level - 85) / 3));

/** Safe oxygen in a confined space is 19.5 % - 23.5 %: below is oxygen deficient, above is a fire risk. */
export function oxygenStatus(percent: number): 'Oxygen deficient' | 'Safe' | 'Fire risk' {
  return percent < 19.5 ? 'Oxygen deficient' : percent > 23.5 ? 'Fire risk' : 'Safe';
}

/** Where a gas reading sits against its explosive limits; hot work needs the gas level below 10 % of the LEL before a permit is issued. */
export function flammability(readingPercent: number, lel: number, uel: number): { zone: 'Below LEL - too lean' | 'LEL to UEL - flammable range' | 'Above UEL - too rich'; percentOfLel: number; hotWorkAllowed: boolean } {
  const zone = readingPercent < lel ? 'Below LEL - too lean' : readingPercent > uel ? 'Above UEL - too rich' : 'LEL to UEL - flammable range';
  const percentOfLel = lel > 0 ? round2((readingPercent / lel) * 100) : 0;
  return { zone, percentOfLel, hotWorkAllowed: percentOfLel < 10 };
}

/** Scaffold load = dead load + live load + wind load (kg), and the same in tonnes. */
export const scaffoldLoad = (dead: number, live: number, wind: number) => ({ kg: round2(dead + live + wind), tonnes: round2((dead + live + wind) / 1000) });
/** Electrical power P = V x I (watts), and in kilowatts. */
export const electricalPower = (volts: number, amps: number) => ({ watts: round2(volts * amps), kilowatts: round2((volts * amps) / 1000) });
/** Pressure P = F / A in pascals (N per square metre). */
export const pressure = (forceN: number, areaSqm: number) => (areaSqm > 0 ? round2(forceN / areaSqm) : 0);
/** Safe working load SWL = breaking load / factor of safety. */
export const safeWorkingLoad = (breakingLoad: number, factorOfSafety: number) => (factorOfSafety > 0 ? round2(breakingLoad / factorOfSafety) : 0);

/** The 5 x 5 matrix of the chart: risk score = likelihood x severity, with the colour band of each square (likelihood 5 at the top, 1 at the bottom). */
export function riskMatrix(): { likelihood: number; cells: { severity: number; score: number; level: 'Low' | 'Medium' | 'High' | 'Extreme' }[] }[] {
  return [5, 4, 3, 2, 1].map((likelihood) => ({ likelihood, cells: [1, 2, 3, 4, 5].map((severity) => ({ severity, ...riskScore(likelihood, severity) })) }));
}

/* ───────────────────────────── environment ───────────────────────────── */

export interface EmissionLine { label: string; quantity: number; factor: number; kg: number }

/** Emissions are quantity x emission factor. The factors are inputs: use the current published factor for your grid and fuel. */
export function emissions(lines: { label: string; quantity: number; factor: number }[]): { lines: EmissionLine[]; totalKg: number; totalTonnes: number } {
  const done = lines.map((line) => ({ ...line, kg: round2(line.quantity * line.factor) }));
  const totalKg = round2(done.reduce((sum, line) => sum + line.kg, 0));
  return { lines: done, totalKg, totalTonnes: round2(totalKg / 1000) };
}

/** Pollutant load in kilograms a day from a flow in kilolitres a day and a concentration in mg/l (1 KLD = 1,000 l, 1,000,000 mg = 1 kg). */
export const pollutantLoadKgPerDay = (flowKld: number, concentrationMgPerL: number) => round2((flowKld * concentrationMgPerL) / 1000);

export interface WaterBalance { intensity: number; recycledShare: number; freshWater: number; lossOrUnaccounted: number }

/** Water per unit of output, the recycled share and what is not accounted for (freshwater in, less wastewater out, less recycled). */
export function waterBalance(input: { freshKld: number; recycledKld: number; dischargedKld: number; unitsPerDay: number }): WaterBalance {
  const total = input.freshKld + input.recycledKld;
  return {
    intensity: input.unitsPerDay > 0 ? round2(total / input.unitsPerDay) : 0,
    recycledShare: total > 0 ? round2((input.recycledKld / total) * 100) : 0,
    freshWater: input.freshKld,
    lossOrUnaccounted: round2(total - input.dischargedKld),
  };
}
