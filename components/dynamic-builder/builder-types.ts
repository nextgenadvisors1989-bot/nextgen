/**
 * Client-side draft model for the form builder.
 *
 * The builder holds the whole form in memory while the administrator edits it,
 * so every node carries a stable `key` (React keys, drag targets, conditional
 * rules that point at a field that has not been saved yet). `toPayload` turns the
 * draft back into the exact `formStructureSchema` payload the API validates.
 */
import type {
  ConditionalLogic, DynamicTableColumn, FieldOption,
} from '@/types/dynamic-module';

export interface DraftOption extends FieldOption {
  key: string;
}

export interface DraftField {
  key: string;
  id: number | null;
  field_key: string;
  label: string;
  label_ta: string | null;
  field_type: string;
  placeholder: string | null;
  help_text: string | null;
  default_value: string | null;
  validation_json: Record<string, unknown> | null;
  conditional_json: ConditionalLogic | null;
  table_definition_id: number | null;
  formula_expression: string | null;
  is_required: boolean;
  is_readonly: boolean;
  is_unique: boolean;
  show_in_pdf: boolean;
  show_in_list: boolean;
  column_width: number;
  min_value: number | null;
  max_value: number | null;
  min_length: number | null;
  max_length: number | null;
  regex_pattern: string | null;
  status: 'active' | 'inactive';
  options: DraftOption[];
}

export interface DraftColumn {
  key: string;
  id: number | null;
  column_key: string;
  column_label: string;
  column_label_ta: string | null;
  column_type: string;
  options_json: FieldOption[] | null;
  formula_expression: string | null;
  default_value: string | null;
  width_pct: number | null;
  is_required: boolean;
  is_editable: boolean;
  is_sortable: boolean;
  is_total: boolean;
  show_in_pdf: boolean;
  validation_json: Record<string, unknown> | null;
  status: 'active' | 'inactive';
}

export interface DraftTable {
  key: string;
  id: number | null;
  table_key: string;
  table_name: string;
  table_name_ta: string | null;
  description: string | null;
  is_repeatable: boolean;
  min_rows: number;
  max_rows: number | null;
  show_row_numbers: boolean;
  show_totals: boolean;
  show_in_pdf: boolean;
  status: 'active' | 'inactive';
  columns: DraftColumn[];
}

export interface DraftSection {
  key: string;
  id: number | null;
  title: string;
  section_code: string | null;
  description: string | null;
  layout_columns: number;
  is_repeatable: boolean;
  is_collapsible: boolean;
  is_collapsed: boolean;
  show_in_pdf: boolean;
  page_break_before: boolean;
  status: 'active' | 'inactive';
  fields: DraftField[];
  tables: DraftTable[];
}

export interface DraftForm {
  name: string;
  slug: string | null;
  description: string | null;
  form_type: string;
  layout_columns: number;
  requires_signature: boolean;
  requires_attachments: boolean;
  allow_draft: boolean;
  auto_number_prefix: string | null;
  status: 'draft' | 'published' | 'archived';
  sections: DraftSection[];
}

