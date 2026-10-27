/**
 * Runtime rules for dynamic forms — the single place where a form's structure is
 * interpreted. The renderer, the draft saver and the submitter all call in here,
 * so a value that is accepted in the browser is accepted by the API and vice
 * versa (the server is still the authority: it re-runs every rule on submit).
 *
 * Rules implemented:
 *   • conditional logic — show / hide / require / disable, driven by other answers
 *     (`conditional_json`, evaluated against the *visible* values only)
 *   • value coercion + validation per field type (required, length, range, regex,
 *     e-mail / phone / url / date formats, file counts, option membership)
 *   • formulas — `formula` fields and `formula` table columns, evaluated through
 *     the safe evaluator in `lib/utils/formula.ts` (never `eval`)
 *   • scoring — option scores, `max_score` on numeric/rating fields and
 *     `max_per_row` on table columns, rolled into the submission score
 */
import { evaluateFormula, compileFormula, FormulaError } from '@/lib/utils/formula';
import type {
  ConditionalLogic, DynamicFormSection, DynamicFormField, DynamicTable, DynamicTableColumn, FieldOption,
} from '@/types/dynamic-module';

export interface StructureSection extends DynamicFormSection {
  fields: StructureField[];
  tables: StructureTable[];
}
export interface StructureField extends DynamicFormField {
  options: FieldOption[];
}
export interface StructureTable extends DynamicTable {
  columns: DynamicTableColumn[];
}
export interface FormStructure {
  sections: StructureSection[];
  /** Every active field, ordered — the renderer and the validator use this. */
  fields: StructureField[];
  tables: StructureTable[];
  requiresSignature: boolean;
  requiresAttachments: boolean;
  layoutColumns: number;
}

export type ValueMap = Record<string, unknown>;
export type TableRowMap = Record<string, Record<string, unknown>[]>;

export interface FieldIssue {
  field: string;
  message: string;
}

/** Types that never carry an answer (used for checklist gating and PDF output). */
export const DECORATIVE_TYPES = new Set(['heading', 'paragraph', 'divider']);
const MULTI_TYPES = new Set(['multi_select', 'multi_file']);
const NUMERIC_TYPES = new Set(['number', 'decimal', 'currency', 'rating', 'formula', 'auto_number']);

export function isMultiValue(field: { field_type: string }) {
  return MULTI_TYPES.has(field.field_type);
}

/* ──────────────────────────────── options ──────────────────────────────── */

export function fieldOptions(field: StructureField): FieldOption[] {
  const inline = field.options_json ?? [];
  const rows = field.options ?? [];
  const source = rows.length ? rows.map((o) => ({
    option_key: o.option_key,
    option_label: o.option_label,
    option_label_ta: o.option_label_ta ?? null,
    option_value: o.option_value ?? null,
    color: o.color ?? null,
    score: o.score ?? null,
    is_default: Boolean(o.is_default),
  })) : inline;
  return source.filter((o) => o && o.option_key);
}

export function defaultValues(structure: FormStructure): ValueMap {
  const values: ValueMap = {};
  for (const field of structure.fields) {
    if (isMultiValue(field)) {
      const defaults = fieldOptions(field).filter((o) => o.is_default).map((o) => o.option_key);
      if (defaults.length) values[field.field_key] = defaults;
      continue;
    }
    if (field.default_value !== null && field.default_value !== undefined && field.default_value !== '') {
      values[field.field_key] = field.default_value;
      continue;
    }
    const option = fieldOptions(field).find((o) => o.is_default);
    if (option && ['select', 'radio'].includes(field.field_type)) values[field.field_key] = option.option_key;
    if (field.field_type === 'switch' || field.field_type === 'checkbox') values[field.field_key] = false;
  }
  return values;
}

/* ────────────────────────────── conditions ─────────────────────────────── */

