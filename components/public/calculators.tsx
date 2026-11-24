'use client';

/** The "Safety & Environmental Calculation" hub, with the payroll calculators beside it. Nothing is stored or sent: it all runs in the browser. */
import { useMemo, useState } from 'react';
import {
  afr, asr, bonus, electricalPower, emissions, epf, esi, extinguishersFor, flammability, gratuity, incidentRate, ltifr, manHours, NOISE_TABLE, overtime, oxygenStatus, permissibleNoiseHours,
  pollutantLoadKgPerDay, pressure, riskMatrix, riskScore, safeWorkingLoad, safetyRates, scaffoldLoad, trir, waterBalance,
} from '@/lib/calculators';

const GROUPS = [
  { key: 'chart', label: 'Safety officer', tools: [['ltifr', 'LTIFR'], ['trir', 'TRIR'], ['afr', 'AFR'], ['asr', 'ASR'], ['incident', 'Incident rate'], ['manhours', 'Man-hours'], ['extinguisher', 'Fire extinguisher'],
    ['noise', 'Noise dose'], ['oxygen', 'Safe oxygen'], ['lel', 'LEL & UEL'], ['scaffold', 'Scaffold load'], ['power', 'Electrical power'], ['pressure', 'Pressure'], ['swl', 'Lifting SWL'], ['matrix', 'Risk matrix']] },
  { key: 'safety', label: 'Safety', tools: [['rates', 'Frequency & severity rates'], ['risk', 'Risk score']] },
  { key: 'environment', label: 'Environment', tools: [['emissions', 'Emissions (CO2e)'], ['load', 'Effluent load'], ['water', 'Water balance']] },
  { key: 'payroll', label: 'Payroll', tools: [['epf', 'EPF'], ['esi', 'ESI'], ['gratuity', 'Gratuity'], ['bonus', 'Bonus'], ['overtime', 'Overtime']] },
] as const;

const inr = (value: number) => `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const num = (value: string) => (value.trim() === '' || Number.isNaN(Number(value)) ? 0 : Number(value));
const FIELD = 'w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200';

function Field({ label, value, onChange, hint, step = 'any' }: { label: string; value: string; onChange: (v: string) => void; hint?: string; step?: string }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-ink-soft">{label}</span>
      <input type="number" inputMode="decimal" min={0} step={step} value={value} onChange={(e) => onChange(e.target.value)} className={`${FIELD} mt-1`} />
      {hint && <span className="mt-1 block text-[11px] leading-snug text-ink-muted">{hint}</span>}
    </label>
  );
}

function Result({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 border-b border-line py-2 text-sm ${strong ? 'font-semibold text-ink' : 'text-ink-soft'}`}>
      <span>{label}</span><span className="tabular-nums">{value}</span>
    </div>
  );
}

function Panel({ title, note, inputs, results }: { title: string; note?: string; inputs: React.ReactNode; results: React.ReactNode }) {
  return (
    <div className="grid gap-6 rounded-xl border border-line bg-white p-5 lg:grid-cols-2 lg:p-6">
      <div>
        <h2 className="text-lg font-bold text-ink">{title}</h2>
        {note && <p className="mt-1 text-xs leading-relaxed text-ink-muted">{note}</p>}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">{inputs}</div>
      </div>
      <div className="rounded-lg bg-surface-muted p-4" aria-live="polite">{results}</div>
    </div>
  );
}

function useFields<T extends Record<string, string>>(initial: T) {
  const [values, setValues] = useState(initial);
  return [values, (key: keyof T) => (value: string) => setValues((current) => ({ ...current, [key]: value }))] as const;
}

