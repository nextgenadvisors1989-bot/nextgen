/**
 * Calculation helpers of Data Management: the formula evaluator, the entry validator and the daily / weekly / monthly / annual roll-ups.
 * Pure functions with no database access, so the browser (live preview of calculated fields) and the server (the authoritative values) use the same code.
 */
import { aggOf, type FieldDef, type RegisterDef } from './registers';

export type Values = Record<string, unknown>;

/* ───────────────────────────── formula evaluator ───────────────────────────── */

type Token = { t: 'num'; v: number } | { t: 'id'; v: string } | { t: 'op'; v: string };

function tokenize(formula: string): Token[] {
  const tokens: Token[] = [];
  const pattern = /\s*(?:(\d+(?:\.\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|([+\-*/()]))/y;
  let index = 0;
  while (index < formula.length) {
    pattern.lastIndex = index;
    const match = pattern.exec(formula);
    if (!match) throw new Error(`Bad formula near "${formula.slice(index, index + 10)}"`);
    index = pattern.lastIndex;
    if (match[1] !== undefined) tokens.push({ t: 'num', v: Number(match[1]) });
    else if (match[2] !== undefined) tokens.push({ t: 'id', v: match[2] });
    else tokens.push({ t: 'op', v: match[3] });
  }
  return tokens;
}

/** Evaluates `a - b`, `(x - y) / x * 100` ... over the numbers in `values`. Returns null when any field it uses is blank or the result is not a finite number. */
export function evalFormula(formula: string, values: Values): number | null {
  const tokens = tokenize(formula);
  let position = 0;
  let missing = false;
  const peek = () => tokens[position];
  const take = () => tokens[position++];

  const primary = (): number => {
    const token = take();
    if (!token) throw new Error('Formula ends too early');
    if (token.t === 'num') return token.v;
    if (token.t === 'id') {
      const raw = values[token.v];
      const value = raw === '' || raw === null || raw === undefined ? NaN : Number(raw);
      if (!Number.isFinite(value)) { missing = true; return 0; }
      return value;
    }
    if (token.v === '(') { const inner = sum(); const close = take(); if (!close || close.v !== ')') throw new Error('Missing )'); return inner; }
    if (token.v === '-') return -primary();
    throw new Error(`Unexpected ${token.v}`);
  };
  const product = (): number => {
    let left = primary();
    while (peek() && peek().t === 'op' && (peek().v === '*' || peek().v === '/')) {
      const op = take().v;
      const right = primary();
      if (op === '/' && right === 0) { missing = true; left = 0; } else left = op === '*' ? left * right : left / right;
    }
    return left;
  };
  const sum = (): number => {
    let left = product();
    while (peek() && peek().t === 'op' && (peek().v === '+' || peek().v === '-')) {
      const op = take().v;
      const right = product();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  };
  const result = sum();
  if (position < tokens.length) throw new Error('Unexpected text at the end of the formula');
  return missing || !Number.isFinite(result) ? null : Math.round(result * 10000) / 10000;
}

/** The fields a formula reads. */
export function formulaInputs(formula: string): string[] {
  return tokenize(formula).filter((token): token is { t: 'id'; v: string } => token.t === 'id').map((token) => token.v);
}

/** The values a formula reads: what was entered, with an optional quantity left empty counted as 0 (see FieldDef.zero). */
export function withZeros(register: RegisterDef, values: Values): Values {
  const base: Values = { ...values };
  for (const field of register.fields) {
    if (field.zero && (base[field.key] === undefined || base[field.key] === null || base[field.key] === '')) base[field.key] = 0;
  }
  return base;
}

/** Fills every calculated field of the register from the other values (in the order the register lists them, so one calc can use an earlier one). */
export function applyCalcs(register: RegisterDef, values: Values): Values {
  const out: Values = { ...values };
  for (const field of register.fields) {
    if (field.type !== 'calc' || !field.formula) continue;
    const value = evalFormula(field.formula, withZeros(register, out));
    if (value === null) delete out[field.key]; else out[field.key] = value;
  }
  return out;
}

/* ───────────────────────────── validation ───────────────────────────── */

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Fields that may legitimately be negative (a transfer out of stock, a fall in storage). */
const SIGNED = new Set(['adjustment', 'storage_change_kl', 'accumulation_kg']);

export function isRealDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export interface Issue { field: string; message: string }

/** Cleans what was sent for one record: keeps only the register's fields, converts numbers, checks options, dates and required fields, then calculates. */
export function cleanValues(register: RegisterDef, input: Values, efCodes?: ReadonlySet<string>): { values: Values; issues: Issue[] } {
  const values: Values = {};
  const issues: Issue[] = [];
  for (const field of register.fields) {
    if (field.type === 'calc') continue;
    const raw = input[field.key];
    const blank = raw === undefined || raw === null || String(raw).trim() === '';
    if (blank && field.key === 'multiplier') { values.multiplier = 1; continue; }
    if (blank) {
      if (field.required) issues.push({ field: field.key, message: `${field.label} is needed` });
      continue;
    }
    if (field.type === 'number') {
      const value = Number(String(raw).replace(/,/g, ''));
      if (!Number.isFinite(value)) { issues.push({ field: field.key, message: `${field.label} must be a number` }); continue; }
      if (value < 0 && !SIGNED.has(field.key)) { issues.push({ field: field.key, message: `${field.label} cannot be negative` }); continue; }
      if (Math.abs(value) > 1e12) { issues.push({ field: field.key, message: `${field.label} is too large` }); continue; }
      values[field.key] = Math.round(value * 10000) / 10000;
    } else if (field.type === 'date') {
      const value = String(raw).slice(0, 10);
      if (!isRealDate(value)) { issues.push({ field: field.key, message: `${field.label} must be a date` }); continue; }
      values[field.key] = value;
    } else if (field.type === 'select') {
      const value = String(raw).trim();
      if (field.dynamic === 'ef') {
        if (efCodes && !efCodes.has(value)) { issues.push({ field: field.key, message: `${field.label}: “${value.slice(0, 40)}” is not in the emission-factor register` }); continue; }
      } else if (!field.options?.includes(value)) { issues.push({ field: field.key, message: `${field.label}: choose one of the list` }); continue; }
      values[field.key] = value;
    } else {
      const value = String(raw).replace(/\s+\n/g, '\n').trim();
      values[field.key] = value.slice(0, field.type === 'textarea' ? 2000 : 200);
    }
  }
  const calculated = applyCalcs(register, values);
  // Internal consistency: a closing reading below the opening one, a tare above the gross weight, a physical count that is not a number ...
  for (const field of register.fields) {
    if (field.type !== 'calc') continue;
    const value = calculated[field.key];
    if (typeof value === 'number' && value < 0 && !/variance|diff|storage_change|adjust/.test(field.key)) {
      const reason = field.formula ? formulaInputs(field.formula).filter((key) => key in values).join(' / ') : '';
      issues.push({ field: field.key, message: `${field.label} comes out negative (${value}); check ${reason || 'the figures entered'}` });
    }
  }
  return { values: calculated, issues };
}

/* ───────────────────────────── periods ───────────────────────────── */

export type Granularity = 'day' | 'week' | 'month' | 'year';

const pad = (n: number) => String(n).padStart(2, '0');
export const isoOf = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const parse = (iso: string) => new Date(`${iso}T00:00:00Z`);
const addDays = (iso: string, days: number) => { const d = parse(iso); d.setUTCDate(d.getUTCDate() + days); return isoOf(d); };

/** The financial year (April - March) of a date: its first year, e.g. 2026 for 14 Nov 2026 and for 20 Feb 2027. */
export function fyStartYear(iso: string): number {
  const [y, m] = iso.split('-').map(Number);
  return m >= 4 ? y : y - 1;
}
export const fyLabel = (startYear: number) => `FY ${startYear}-${String(startYear + 1).slice(2)}`;
export const fyRange = (startYear: number) => ({ from: `${startYear}-04-01`, to: `${startYear + 1}-03-31` });

/** Monday of the week of a date (weeks run Monday to Sunday). */
export function weekStart(iso: string): string {
  const d = parse(iso);
  const dow = (d.getUTCDay() + 6) % 7;
  return addDays(iso, -dow);
}

export function bucketOf(iso: string, g: Granularity): { key: string; label: string } {
  if (g === 'day') return { key: iso, label: iso };
  if (g === 'week') { const s = weekStart(iso); return { key: s, label: `Week of ${s}` }; }
  if (g === 'month') return { key: iso.slice(0, 7), label: iso.slice(0, 7) };
  const fy = fyStartYear(iso);
  return { key: String(fy), label: fyLabel(fy) };
}

/* ───────────────────────────── roll-ups ───────────────────────────── */

export interface RollRow { id: number; entry_date: string; data: Values }
export interface Bucket { key: string; label: string; count: number; values: Record<string, number | null> }

/** Totals the numeric fields of a register's records for each period; calculated fields are re-worked from the totals (so percentages are weighted, not averaged). */
export function rollup(register: RegisterDef, rows: RollRow[], granularity: Granularity): Bucket[] {
  const groups = new Map<string, { label: string; rows: RollRow[] }>();
  for (const row of rows) {
    const b = bucketOf(row.entry_date, granularity);
    const group = groups.get(b.key) ?? { label: b.label, rows: [] };
    group.rows.push(row);
    groups.set(b.key, group);
  }
  const buckets: Bucket[] = [];
  for (const [key, group] of [...groups.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    buckets.push({ key, label: group.label, count: group.rows.length, values: totals(register, group.rows) });
  }
  return buckets;
}

/** One total per field over a set of records. */
export function totals(register: RegisterDef, rows: RollRow[]): Record<string, number | null> {
  const ordered = [...rows].sort((a, b) => (a.entry_date === b.entry_date ? a.id - b.id : a.entry_date < b.entry_date ? -1 : 1));
  const out: Record<string, number | null> = {};
  for (const field of register.fields) {
    if (field.type === 'calc') continue;
    out[field.key] = combine(field, ordered);
  }
  for (const field of register.fields) {
    if (field.type !== 'calc' || !field.formula) continue;
    out[field.key] = evalFormula(field.formula, withZeros(register, out));
  }
  return out;
}

function combine(field: FieldDef, ordered: RollRow[]): number | null {
  if (field.type !== 'number') return null;
  const mode = aggOf(field);
  const nums = ordered.map((row) => row.data[field.key]).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (!nums.length || mode === 'none') return null;
  if (mode === 'sum') return round(nums.reduce((a, b) => a + b, 0));
  if (mode === 'avg') return round(nums.reduce((a, b) => a + b, 0) / nums.length);
  if (mode === 'max') return Math.max(...nums);
  return nums[nums.length - 1];
}

const round = (n: number) => Math.round(n * 10000) / 10000;

/* ───────────────────────────── units ───────────────────────────── */

/** A quantity in kg, or null when its unit of measure is not a mass (litres, Nos. ... cannot be added to kilograms). */
export function toKg(quantity: unknown, uom: unknown): number | null {
  const q = Number(quantity);
  if (!Number.isFinite(q)) return null;
  if (uom === 'MT') return q * 1000;
  if (uom === 'kg' || uom === undefined || uom === null || uom === '') return q;
  return null;
}