function matchesRule(rule: ConditionalLogic['rules'][number], values: ValueMap): boolean {
  const raw = values[rule.field_key];
  const left = raw === undefined || raw === null ? '' : raw;
  const right = rule.value ?? '';
  switch (rule.operator) {
    case 'equals':
      return Array.isArray(left) ? left.map(String).includes(right) : String(left) === String(right);
    case 'not_equals':
      return Array.isArray(left) ? !left.map(String).includes(right) : String(left) !== String(right);
    case 'contains':
      return Array.isArray(left) ? left.map(String).some((v) => v.includes(right)) : String(left).includes(right);
    case 'gt':
      return Number(left) > Number(right);
    case 'lt':
      return Number(left) < Number(right);
    case 'is_empty':
      return Array.isArray(left) ? left.length === 0 : left === '' || left === false || left === null;
    case 'is_not_empty':
      return Array.isArray(left) ? left.length > 0 : left !== '' && left !== false && left !== null;
    default:
      return true;
  }
}

/** Does the conditional rule set hold for these answers? No rules ⇒ always true. */
export function evaluateConditions(logic: ConditionalLogic | null | undefined, values: ValueMap): boolean {
  if (!logic || !logic.rules || logic.rules.length === 0) return true;
  const results = logic.rules.map((rule) => matchesRule(rule, values));
  return logic.match === 'any' ? results.some(Boolean) : results.every(Boolean);
}

export interface FieldState {
  visible: boolean;
  required: boolean;
  disabled: boolean;
}

/**
 * Resolves what a field should do given the answers so far. Conditions are
 * evaluated against the values of *visible* fields only, so a hidden field can
 * never keep another one alive.
 */
export function fieldState(field: StructureField, values: ValueMap): FieldState {
  const logic = field.conditional_json ?? null;
  const conditionMet = evaluateConditions(logic, values);
  const action = logic?.action ?? 'show';
  let visible = true;
  let required = Boolean(field.is_required);
  let disabled = Boolean(field.is_readonly);

  switch (action) {
    case 'show':
      visible = logic?.rules?.length ? conditionMet : true;
      break;
    case 'hide':
      visible = !conditionMet;
      break;
    case 'require':
      required = required || conditionMet;
      break;
    case 'disable':
      disabled = disabled || conditionMet;
      break;
    default:
      break;
  }
  return { visible, required, disabled };
}

export function visibleFields(structure: FormStructure, values: ValueMap): StructureField[] {
  const resolved: ValueMap = {};
  for (const field of structure.fields) {
    const state = fieldState(field, values);
    if (state.visible && values[field.field_key] !== undefined) resolved[field.field_key] = values[field.field_key];
  }
  return structure.fields.filter((field) => fieldState(field, resolved).visible);
}

/* ─────────────────────────────── coercion ──────────────────────────────── */

export interface CoercionResult {
  value: unknown;
  error?: string;
  /** Present on formula and auto_number fields — the value the server computed. */
  computed?: boolean;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}(:\d{2})?$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/;

function emptyValue(value: unknown): boolean {
  return value === undefined || value === null || value === ''
    || (Array.isArray(value) && value.length === 0);
}

function optionByKey(field: StructureField, key: unknown): FieldOption | undefined {
  return fieldOptions(field).find((o) => o.option_key === String(key) || o.option_value === String(key));
}