function Rates() {
  const [v, set] = useFields({ injuries: '3', daysLost: '45', employees: '150', hours: '8', days: '300' });
  const hours = manHours(num(v.employees), num(v.hours), num(v.days));
  const r = safetyRates({ injuries: num(v.injuries), daysLost: num(v.daysLost), manHours: hours, averageEmployees: num(v.employees) });
  return (
    <Panel title="Frequency, severity and incidence rate" note="Injury rates per million man-hours (frequency, severity) and per 1,000 employees (incidence)."
      inputs={<><Field label="Lost-time injuries" value={v.injuries} onChange={set('injuries')} /><Field label="Days lost" value={v.daysLost} onChange={set('daysLost')} />
        <Field label="Average employees" value={v.employees} onChange={set('employees')} /><Field label="Hours per day" value={v.hours} onChange={set('hours')} />
        <Field label="Days worked in the period" value={v.days} onChange={set('days')} /></>}
      results={<><Result label="Man-hours worked" value={hours.toLocaleString('en-IN')} /><Result label="Frequency rate" value={String(r.frequencyRate)} strong /><Result label="Severity rate" value={String(r.severityRate)} strong />
        <Result label="Incidence rate" value={String(r.incidenceRate)} strong /><Result label="Average days lost per injury" value={String(r.averageDaysLost)} /></>} />
  );
}

function Risk() {
  const [v, set] = useFields({ likelihood: '3', consequence: '4' });
  const r = riskScore(num(v.likelihood), num(v.consequence));
  const tone = r.level === 'Low' ? 'text-emerald-700' : r.level === 'Medium' ? 'text-amber-700' : 'text-red-700';
  return (
    <Panel title="Risk score" note="Likelihood x consequence, each 1 to 5. Bands: 1-4 low, 5-9 medium, 10-16 high, 17-25 extreme (the bands used in this platform's risk registers)."
      inputs={<><Field label="Likelihood (1-5)" value={v.likelihood} onChange={set('likelihood')} step="1" /><Field label="Consequence (1-5)" value={v.consequence} onChange={set('consequence')} step="1" /></>}
      results={<><Result label="Risk score" value={String(r.score)} strong /><div className={`py-2 text-sm font-semibold ${tone}`}>{r.level} risk</div></>} />
  );
}

function Emissions() {
  const [v, set] = useFields({ kwh: '10000', kwhF: '0.71', diesel: '500', dieselF: '2.68', lpg: '200', lpgF: '2.98' });
  const out = emissions([{ label: 'Electricity', quantity: num(v.kwh), factor: num(v.kwhF) }, { label: 'Diesel', quantity: num(v.diesel), factor: num(v.dieselF) }, { label: 'LPG', quantity: num(v.lpg), factor: num(v.lpgF) }]);
  return (
    <Panel title="Emissions from energy" note="Quantity x emission factor. The factors shown are examples: enter the current published factor for your grid and fuels."
      inputs={<><Field label="Electricity (kWh)" value={v.kwh} onChange={set('kwh')} /><Field label="Grid factor (kg CO2 per kWh)" value={v.kwhF} onChange={set('kwhF')} />
        <Field label="Diesel (litres)" value={v.diesel} onChange={set('diesel')} /><Field label="Diesel factor (kg CO2 per litre)" value={v.dieselF} onChange={set('dieselF')} />
        <Field label="LPG (kg)" value={v.lpg} onChange={set('lpg')} /><Field label="LPG factor (kg CO2 per kg)" value={v.lpgF} onChange={set('lpgF')} /></>}
      results={<>{out.lines.map((l) => <Result key={l.label} label={l.label} value={`${l.kg.toLocaleString('en-IN')} kg`} />)}<Result label="Total" value={`${out.totalTonnes.toLocaleString('en-IN')} tonnes CO2e`} strong /></>} />
  );
}