let counter = 0;
/** Stable local key — never sent to the server. */
export function localKey(prefix = 'n'): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter}`;
}

export const FIELD_TYPES: { value: string; label: string; group: string }[] = [
  { value: 'text', label: 'Text (single line)', group: 'Basic' },
  { value: 'textarea', label: 'Paragraph text', group: 'Basic' },
  { value: 'rich_text', label: 'Rich text', group: 'Basic' },
  { value: 'number', label: 'Whole number', group: 'Number' },
  { value: 'decimal', label: 'Decimal number', group: 'Number' },
  { value: 'currency', label: 'Currency (₹)', group: 'Number' },
  { value: 'rating', label: 'Rating / score out of N', group: 'Number' },
  { value: 'formula', label: 'Calculated (formula)', group: 'Number' },
  { value: 'date', label: 'Date', group: 'Date & time' },
  { value: 'time', label: 'Time', group: 'Date & time' },
  { value: 'datetime', label: 'Date and time', group: 'Date & time' },
  { value: 'select', label: 'Dropdown (single choice)', group: 'Choice' },
  { value: 'radio', label: 'Radio buttons', group: 'Choice' },
  { value: 'multi_select', label: 'Multi-select', group: 'Choice' },
  { value: 'checkbox', label: 'Checkbox group / yes-no', group: 'Choice' },
  { value: 'switch', label: 'Yes / No switch', group: 'Choice' },
  { value: 'email', label: 'E-mail', group: 'Contact' },
  { value: 'phone', label: 'Phone', group: 'Contact' },
  { value: 'url', label: 'Website URL', group: 'Contact' },
  { value: 'file', label: 'File upload', group: 'Files' },
  { value: 'multi_file', label: 'Multiple files', group: 'Files' },
  { value: 'image', label: 'Image upload', group: 'Files' },
  { value: 'signature', label: 'Signature', group: 'Files' },
  { value: 'table', label: 'Repeatable table', group: 'Layout' },
  { value: 'heading', label: 'Heading (no answer)', group: 'Layout' },
  { value: 'paragraph', label: 'Instructions block', group: 'Layout' },
  { value: 'divider', label: 'Divider', group: 'Layout' },
  { value: 'auto_number', label: 'Auto number', group: 'Number' },
];

export const CHOICE_TYPES = ['select', 'radio', 'multi_select', 'checkbox'];
export const LAYOUT_TYPES = ['heading', 'paragraph', 'divider'];

export function isChoice(field: Pick<DraftField, 'field_type'>): boolean {
  return CHOICE_TYPES.includes(field.field_type);
}
export function isLayout(field: Pick<DraftField, 'field_type'>): boolean {
  return LAYOUT_TYPES.includes(field.field_type);
}
export function isScorable(field: DraftField): boolean {
  return isChoice(field) || ['number', 'decimal', 'currency', 'rating'].includes(field.field_type);
}

/** `Label` → `label`, `Section 2 (fire)` → `section_2_fire`. */
export function slugKey(value: string, fallback = 'field'): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
  return /^[a-z]/.test(slug) ? slug : `${fallback}_${slug || 'x'}`;
}

/* ─────────────────────────── factory helpers ───────────────────────────── */

export function newField(sectionFields: DraftField[], partial: Partial<DraftField> = {}): DraftField {
  const label = partial.label ?? 'Untitled field';
  const base = slugKey(label);
  let key = base;
  let suffix = 1;
  const taken = new Set(sectionFields.map((field) => field.field_key));
  while (taken.has(key)) {
    suffix += 1;
    key = `${base}_${suffix}`;
  }
  const fieldType = partial.field_type ?? 'text';
  return {
    key: localKey('f'),
    id: null,
    field_key: key,
    label,
    label_ta: null,
    field_type: fieldType,
    placeholder: null,
    help_text: null,
    default_value: null,
    validation_json: null,
    conditional_json: null,
    table_definition_id: null,
    formula_expression: null,
    is_required: false,
    is_readonly: false,
    is_unique: false,
    show_in_pdf: true,
    show_in_list: false,
    column_width: 12,
    min_value: null,
    max_value: null,
    min_length: null,
    max_length: null,
    regex_pattern: null,
    status: 'active',
    options: CHOICE_TYPES.includes(fieldType) && fieldType !== 'checkbox'
      ? [
        { key: localKey('o'), option_key: 'yes', option_label: 'Yes', option_label_ta: null, option_value: null, color: null, score: null, is_default: false, sort_order: 0 },
        { key: localKey('o'), option_key: 'no', option_label: 'No', option_label_ta: null, option_value: null, color: null, score: null, is_default: false, sort_order: 1 },
      ]
      : [],
    ...partial,
  };
}

export function newTable(partial: Partial<DraftTable> = {}): DraftTable {
  return {
    key: localKey('t'),
    id: null,
    table_key: 'register',
    table_name: 'Register',
    table_name_ta: null,
    description: null,
    is_repeatable: true,
    min_rows: 1,
    max_rows: null,
    show_row_numbers: true,
    show_totals: false,
    show_in_pdf: true,
    status: 'active',
    columns: [
      {
        key: localKey('c'), id: null, column_key: 'description', column_label: 'Description', column_label_ta: null,
        column_type: 'text', options_json: null, formula_expression: null, default_value: null, width_pct: 40,
        is_required: true, is_editable: true, is_sortable: false, is_total: false, show_in_pdf: true,
        validation_json: null, status: 'active',
      },
      {
        key: localKey('c'), id: null, column_key: 'quantity', column_label: 'Quantity', column_label_ta: null,
        column_type: 'decimal', options_json: null, formula_expression: null, default_value: null, width_pct: 20,
        is_required: false, is_editable: true, is_sortable: true, is_total: true, show_in_pdf: true,
        validation_json: null, status: 'active',
      },
    ],
    ...partial,
  };
}

/* ───────────────────────── serialisation ───────────────────────────────── */

/** Draft → the payload `PUT /api/admin/dynamic-forms/:id` expects. */
export function toPayload(draft: DraftForm) {
  return {
    name: draft.name,
    slug: draft.slug,
    description: draft.description,
    form_type: draft.form_type,
    layout_columns: draft.layout_columns,
    requires_signature: draft.requires_signature,
    requires_attachments: draft.requires_attachments,
    allow_draft: draft.allow_draft,
    auto_number_prefix: draft.auto_number_prefix,
    status: draft.status,
    sections: draft.sections.map((section, sectionIndex) => ({
      id: section.id,
      title: section.title,
      section_code: section.section_code,
      description: section.description,
      layout_columns: section.layout_columns,
      is_repeatable: section.is_repeatable,
      is_collapsible: section.is_collapsible,
      is_collapsed: section.is_collapsed,
      show_in_pdf: section.show_in_pdf,
      page_break_before: section.page_break_before,
      sort_order: sectionIndex,
      status: section.status,
      fields: section.fields.map((field, fieldIndex) => ({
        id: field.id,
        section_id: section.id ?? 0,
        field_key: field.field_key,
        label: field.label,
        label_ta: field.label_ta,
        field_type: field.field_type,
        placeholder: field.placeholder,
        help_text: field.help_text,
        default_value: field.default_value,
        validation_json: field.validation_json,
        conditional_json: field.conditional_json,
        table_definition_id: field.table_definition_id,
        formula_expression: field.formula_expression,
        is_required: field.is_required,
        is_readonly: field.is_readonly,
        is_unique: field.is_unique,
        show_in_pdf: field.show_in_pdf,
        show_in_list: field.show_in_list,
        column_width: field.column_width,
        min_value: field.min_value,
        max_value: field.max_value,
        min_length: field.min_length,
        max_length: field.max_length,
        regex_pattern: field.regex_pattern,
        sort_order: fieldIndex,
        status: field.status,
        options: field.options.map((option, optionIndex) => ({
          id: null,
          option_key: option.option_key,
          option_label: option.option_label,
          option_label_ta: option.option_label_ta ?? null,
          option_value: option.option_value ?? null,
          color: option.color ?? null,
          score: option.score ?? null,
          is_default: Boolean(option.is_default),
          sort_order: optionIndex,
        })),
      })),
      tables: section.tables.map((table, tableIndex) => ({
        id: table.id,
        section_id: section.id ?? null,
        table_key: table.table_key,
        table_name: table.table_name,
        table_name_ta: table.table_name_ta,
        description: table.description,
        is_repeatable: table.is_repeatable,
        min_rows: table.min_rows,
        max_rows: table.max_rows,
        show_row_numbers: table.show_row_numbers,
        show_totals: table.show_totals,
        show_in_pdf: table.show_in_pdf,
        sort_order: tableIndex,
        status: table.status,
        columns: table.columns.map((column, columnIndex) => ({
          id: column.id,
          column_key: column.column_key,
          column_label: column.column_label,
          column_label_ta: column.column_label_ta,
          column_type: column.column_type,
          options_json: column.options_json,
          formula_expression: column.formula_expression,
          default_value: column.default_value,
          width_pct: column.width_pct,
          is_required: column.is_required,
          is_editable: column.is_editable,
          is_sortable: column.is_sortable,
          is_total: column.is_total,
          show_in_pdf: column.show_in_pdf,
          validation_json: column.validation_json,
          sort_order: columnIndex,
          status: column.status,
        })),
      })),
    })),
  };
}

/** API payload → draft (used when the builder loads an existing form). */
export function fromStructure(form: Record<string, unknown>, structure: { sections?: Record<string, unknown>[] }): DraftForm {
  const sections = (structure.sections ?? []) as unknown as Record<string, unknown>[];
  return {
    name: String(form.name ?? ''),
    slug: (form.slug as string) ?? null,
    description: (form.description as string) ?? null,
    form_type: String(form.form_type ?? 'STANDARD'),
    layout_columns: Number(form.layout_columns ?? 1),
    requires_signature: Boolean(form.requires_signature),
    requires_attachments: Boolean(form.requires_attachments),
    allow_draft: form.allow_draft === undefined ? true : Boolean(form.allow_draft),
    auto_number_prefix: (form.auto_number_prefix as string) ?? null,
    status: (form.status as DraftForm['status']) ?? 'draft',
    sections: sections.map((section) => ({
      key: localKey('s'),
      id: section.id ? Number(section.id) : null,
      title: String(section.title ?? ''),
      section_code: (section.section_code as string) ?? null,
      description: (section.description as string) ?? null,
      layout_columns: Number(section.layout_columns ?? 1),
      is_repeatable: Boolean(section.is_repeatable),
      is_collapsible: Boolean(section.is_collapsible),
      is_collapsed: Boolean(section.is_collapsed),
      show_in_pdf: section.show_in_pdf === undefined ? true : Boolean(section.show_in_pdf),
      page_break_before: Boolean(section.page_break_before),
      status: (section.status as 'active' | 'inactive') ?? 'active',
      fields: ((section.fields ?? []) as Record<string, unknown>[]).map((field) => ({
        key: localKey('f'),
        id: field.id ? Number(field.id) : null,
        field_key: String(field.field_key ?? ''),
        label: String(field.label ?? ''),
        label_ta: (field.label_ta as string) ?? null,
        field_type: String(field.field_type ?? 'text'),
        placeholder: (field.placeholder as string) ?? null,
        help_text: (field.help_text as string) ?? null,
        default_value: (field.default_value as string) ?? null,
        validation_json: (field.validation_json as Record<string, unknown>) ?? null,
        conditional_json: (field.conditional_json as ConditionalLogic) ?? null,
        table_definition_id: field.table_definition_id ? Number(field.table_definition_id) : null,
        formula_expression: (field.formula_expression as string) ?? null,
        is_required: Boolean(field.is_required),
        is_readonly: Boolean(field.is_readonly),
        is_unique: Boolean(field.is_unique),
        show_in_pdf: field.show_in_pdf === undefined ? true : Boolean(field.show_in_pdf),
        show_in_list: Boolean(field.show_in_list),
        column_width: Number(field.column_width ?? 12),
        min_value: field.min_value === null || field.min_value === undefined ? null : Number(field.min_value),
        max_value: field.max_value === null || field.max_value === undefined ? null : Number(field.max_value),
        min_length: field.min_length === null || field.min_length === undefined ? null : Number(field.min_length),
        max_length: field.max_length === null || field.max_length === undefined ? null : Number(field.max_length),
        regex_pattern: (field.regex_pattern as string) ?? null,
        status: (field.status as 'active' | 'inactive') ?? 'active',
        options: (((field.options ?? field.options_json ?? []) as Record<string, unknown>[]).map((option, index) => ({
          key: localKey('o'),
          id: option.id ? Number(option.id) : undefined,
          option_key: String(option.option_key ?? ''),
          option_label: String(option.option_label ?? ''),
          option_label_ta: (option.option_label_ta as string) ?? null,
          option_value: (option.option_value as string) ?? null,
          color: (option.color as string) ?? null,
          score: option.score === null || option.score === undefined ? null : Number(option.score),
          is_default: Boolean(option.is_default),
          sort_order: index,
        }))),
      })),
      tables: ((section.tables ?? []) as Record<string, unknown>[]).map((table) => ({
        key: localKey('t'),
        id: table.id ? Number(table.id) : null,
        table_key: String(table.table_key ?? ''),
        table_name: String(table.table_name ?? ''),
        table_name_ta: (table.table_name_ta as string) ?? null,
        description: (table.description as string) ?? null,
        is_repeatable: table.is_repeatable === undefined ? true : Boolean(table.is_repeatable),
        min_rows: Number(table.min_rows ?? 0),
        max_rows: table.max_rows === null || table.max_rows === undefined ? null : Number(table.max_rows),
        show_row_numbers: table.show_row_numbers === undefined ? true : Boolean(table.show_row_numbers),
        show_totals: Boolean(table.show_totals),
        show_in_pdf: table.show_in_pdf === undefined ? true : Boolean(table.show_in_pdf),
        status: (table.status as 'active' | 'inactive') ?? 'active',
        columns: ((table.columns ?? []) as Record<string, unknown>[]).map((column) => ({
          key: localKey('c'),
          id: column.id ? Number(column.id) : null,
          column_key: String(column.column_key ?? ''),
          column_label: String(column.column_label ?? ''),
          column_label_ta: (column.column_label_ta as string) ?? null,
          column_type: String(column.column_type ?? 'text'),
          options_json: (column.options_json as FieldOption[]) ?? null,
          formula_expression: (column.formula_expression as string) ?? null,
          default_value: (column.default_value as string) ?? null,
          width_pct: column.width_pct === null || column.width_pct === undefined ? null : Number(column.width_pct),
          is_required: Boolean(column.is_required),
          is_editable: column.is_editable === undefined ? true : Boolean(column.is_editable),
          is_sortable: Boolean(column.is_sortable),
          is_total: Boolean(column.is_total),
          show_in_pdf: column.show_in_pdf === undefined ? true : Boolean(column.show_in_pdf),
          validation_json: (column.validation_json as Record<string, unknown>) ?? null,
          status: (column.status as 'active' | 'inactive') ?? 'active',
        })),
      })),
    })),
  };
}

/** Every key on the form — the vocabulary formulas and conditions can reference. */
export function keyVocabulary(draft: DraftForm): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  for (const section of draft.sections) {
    for (const field of section.fields) {
      if (isLayout(field)) continue;
      out.push({ value: field.field_key, label: `${field.label} (${field.field_key})` });
    }
    for (const table of section.tables) {
      out.push({ value: table.table_key, label: `${table.table_name} — rows (${table.table_key}.rows)` });
      for (const column of table.columns) {
        out.push({ value: `${table.table_key}.${column.column_key}`, label: `${table.table_name} — ${column.column_label} total` });
      }
    }
  }
  return out;
}