/** Turns raw JSON input into the value we persist (or an error we can return). */
export function coerceValue(field: StructureField, raw: unknown, values: ValueMap = {}): CoercionResult {
  if (DECORATIVE_TYPES.has(field.field_type)) return { value: null };

  if (field.field_type === 'formula' || field.field_type === 'auto_number') {
    if (field.field_type === 'auto_number') return { value: raw ?? null, computed: true };
    const expression = field.formula_expression ?? '';
    if (!expression) return { value: null, error: 'Formula field has no expression' };
    const result = evaluateFormula(expression, formulaContext(values));
    if (result === null) return { value: null, error: `Formula "${expression}" could not be evaluated` };
    return { value: result, computed: true };
  }

  if (emptyValue(raw)) return { value: null };

  switch (field.field_type) {
    case 'number':
    case 'decimal':
    case 'currency': {
      const num = typeof raw === 'number' ? raw : Number(String(raw).replace(/,/g, ''));
      if (!Number.isFinite(num)) return { value: null, error: `${field.label} must be a number` };
      return { value: field.field_type === 'number' ? Math.trunc(num) : num };
    }
    case 'rating': {
      const num = Number(raw);
      if (!Number.isFinite(num)) return { value: null, error: `${field.label} must be a number` };
      return { value: num };
    }
    case 'switch':
      return { value: raw === true || raw === 1 || raw === '1' || raw === 'true' || raw === 'on' };
    case 'checkbox':
      // A checkbox either has options (a group) or is a single boolean.
      if (fieldOptions(field).length === 0) {
        return { value: raw === true || raw === 1 || raw === '1' || raw === 'true' || raw === 'on' };
      }
      return coerceMulti(field, raw);
    case 'multi_select':
      return coerceMulti(field, raw);
    case 'select':
    case 'radio': {
      const option = optionByKey(field, raw);
      if (!option) return { value: null, error: `${field.label}: "${String(raw)}" is not one of the allowed options` };
      return { value: option.option_key };
    }
    case 'file':
    case 'image':
    case 'signature': {
      const fileId = Number(raw);
      if (!Number.isInteger(fileId) || fileId <= 0) return { value: null, error: `${field.label} needs an uploaded file` };
      return { value: fileId };
    }
    case 'multi_file': {
      const list = (Array.isArray(raw) ? raw : [raw]).map((v) => Number(v));
      if (list.some((id) => !Number.isInteger(id) || id <= 0)) {
        return { value: null, error: `${field.label} needs uploaded files` };
      }
      return { value: list };
    }
    case 'date':
      if (!DATE_RE.test(String(raw))) return { value: null, error: `${field.label} must be a date (YYYY-MM-DD)` };
      return { value: String(raw) };
    case 'time':
      if (!TIME_RE.test(String(raw))) return { value: null, error: `${field.label} must be a time (HH:MM)` };
      return { value: String(raw).slice(0, 5) };
    case 'datetime': {
      const text = String(raw).replace(' ', 'T');
      if (!DATETIME_RE.test(text)) return { value: null, error: `${field.label} must be a date and time` };
      return { value: text.replace('T', ' ').slice(0, 19) };
    }
    case 'email':
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(raw))) return { value: null, error: `${field.label} must be a valid e-mail address` };
      return { value: String(raw).trim() };
    case 'phone':
      if (!/^[+0-9()\-\s]{7,20}$/.test(String(raw))) return { value: null, error: `${field.label} must be a valid phone number` };
      return { value: String(raw).trim() };
    case 'url':
      if (!/^https?:\/\/[^\s.]+\.\S{2,}$/i.test(String(raw))) return { value: null, error: `${field.label} must be a valid URL` };
      return { value: String(raw).trim() };
    case 'table':
      return { value: null };
    default:
      return { value: typeof raw === 'string' ? raw.trim() : raw };
  }
}

function coerceMulti(field: StructureField, raw: unknown): CoercionResult {
  const list = Array.isArray(raw) ? raw : [raw];
  const keys: string[] = [];
  for (const item of list) {
    if (item === null || item === undefined || item === '') continue;
    const option = optionByKey(field, item);
    if (!option) return { value: null, error: `${field.label}: "${String(item)}" is not one of the allowed options` };
    keys.push(option.option_key);
  }
  return { value: keys.length ? keys : null };
}

/* ────────────────────────────── validation ─────────────────────────────── */