function Load() {
  const [v, set] = useFields({ flow: '250', cod: '400', bod: '150', tss: '200' });
  return (
    <Panel title="Effluent pollutant load" note="Load in kilograms a day = flow (kilolitres a day) x concentration (mg/l) / 1,000."
      inputs={<><Field label="Flow (KLD)" value={v.flow} onChange={set('flow')} /><Field label="COD (mg/l)" value={v.cod} onChange={set('cod')} /><Field label="BOD (mg/l)" value={v.bod} onChange={set('bod')} /><Field label="TSS (mg/l)" value={v.tss} onChange={set('tss')} /></>}
      results={<><Result label="COD load" value={`${pollutantLoadKgPerDay(num(v.flow), num(v.cod))} kg/day`} strong /><Result label="BOD load" value={`${pollutantLoadKgPerDay(num(v.flow), num(v.bod))} kg/day`} strong /><Result label="TSS load" value={`${pollutantLoadKgPerDay(num(v.flow), num(v.tss))} kg/day`} strong /></>} />
  );
}

function Water() {
  const [v, set] = useFields({ fresh: '80', recycled: '20', discharged: '70', units: '50' });
  const w = waterBalance({ freshKld: num(v.fresh), recycledKld: num(v.recycled), dischargedKld: num(v.discharged), unitsPerDay: num(v.units) });
  return (
    <Panel title="Water balance" note="Water used per unit of output, the recycled share, and what is not accounted for between water in and wastewater out."
      inputs={<><Field label="Fresh water (KLD)" value={v.fresh} onChange={set('fresh')} /><Field label="Recycled water (KLD)" value={v.recycled} onChange={set('recycled')} />
        <Field label="Wastewater discharged (KLD)" value={v.discharged} onChange={set('discharged')} /><Field label="Output per day (units)" value={v.units} onChange={set('units')} /></>}
      results={<><Result label="Water per unit (KL)" value={String(w.intensity)} strong /><Result label="Recycled share" value={`${w.recycledShare}%`} strong /><Result label="In, less discharged (evaporation, product, unaccounted)" value={`${w.lossOrUnaccounted} KLD`} /></>} />
  );
}

function Epf() {
  const [v, set] = useFields({ wage: '20000' });
  const r = epf(num(v.wage));
  return (
    <Panel title="EPF contribution" note="12 % of basic + DA, normally on wages up to the ceiling of 15,000 a month. The employer's 12 % is split into pension (8.33 %) and provident fund."
      inputs={<Field label="Monthly basic + DA" value={v.wage} onChange={set('wage')} />}
      results={<><Result label="Wages considered" value={inr(r.wagesConsidered)} /><Result label="Employee 12%" value={inr(r.employee)} strong /><Result label="Employer: pension (EPS)" value={inr(r.employerEps)} /><Result label="Employer: provident fund" value={inr(r.employerEpf)} /><Result label="Employer total" value={inr(r.employerTotal)} strong /></>} />
  );
}

function Esi() {
  const [v, set] = useFields({ gross: '15000' });
  const r = esi(num(v.gross));
  return (
    <Panel title="ESI contribution" note="Employee 0.75 % and employer 3.25 % of gross wages, for employees earning up to 21,000 a month. Each amount is rounded up to the next rupee."
      inputs={<Field label="Monthly gross wages" value={v.gross} onChange={set('gross')} />}
      results={r.covered ? <><Result label="Employee 0.75%" value={inr(r.employee)} strong /><Result label="Employer 3.25%" value={inr(r.employer)} strong /><Result label="Total" value={inr(r.total)} /></> : <p className="text-sm text-ink-soft">Gross wages above 21,000 a month are outside ESI coverage.</p>} />
  );
}

function Gratuity() {
  const [v, set] = useFields({ pay: '30000', years: '10', months: '0' });
  const r = gratuity(num(v.pay), num(v.years), num(v.months));
  return (
    <Panel title="Gratuity" note="Last drawn basic + DA x 15 / 26 x years of service (a part year above six months counts as a full year), after five years of continuous service, up to the statutory cap."
      inputs={<><Field label="Last drawn basic + DA (monthly)" value={v.pay} onChange={set('pay')} /><Field label="Completed years" value={v.years} onChange={set('years')} step="1" /><Field label="Extra months" value={v.months} onChange={set('months')} step="1" /></>}
      results={<><Result label="Years counted" value={String(r.yearsCounted)} /><Result label="Eligible" value={r.eligible ? 'Yes' : 'No (under five years)'} /><Result label="Gratuity" value={inr(r.amount)} strong />{r.capped && <p className="pt-2 text-xs text-ink-muted">Limited to the statutory cap.</p>}</>} />
  );
}