/** Field-level rules that hold regardless of the form (used by draft saves and submit). */
export function validateField(field: StructureField, value: unknown, state: FieldState): string[] {
  const issues: string[] = [];
  const options = fieldOptions(field);
  const isMultiple = isMultiValue(field);

  if (emptyValue(value)) {
    if (state.required) issues.push(`${field.label} is required`);
    return issues;
  }

  const text = typeof value === 'string' ? value : Array.isArray(value) ? value.join(', ') : String(value);

  if (field.min_length !== null && field.min_length !== undefined && text.length < field.min_length) {
    issues.push(`${field.label} must be at least ${field.min_length} characters`);
  }
  if (field.max_length !== null && field.max_length !== undefined && text.length > field.max_length) {
    issues.push(`${field.label} must be at most ${field.max_length} characters`);
  }
  if (field.regex_pattern) {
    try {
      const re = new RegExp(field.regex_pattern);
      if (!re.test(text)) issues.push(`${field.label} does not match the required format`);
    } catch {
      issues.push(`${field.label} has an invalid pattern configured`);
    }
  }
  if (NUMERIC_TYPES.has(field.field_type) && !isMultiple) {
    const num = Number(value);
    if (Number.isFinite(num)) {
      if (field.min_value !== null && field.min_value !== undefined && num < Number(field.min_value)) {
        issues.push(`${field.label} cannot be less than ${Number(field.min_value)}`);
      }
      if (field.max_value !== null && field.max_value !== undefined && num > Number(field.max_value)) {
        issues.push(`${field.label} cannot be more than ${Number(field.max_value)}`);
      }
    }
  }
  if (field.field_type === 'multi_file' || field.field_type === 'file') {
    const maxFiles = Number((field.validation_json?.max_files as number) ?? 20);
    const count = field.field_type === 'multi_file' ? (value as unknown[]).length : 1;
    if (count > maxFiles) issues.push(`${field.label} accepts at most ${maxFiles} file(s)`);
  }
  if (['select', 'radio', 'multi_select'].includes(field.field_type) && options.length > 0 && !isMultiple) {
    if (!optionByKey(field, value)) issues.push(`${field.label} must be one of: ${options.map((o) => o.option_label).join(', ')}`);
  }
  return issues;
}

/** Validates a whole submission; only visible fields are enforced. */
export function validateSubmission(
  structure: FormStructure,
  values: ValueMap,
  tableRows: TableRowMap,
  options: { partial?: boolean } = {}
): FieldIssue[] {
  const partial = Boolean(options.partial);
  const issues: FieldIssue[] = [];
  const visible: ValueMap = {};
  for (const field of structure.fields) {
    const state = fieldState(field, visible);
    if (!state.visible) continue;
    if (values[field.field_key] !== undefined) visible[field.field_key] = values[field.field_key];
  }

  for (const field of structure.fields) {
    if (DECORATIVE_TYPES.has(field.field_type)) continue;
    const state = fieldState(field, visible);
    if (!state.visible) continue;
    const effectiveState = partial ? { ...state, required: false } : state;
    for (const message of validateField(field, visible[field.field_key], effectiveState)) {
      issues.push({ field: field.field_key, message });
    }
  }

  for (const dynamicTable of structure.tables) {
    const rows = tableRows[dynamicTable.table_key] ?? [];
    if (!partial && dynamicTable.is_repeatable && rows.length < (dynamicTable.min_rows ?? 0)) {
      issues.push({ field: dynamicTable.table_key, message: `${dynamicTable.table_name} needs at least ${dynamicTable.min_rows} row(s)` });
    }
    if (dynamicTable.max_rows && rows.length > dynamicTable.max_rows) {
      issues.push({ field: dynamicTable.table_key, message: `${dynamicTable.table_name} accepts at most ${dynamicTable.max_rows} row(s)` });
    }
    rows.forEach((row, index) => {
      for (const column of dynamicTable.columns.filter((c) => c.status !== 'inactive')) {
        const raw = row[column.column_key];
        const isEmpty = raw === undefined || raw === null || raw === '';
        if (column.is_required && !partial && isEmpty) {
          issues.push({ field: `${dynamicTable.table_key}.${column.column_key}`, message: `Row ${index + 1}: ${column.column_label} is required` });
        }
      }
    });
  }

  if (!partial && structure.requiresSignature) {
    const signatureFields = structure.fields.filter((f) => f.field_type === 'signature');
    if (signatureFields.length > 0) {
      const signed = signatureFields.some((f) => values[f.field_key]);
      if (!signed) issues.push({ field: 'signature', message: 'This form must be signed before it is submitted' });
    }
  }
  return issues;
}

/* ──────────────────────────────── formulas ─────────────────────────────── */

/** Flattens answers (plus table totals) into the numeric context formulas see. */
export function formulaContext(values: ValueMap, tableRows: TableRowMap = {}, extra: Record<string, number> = {}): Record<string, number> {
  const context: Record<string, number> = { ...extra };
  for (const [key, value] of Object.entries(values)) {
    if (value === null || value === undefined || value === '') continue;
    if (Array.isArray(value)) {
      if (value.every((v) => typeof v === 'number')) {
        context[key] = (value as number[]).reduce((a, b) => a + b, 0);
      }
      continue;
    }
    const num = Number(value);
    if (Number.isFinite(num)) context[key] = num;
  }
  for (const [tableKey, rows] of Object.entries(tableRows)) {
    const columnKeys = new Set<string>();
    for (const row of rows) for (const key of Object.keys(row)) columnKeys.add(key);
    for (const key of columnKeys) {
      const total = rows.reduce((sum, row) => {
        const num = Number(row[key]);
        return sum + (Number.isFinite(num) ? num : 0);
      }, 0);
      context[`${tableKey}.${key}`] = total;
      context[`total_${key}`] = (context[`total_${key}`] ?? 0) + total;
    }
    context[`${tableKey}.rows`] = rows.length;
    context.rows = (context.rows ?? 0) + rows.length;
  }
  return context;
}

/**
 * The numeric value an answer contributes to a formula. Scored options answer with
 * their score (so `fire_score + water_score` works the way an auditor expects),
 * everything else answers with the number inside it.
 */
export function formulaContextFor(structure: FormStructure, values: ValueMap, tableRows: TableRowMap): Record<string, number> {
  const scoring: Record<string, number> = {};
  for (const field of structure.fields) {
    const raw = values[field.field_key];
    if (raw === null || raw === undefined || raw === '') continue;
    const options = fieldOptions(field);
    if (options.some((option) => option.score !== null && option.score !== undefined)
      && ['select', 'radio', 'multi_select', 'checkbox'].includes(String(field.field_type))) {
      const chosen = Array.isArray(raw) ? raw.map(String) : [String(raw)];
      scoring[String(field.field_key)] = options
        .filter((option) => chosen.includes(String(option.option_key)) || chosen.includes(String(option.option_value)))
        .reduce((sum, option) => sum + Number(option.score ?? 0), 0);
    }
  }
  return formulaContext({ ...scoring, ...values }, tableRows, scoring);
}

/** Recomputes every formula field worth persisting (called on save and submit). */
export function applyFormulaFields(structure: FormStructure, values: ValueMap, tableRows: TableRowMap): ValueMap {
  const next: ValueMap = { ...values };
  const context = formulaContextFor(structure, next, tableRows);
  for (const field of structure.fields) {
    if (field.field_type !== 'formula' || !field.formula_expression) continue;
    try {
      const result = compileFormula(field.formula_expression)(context);
      next[field.field_key] = result;
      // Later formulas may build on earlier ones (e.g. a rate computed from a total computed above it).
      if (typeof result === 'number' && Number.isFinite(result)) context[field.field_key] = result;
    } catch (error) {
      if (error instanceof FormulaError) continue;
      throw error;
    }
  }
  return next;
}

/**
 * Fills in every `formula` column of every row (a row's own cells are the inputs, and a formula may use the
 * formula columns before it). Called wherever rows are saved or read for totals, so a computed "amount" or
 * "net pay" is real data - it totals, it prints in the PDF and it is there when the row is read back.
 */
export function applyTableFormulas(structure: FormStructure, tableRows: TableRowMap): TableRowMap {
  const out: TableRowMap = { ...tableRows };
  for (const dynamicTable of structure.tables) {
    const formulaColumns = dynamicTable.columns.filter((column) => column.column_type === 'formula' && column.formula_expression);
    const rows = tableRows[String(dynamicTable.table_key)];
    if (!formulaColumns.length || !Array.isArray(rows)) continue;
    out[String(dynamicTable.table_key)] = rows.map((row) => {
      const next: Record<string, unknown> = { ...row };
      const context: Record<string, number> = {};
      for (const [key, value] of Object.entries(next)) {
        const num = Number(value);
        if (value !== null && value !== '' && Number.isFinite(num)) context[key] = num;
      }
      for (const column of formulaColumns) {
        try {
          const result = compileFormula(String(column.formula_expression))(context);
          next[String(column.column_key)] = Number.isFinite(result) ? Math.round(result * 100) / 100 : null;
          if (Number.isFinite(result)) context[String(column.column_key)] = result;
        } catch (error) {
          if (!(error instanceof FormulaError)) throw error;
          next[String(column.column_key)] = null; // an input is still missing (or divides by zero)
        }
      }
      return next;
    });
  }
  return out;
}