function Bonus() {
  const [v, set] = useFields({ wage: '20000', months: '12', ceiling: '7000', percent: '8.33' });
  const r = bonus(num(v.wage), num(v.months), { ceiling: num(v.ceiling), percent: num(v.percent) });
  return (
    <Panel title="Statutory bonus" note="Worked on the monthly wage up to the calculation ceiling (or the minimum wage, if higher), at 8.33 % to 20 %, for the months worked in the year."
      inputs={<><Field label="Monthly wage (basic + DA)" value={v.wage} onChange={set('wage')} /><Field label="Months worked" value={v.months} onChange={set('months')} step="1" />
        <Field label="Calculation ceiling" value={v.ceiling} onChange={set('ceiling')} hint="7,000 or the minimum wage, whichever is higher" /><Field label="Bonus percentage" value={v.percent} onChange={set('percent')} hint="8.33 to 20" /></>}
      results={<><Result label="Wage used" value={inr(r.wageUsed)} /><Result label="Bonus for a full year" value={inr(r.annual)} /><Result label="Bonus payable" value={inr(r.payable)} strong /></>} />
  );
}

function Overtime() {
  const [v, set] = useFields({ wage: '26000', hours: '4', days: '26', shift: '8', multiple: '2' });
  const r = overtime(num(v.wage), num(v.hours), { workingDays: num(v.days), shiftHours: num(v.shift), multiple: num(v.multiple) });
  return (
    <Panel title="Overtime" note="Hourly rate = monthly wage / working days / shift hours, paid at double wages for overtime hours."
      inputs={<><Field label="Monthly wage" value={v.wage} onChange={set('wage')} /><Field label="Overtime hours" value={v.hours} onChange={set('hours')} /><Field label="Working days a month" value={v.days} onChange={set('days')} />
        <Field label="Shift hours" value={v.shift} onChange={set('shift')} /><Field label="Rate multiple" value={v.multiple} onChange={set('multiple')} /></>}
      results={<><Result label="Normal hourly rate" value={inr(r.hourly)} /><Result label="Overtime rate per hour" value={inr(r.rate)} /><Result label="Overtime pay" value={inr(r.amount)} strong /></>} />
  );
}

/* ─────────── the safety officer's chart: the 15 calculations, each with the formula as the chart prints it ─────────── */

const Formula = ({ children }: { children: React.ReactNode }) => <p className="mb-3 rounded-lg bg-surface-muted px-3 py-2 font-mono text-xs leading-relaxed text-ink-soft sm:col-span-2">{children}</p>;

function RateTool({ title, formula, a, b, defaults, run, unit }: { title: string; formula: string; a: string; b: string; defaults: [string, string]; run: (x: number, y: number) => number; unit?: string }) {
  const [v, set] = useFields({ a: defaults[0], b: defaults[1] });
  const result = run(num(v.a), num(v.b));
  return (
    <Panel title={title} note="The formula and the example are the ones on the safety officer's chart."
      inputs={<><Formula>{formula}</Formula><Field label={a} value={v.a} onChange={set('a')} /><Field label={b} value={v.b} onChange={set('b')} /></>}
      results={<Result label={title.split(' - ')[0]} value={`${result.toLocaleString('en-IN')}${unit ?? ''}`} strong />} />
  );
}