/** Server-side totals strip for a table (SUM of every column flagged `is_total`). */
export function tableTotals(dynamicTable: StructureTable, rows: Record<string, unknown>[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const column of dynamicTable.columns) {
    if (!column.is_total) continue;
    totals[column.column_key] = rows.reduce((sum, row) => {
      const num = Number(row[column.column_key]);
      return sum + (Number.isFinite(num) ? num : 0);
    }, 0);
  }
  return totals;
}

/* ──────────────────────────────── scoring ──────────────────────────────── */

export interface ScoreBreakdown {
  obtained: number;
  max: number;
  percentage: number | null;
  /** Per-field contributions — shown in the admin's score panel. */
  components: { key: string; label: string; obtained: number; max: number }[];
}

/**
 * Scores a submission:
 *   • select / radio / multi_select / checkbox groups → the chosen option's `score`
 *     (for multi-value fields every chosen option counts; `score` may be negative
 *     for penalty options)
 *   • number / decimal / currency / rating → the answer itself, against
 *     `validation_json.max_score` (or `validation_json.max` for ratings)
 *   • tables → for every column whose `validation_json.scoring` is true, the SUM of
 *     the column against `max_per_row × row count`
 */
export function computeScore(structure: FormStructure, values: ValueMap, tableRows: TableRowMap): ScoreBreakdown {
  const components: ScoreBreakdown['components'] = [];
  let obtained = 0;
  let max = 0;

  for (const field of structure.fields) {
    if (DECORATIVE_TYPES.has(field.field_type) || field.field_type === 'table') continue;
    const options = fieldOptions(field);
    const scoringOptions = options.filter((option) => option.score !== null && option.score !== undefined);

    if (scoringOptions.length > 0 && ['select', 'radio', 'multi_select', 'checkbox'].includes(field.field_type)) {
      const raw = values[field.field_key];
      const chosen = Array.isArray(raw) ? raw.map(String) : raw === undefined || raw === null || raw === '' ? [] : [String(raw)];
      const earned = scoringOptions
        .filter((option) => chosen.includes(String(option.option_key)) || chosen.includes(String(option.option_value)))
        .reduce((sum, option) => sum + Number(option.score ?? 0), 0);
      const ceiling = isMultiValue(field)
        ? scoringOptions.filter((o) => Number(o.score) > 0).reduce((sum, o) => sum + Number(o.score), 0)
        : Math.max(...scoringOptions.map((o) => Number(o.score)));
      obtained += earned;
      max += ceiling;
      components.push({ key: field.field_key, label: field.label, obtained: round2(earned), max: round2(ceiling) });
      continue;
    }

    if (NUMERIC_TYPES.has(field.field_type) && field.field_type !== 'formula' && field.field_type !== 'auto_number') {
      const fieldMax = Number(field.validation_json?.max_score ?? field.validation_json?.max ?? NaN);
      if (!Number.isFinite(fieldMax)) continue;
      const answer = Number(values[field.field_key]);
      const earned = Number.isFinite(answer) ? answer : 0;
      obtained += earned;
      max += fieldMax;
      components.push({ key: field.field_key, label: field.label, obtained: round2(earned), max: round2(fieldMax) });
    }
  }

  for (const dynamicTable of structure.tables) {
    const rows = tableRows[dynamicTable.table_key] ?? [];
    for (const column of dynamicTable.columns) {
      const scoring = Boolean(column.validation_json?.scoring);
      if (!scoring) continue;
      const perRow = Number(column.validation_json?.max_per_row ?? NaN);
      const earned = rows.reduce((sum, row) => {
        const num = Number(row[column.column_key]);
        return sum + (Number.isFinite(num) ? num : 0);
      }, 0);
      const ceiling = Number.isFinite(perRow) ? perRow * rows.length : 0;
      obtained += earned;
      max += ceiling;
      components.push({ key: `${dynamicTable.table_key}.${column.column_key}`, label: `${dynamicTable.table_name} — ${column.column_label}`, obtained: round2(earned), max: round2(ceiling) });
    }
  }

  obtained = round2(obtained);
  max = round2(max);
  return { obtained, max, percentage: max > 0 ? round2((obtained / max) * 100) : null, components };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