const Ltifr = () => <RateTool title="LTIFR - Lost Time Injury Frequency Rate" formula="LTIFR = (No. of Lost Time Injuries x 1,000,000) / Total man-hours worked" a="Lost time injuries (LTI)" b="Total man-hours worked" defaults={['2', '500000']} run={ltifr} />;
const Trir = () => <RateTool title="TRIR - Total Recordable Incident Rate" formula="TRIR = (Recordable cases x 200,000) / Total man-hours worked" a="Recordable cases" b="Total man-hours worked" defaults={['5', '500000']} run={trir} />;
const Afr = () => <RateTool title="AFR - Accident Frequency Rate" formula="AFR = (Total accidents x 1,000,000) / Total man-hours worked" a="Total accidents" b="Total man-hours worked" defaults={['3', '600000']} run={afr} />;
const Asr = () => <RateTool title="ASR - Accident Severity Rate" formula="ASR = (Lost workdays x 1,000,000) / Total man-hours worked" a="Lost workdays" b="Total man-hours worked" defaults={['120', '600000']} run={asr} />;
const IncidentRate = () => <RateTool title="Incident rate" formula="Incident rate = (Incidents x 200,000) / Total employees worked" a="Incidents" b="Total employees worked" defaults={['10', '250']} run={incidentRate} />;

function ManHours() {
  const [v, set] = useFields({ employees: '100', hours: '8', days: '26' });
  return (
    <Panel title="Man-hours calculation" note="Man-hours = number of employees x working hours x working days."
      inputs={<><Formula>Man-hours = No. of employees x Working hours x Working days</Formula><Field label="Employees" value={v.employees} onChange={set('employees')} /><Field label="Hours per day" value={v.hours} onChange={set('hours')} /><Field label="Working days" value={v.days} onChange={set('days')} /></>}
      results={<Result label="Man-hours" value={manHours(num(v.employees), num(v.hours), num(v.days)).toLocaleString('en-IN')} strong />} />
  );
}

function Extinguisher() {
  const [v, set] = useFields({ area: '1000' });
  const r = extinguishersFor(num(v.area));
  return (
    <Panel title="Fire extinguisher coverage" note="One ABC fire extinguisher (6 kg) covers approximately 200 - 250 square metres, as per risk assessment and applicable standards. The count is a planning figure, not a substitute for the risk assessment."
      inputs={<Field label="Area to cover (square metres)" value={v.area} onChange={set('area')} />}
      results={<><Result label="Fewest (at 250 sq m each)" value={String(r.fewest)} strong /><Result label="Most (at 200 sq m each)" value={String(r.most)} strong /></>} />
  );
}

function Noise() {
  const [v, set] = useFields({ level: '91' });
  const level = num(v.level);
  return (
    <Panel title="Noise dose (permissible exposure)" note="The chart's table, halving the time for every 3 dB. Type any level to see the time allowed."
      inputs={<Field label="Sound level (dB)" value={v.level} onChange={set('level')} />}
      results={<>
        <Result label={`Maximum exposure at ${level || 0} dB`} value={level >= 85 ? `${permissibleNoiseHours(level)} hours` : 'above 8 hours (below 85 dB)'} strong />
        <table className="mt-3 w-full text-sm"><thead><tr className="text-left text-xs text-ink-muted"><th className="py-1 font-semibold">Sound level (dB)</th><th className="py-1 font-semibold">Maximum exposure time</th></tr></thead>
          <tbody>{NOISE_TABLE.map((row) => <tr key={row.level} className="border-t border-line"><td className="py-1.5">{row.level} dB</td><td className="py-1.5">{row.hours} {row.hours === 1 ? 'Hour' : 'Hours'}</td></tr>)}</tbody></table>
      </>} />
  );
}

function Oxygen() {
  const [v, set] = useFields({ oxygen: '20.9' });
  const status = oxygenStatus(num(v.oxygen));
  return (
    <Panel title="Safe oxygen level (confined space)" note="Safe oxygen level is 19.5 % - 23.5 %. Below 19.5 % the air is oxygen deficient; above 23.5 % it is a fire risk."
      inputs={<Field label="Oxygen reading (%)" value={v.oxygen} onChange={set('oxygen')} />}
      results={<div className={`py-2 text-base font-bold ${status === 'Safe' ? 'text-emerald-700' : 'text-red-700'}`}>{status}</div>} />
  );
}

function Lel() {
  const [v, set] = useFields({ reading: '0.4', lel: '5', uel: '15' });
  const r = flammability(num(v.reading), num(v.lel), num(v.uel));
  return (
    <Panel title="LEL and UEL (flammable gas)" note="LEL is the lowest concentration that can ignite, UEL the highest. Between them is the flammable range. Safe practice: the gas level should be below 10 % of the LEL before a Hot Work Permit is issued. Use the LEL and UEL of your own gas from its safety data sheet."
      inputs={<><Field label="Gas reading (% by volume)" value={v.reading} onChange={set('reading')} /><Field label="LEL of the gas (%)" value={v.lel} onChange={set('lel')} /><Field label="UEL of the gas (%)" value={v.uel} onChange={set('uel')} /></>}
      results={<><Result label="Where the reading sits" value={r.zone} strong /><Result label="Reading as a share of the LEL" value={`${r.percentOfLel} %`} />
        <div className={`py-2 text-sm font-semibold ${r.hotWorkAllowed ? 'text-emerald-700' : 'text-red-700'}`}>{r.hotWorkAllowed ? 'Below 10 % of the LEL: acceptable for a Hot Work Permit.' : 'At or above 10 % of the LEL: do not issue a Hot Work Permit.'}</div></>} />
  );
}

function Scaffold() {
  const [v, set] = useFields({ dead: '500', live: '1500', wind: '300' });
  const r = scaffoldLoad(num(v.dead), num(v.live), num(v.wind));
  return (
    <Panel title="Scaffold load calculation" note="Total load = dead load + live load + wind load."
      inputs={<><Formula>Total load = Dead load + Live load + Wind load</Formula><Field label="Dead load (kg)" value={v.dead} onChange={set('dead')} /><Field label="Live load (kg)" value={v.live} onChange={set('live')} /><Field label="Wind load (kg)" value={v.wind} onChange={set('wind')} /></>}
      results={<><Result label="Total load" value={`${r.kg.toLocaleString('en-IN')} kg`} strong /><Result label="In tonnes" value={`${r.tonnes} ton`} /></>} />
  );
}

function Power() {
  const [v, set] = useFields({ volts: '230', amps: '10' });
  const r = electricalPower(num(v.volts), num(v.amps));
  return (
    <Panel title="Electrical power" note="Power (P) = Voltage (V) x Current (I)."
      inputs={<><Formula>P = V x I</Formula><Field label="Voltage (V)" value={v.volts} onChange={set('volts')} /><Field label="Current (A)" value={v.amps} onChange={set('amps')} /></>}
      results={<><Result label="Power" value={`${r.watts.toLocaleString('en-IN')} W`} strong /><Result label="In kilowatts" value={`${r.kilowatts} kW`} /></>} />
  );
}

function PressureTool() {
  const [v, set] = useFields({ force: '1000', area: '2' });
  return (
    <Panel title="Pressure calculation" note="Pressure (P) = Force (F) / Area (A). Unit: pascal (Pa) = N per square metre."
      inputs={<><Formula>P = F / A</Formula><Field label="Force (N)" value={v.force} onChange={set('force')} /><Field label="Area (square metres)" value={v.area} onChange={set('area')} /></>}
      results={<Result label="Pressure" value={`${pressure(num(v.force), num(v.area)).toLocaleString('en-IN')} Pa`} strong />} />
  );
}

function Swl() {
  const [v, set] = useFields({ breaking: '10', fos: '5' });
  return (
    <Panel title="Lifting load check (SWL)" note="Safe working load (SWL) = breaking load / factor of safety (FOS). Keep the load at or below the SWL."
      inputs={<><Formula>SWL = Breaking load / Factor of safety (FOS)</Formula><Field label="Breaking load (ton)" value={v.breaking} onChange={set('breaking')} /><Field label="Factor of safety (FOS)" value={v.fos} onChange={set('fos')} /></>}
      results={<Result label="Safe working load" value={`${safeWorkingLoad(num(v.breaking), num(v.fos))} ton`} strong />} />
  );
}

const MATRIX_TONE: Record<string, string> = { Low: 'bg-emerald-200 text-emerald-950', Medium: 'bg-yellow-200 text-yellow-950', High: 'bg-orange-300 text-orange-950', Extreme: 'bg-red-400 text-red-950' };

function Matrix() {
  const [v, set] = useFields({ likelihood: '4', severity: '5' });
  const r = riskScore(num(v.likelihood), num(v.severity));
  return (
    <Panel title="Risk rating matrix" note="Risk score = likelihood x severity, each 1 to 5 (likelihood 5 = almost certain, severity 5 = catastrophic). Bands: 1-4 low, 5-9 medium, 10-16 high, 17-25 extreme, the bands this platform's risk registers use."
      inputs={<><Formula>Risk score = Likelihood x Severity</Formula><Field label="Likelihood (1-5)" value={v.likelihood} onChange={set('likelihood')} step="1" /><Field label="Severity (1-5)" value={v.severity} onChange={set('severity')} step="1" /></>}
      results={<>
        <Result label="Risk score" value={String(r.score)} strong /><Result label="Band" value={`${r.level} risk`} strong />
        <table className="mt-3 w-full table-fixed border-separate border-spacing-1 text-center text-sm" aria-label="Risk matrix: likelihood down, severity across">
          <thead><tr><th className="text-[11px] font-semibold text-ink-muted">L \ S</th>{[1, 2, 3, 4, 5].map((s) => <th key={s} className="text-[11px] font-semibold text-ink-muted">{s}</th>)}</tr></thead>
          <tbody>{riskMatrix().map((row) => (
            <tr key={row.likelihood}><th className="text-[11px] font-semibold text-ink-muted">{row.likelihood}</th>{row.cells.map((cell) => (
              <td key={cell.severity} className={`rounded py-1.5 font-semibold ${MATRIX_TONE[cell.level]} ${cell.severity === num(v.severity) && row.likelihood === num(v.likelihood) ? 'ring-2 ring-ink' : ''}`}>{cell.score}</td>))}</tr>))}</tbody>
        </table>
      </>} />
  );
}

const VIEWS: Record<string, () => React.JSX.Element> = { ltifr: Ltifr, trir: Trir, afr: Afr, asr: Asr, incident: IncidentRate, manhours: ManHours, extinguisher: Extinguisher, noise: Noise, oxygen: Oxygen, lel: Lel, scaffold: Scaffold, power: Power, pressure: PressureTool, swl: Swl, matrix: Matrix, rates: Rates, risk: Risk, emissions: Emissions, load: Load, water: Water, epf: Epf, esi: Esi, gratuity: Gratuity, bonus: Bonus, overtime: Overtime };

export function Calculators({ initial = 'ltifr' }: { initial?: string }) {
  const [tool, setTool] = useState(VIEWS[initial] ? initial : 'ltifr');
  const View = VIEWS[tool];
  const group = useMemo(() => GROUPS.find((g) => g.tools.some(([key]) => key === tool)), [tool]);
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        {GROUPS.map((g) => (
          <div key={g.key} className="flex flex-wrap items-center gap-2">
            <span className={`w-28 text-xs font-bold uppercase tracking-wide ${group?.key === g.key ? 'text-brand-600' : 'text-ink-muted'}`}>{g.label}</span>
            {g.tools.map(([key, label]) => (
              <button key={key} type="button" onClick={() => setTool(key)} aria-pressed={tool === key}
                className={`rounded-full border px-4 py-1.5 text-xs font-semibold transition-colors ${tool === key ? 'border-brand-500 bg-brand-600 text-white' : 'border-line bg-white text-ink-soft hover:bg-surface-muted'}`}>{label}</button>
            ))}
          </div>
        ))}
      </div>
      <View />
      <p className="text-xs leading-relaxed text-ink-muted">These are estimates for planning. Statutory rates and ceilings are revised by notification, so check the current figure before you rely on a result, and take advice for a specific case. Nothing you type here is saved or sent.</p>
    </div>
  );
}
