/**
 * Dynamic module engine contracts.
 *
 * Three payload families live here:
 *   1. the **module** — the container an audit/assessment/risk/study/permit form
 *      belongs to (who may use it, whether it needs verification, its TAT);
 *   2. the **form structure** — sections, fields (28 types), field options, tables
 *      and table columns, saved in one nested payload so the builder can never
 *      leave a half-saved form behind;
 *   3. the **submission** — the answers a user fills in, saved as a draft and then
 *      submitted, plus the reviewer's decision.
 */
import { z } from 'zod';

const asTuple = <T extends string>(values: readonly T[]): [T, ...T[]] => [...values] as [T, ...T[]];

const optionalString = (max: number) =>
  z.string().trim().max(max).optional().nullable().transform((value) => (value === '' ? null : value ?? null));

const optionalId = z.coerce.number().int().positive().optional().nullable();

const booleanish = z.union([z.boolean(), z.literal(0), z.literal(1), z.literal('0'), z.literal('1'), z.literal('true'), z.literal('false')])
  .transform((value) => value === true || value === 1 || value === '1' || value === 'true');

/* ────────────────────────────── catalogues ─────────────────────────────── */

export const MODULE_TYPES = ['AUDIT', 'ASSESSMENT', 'RISK', 'STUDY', 'WORK_PERMIT', 'INSPECTION', 'CUSTOM'] as const;
export const FORM_TYPES = ['STANDARD', 'AUDIT', 'CHECKLIST', 'INSPECTION', 'PERMIT', 'ASSESSMENT'] as const;
export const MODULE_STATUSES = ['draft', 'published', 'archived'] as const;
export const SUBMISSION_STATUSES = ['draft', 'submitted', 'under_review', 'approved', 'rejected', 'changes_requested', 'archived'] as const;

export const FIELD_TYPES = [
  'text', 'textarea', 'rich_text', 'number', 'decimal', 'currency', 'date', 'time',
  'datetime', 'email', 'phone', 'url', 'password', 'select', 'multi_select', 'radio',
  'checkbox', 'switch', 'file', 'multi_file', 'image', 'signature', 'rating', 'table',
  'heading', 'paragraph', 'divider', 'formula', 'auto_number',
] as const;

export const COLUMN_TYPES = [
  'text', 'textarea', 'number', 'decimal', 'currency', 'date', 'time', 'select',
  'multi_select', 'checkbox', 'file', 'formula', 'auto_number',
] as const;

export const CONDITION_ACTIONS = ['show', 'hide', 'require', 'disable'] as const;
export const CONDITION_MATCHES = ['all', 'any'] as const;
export const CONDITION_OPERATORS = ['equals', 'not_equals', 'contains', 'gt', 'lt', 'is_empty', 'is_not_empty'] as const;

/** Field types that cannot be scored or answered. */
export const LAYOUT_FIELD_TYPES: string[] = ['heading', 'paragraph', 'divider'];

/* ─────────────────────────────── schema ───────────────────────────────── */

export const optionSchema = z.object({
  id: optionalId,
  option_key: z.string().trim().min(1, 'Give the option a key').max(100),
  option_label: z.string().trim().min(1, 'Give the option a label').max(255),
  option_label_ta: optionalString(255),
  option_value: optionalString(255),
  color: optionalString(20),
  score: z.coerce.number().min(-100000).max(100000).optional().nullable(),
  is_default: booleanish.optional().default(false),
  sort_order: z.coerce.number().int().min(0).max(9999).optional().default(0),
});

export const conditionalRuleSchema = z.object({
  field_key: z.string().trim().min(1).max(100),
  operator: z.enum(asTuple(CONDITION_OPERATORS)),
  value: z.string().max(500).optional().default(''),
});

export const conditionalLogicSchema = z.object({
  action: z.enum(asTuple(CONDITION_ACTIONS)).default('show'),
  match: z.enum(asTuple(CONDITION_MATCHES)).default('all'),
  rules: z.array(conditionalRuleSchema).max(10).default([]),
});

export const fieldSchema = z.object({
  id: optionalId,
  // The section a field belongs to is carried by the enclosing section; the id is
  // only sent back for fields that already exist (a brand-new form has no ids yet).
  section_id: z.coerce.number().int().min(0).optional().default(0),
  field_key: z.string().trim().min(1, 'Give the field a key').max(100)
    .regex(/^[a-z][a-z0-9_]*$/, 'Keys are lower_snake_case, e.g. extraction_airflow'),
  label: z.string().trim().min(1, 'Give the field a label').max(255),
  label_ta: optionalString(255),
  field_type: z.enum(asTuple(FIELD_TYPES)),
  placeholder: optionalString(255),
  help_text: optionalString(500),
  default_value: optionalString(2000),
  validation_json: z.record(z.string(), z.unknown()).optional().nullable(),
  conditional_json: conditionalLogicSchema.optional().nullable(),
  table_definition_id: optionalId,
  formula_expression: optionalString(500),
  is_required: booleanish.optional().default(false),
  is_readonly: booleanish.optional().default(false),
  is_unique: booleanish.optional().default(false),
  show_in_pdf: booleanish.optional().default(true),
  show_in_list: booleanish.optional().default(false),
  column_width: z.coerce.number().int().min(1).max(12).optional().default(12),
  min_value: z.coerce.number().optional().nullable(),
  max_value: z.coerce.number().optional().nullable(),
  min_length: z.coerce.number().int().min(0).max(100000).optional().nullable(),
  max_length: z.coerce.number().int().min(1).max(100000).optional().nullable(),
  regex_pattern: optionalString(500),
  sort_order: z.coerce.number().int().min(0).max(9999).optional().default(0),
  status: z.enum(['active', 'inactive']).optional().default('active'),
  options: z.array(optionSchema).max(200).optional().default([]),
}).superRefine((field, ctx) => {
  if (field.field_type === 'formula' && !field.formula_expression) {
    ctx.addIssue({ code: 'custom', path: ['formula_expression'], message: 'A formula field needs an expression' });
  }
  if (['select', 'radio', 'multi_select'].includes(field.field_type) && (field.options ?? []).length === 0) {
    ctx.addIssue({ code: 'custom', path: ['options'], message: `${field.field_type} fields need at least one option` });
  }
  if (field.field_type === 'table' && !field.table_definition_id) {
    ctx.addIssue({ code: 'custom', path: ['table_definition_id'], message: 'Point the table field at a table definition' });
  }
  if (field.min_value !== null && field.min_value !== undefined && field.max_value !== null && field.max_value !== undefined
    && Number(field.min_value) > Number(field.max_value)) {
    ctx.addIssue({ code: 'custom', path: ['max_value'], message: 'The maximum is lower than the minimum' });
  }
});

export const columnSchema = z.object({
  id: optionalId,
  column_key: z.string().trim().min(1, 'Give the column a key').max(100)
    .regex(/^[a-z][a-z0-9_]*$/, 'Keys are lower_snake_case'),
  column_label: z.string().trim().min(1, 'Give the column a label').max(255),
  column_label_ta: optionalString(255),
  column_type: z.enum(asTuple(COLUMN_TYPES)),
  options_json: z.array(optionSchema).max(200).optional().nullable(),
  formula_expression: optionalString(500),
  default_value: optionalString(500),
  width_pct: z.coerce.number().min(1).max(100).optional().nullable(),
  is_required: booleanish.optional().default(false),
  is_editable: booleanish.optional().default(true),
  is_sortable: booleanish.optional().default(false),
  is_total: booleanish.optional().default(false),
  show_in_pdf: booleanish.optional().default(true),
  validation_json: z.record(z.string(), z.unknown()).optional().nullable(),
  sort_order: z.coerce.number().int().min(0).max(9999).optional().default(0),
  status: z.enum(['active', 'inactive']).optional().default('active'),
}).superRefine((column, ctx) => {
  if (column.column_type === 'formula' && !column.formula_expression) {
    ctx.addIssue({ code: 'custom', path: ['formula_expression'], message: 'A formula column needs an expression' });
  }
  if (['select', 'multi_select'].includes(column.column_type) && (column.options_json ?? []).length === 0) {
    ctx.addIssue({ code: 'custom', path: ['options_json'], message: `${column.column_type} columns need options` });
  }
});

export const tableSchema = z.object({
  id: optionalId,
  section_id: optionalId,
  table_key: z.string().trim().min(1, 'Give the table a key').max(100)
    .regex(/^[a-z][a-z0-9_]*$/, 'Keys are lower_snake_case'),
  table_name: z.string().trim().min(1, 'Give the table a name').max(200),
  table_name_ta: optionalString(200),
  description: optionalString(1000),
  is_repeatable: booleanish.optional().default(true),
  min_rows: z.coerce.number().int().min(0).max(1000).optional().default(1),
  max_rows: z.coerce.number().int().min(1).max(1000).optional().nullable(),
  show_row_numbers: booleanish.optional().default(true),
  show_totals: booleanish.optional().default(false),
  show_in_pdf: booleanish.optional().default(true),
  sort_order: z.coerce.number().int().min(0).max(9999).optional().default(0),
  status: z.enum(['active', 'inactive']).optional().default('active'),
  columns: z.array(columnSchema).min(1, 'A table needs at least one column').max(50),
}).superRefine((table, ctx) => {
  if (table.max_rows !== null && table.max_rows !== undefined && table.max_rows < table.min_rows) {
    ctx.addIssue({ code: 'custom', path: ['max_rows'], message: 'The maximum is lower than the minimum rows' });
  }
});

export const sectionSchema = z.object({
  id: optionalId,
  title: z.string().trim().min(1, 'Give the section a title').max(255),
  section_code: optionalString(100),
  description: optionalString(1000),
  layout_columns: z.coerce.number().int().min(1).max(4).optional().default(1),
  is_repeatable: booleanish.optional().default(false),
  is_collapsible: booleanish.optional().default(false),
  is_collapsed: booleanish.optional().default(false),
  show_in_pdf: booleanish.optional().default(true),
  page_break_before: booleanish.optional().default(false),
  sort_order: z.coerce.number().int().min(0).max(9999).optional().default(0),
  status: z.enum(['active', 'inactive']).optional().default('active'),
  fields: z.array(fieldSchema).max(200).optional().default([]),
  tables: z.array(tableSchema).max(30).optional().default([]),
});

/** The builder's save payload: the whole structure, replaced atomically. */
export const formStructureSchema = z.object({
  name: z.string().trim().min(3, 'Give the form a name').max(200),
  slug: optionalString(200),
  description: optionalString(1000),
  form_type: z.enum(asTuple(FORM_TYPES)).default('STANDARD'),
  layout_columns: z.coerce.number().int().min(1).max(4).optional().default(1),
  requires_signature: booleanish.optional().default(false),
  requires_attachments: booleanish.optional().default(false),
  allow_draft: booleanish.optional().default(true),
  auto_number_prefix: optionalString(20),
  status: z.enum(['draft', 'published', 'archived']).optional().default('draft'),
  sections: z.array(sectionSchema).min(1, 'A form needs at least one section').max(60),
}).superRefine((form, ctx) => {
  const sectionIds = new Set<number>();
  (form.sections ?? []).forEach((section, index) => {
    if (section.id) sectionIds.add(Number(section.id));
    (section.fields ?? []).forEach((field, fieldIndex) => {
      // An existing field may not be moved into another section by hand.
      if (section.id && field.id && field.section_id && Number(field.section_id) !== Number(section.id)) {
        ctx.addIssue({ code: 'custom', path: ['sections', index, 'fields', fieldIndex, 'section_id'], message: 'Field is attached to another section' });
      }
    });
    (section.tables ?? []).forEach((table, tableIndex) => {
      if (section.id && table.section_id && Number(table.section_id) !== Number(section.id)) {
        ctx.addIssue({ code: 'custom', path: ['sections', index, 'tables', tableIndex, 'section_id'], message: 'Table is attached to another section' });
      }
    });
  });
  const keys = new Set<string>();
  (form.sections ?? []).forEach((section, index) => {
    (section.fields ?? []).forEach((field, fieldIndex) => {
      if (keys.has(field.field_key)) {
        ctx.addIssue({ code: 'custom', path: ['sections', index, 'fields', fieldIndex, 'field_key'], message: `Duplicate field key "${field.field_key}"` });
      }
      keys.add(field.field_key);
    });
    (section.tables ?? []).forEach((table, tableIndex) => {
      if (keys.has(table.table_key)) {
        ctx.addIssue({ code: 'custom', path: ['sections', index, 'tables', tableIndex, 'table_key'], message: `Duplicate key "${table.table_key}"` });
      }
      keys.add(table.table_key);
    });
  });
});

/* ──────────────────────────────── module ───────────────────────────────── */

export const modulePayloadSchema = z.object({
  name: z.string().trim().min(3, 'Give the module a name').max(200),
  slug: optionalString(200),
  description: optionalString(2000),
  icon: optionalString(100),
  category: optionalString(100),
  version: z.string().trim().max(20).optional().default('1.0'),
  module_type: z.enum(asTuple(MODULE_TYPES)),
  default_tat_days: z.coerce.number().int().min(1).max(365).optional().nullable(),
  requires_verification: booleanish.optional().default(true),
  is_public: booleanish.optional().default(false),
  sort_order: z.coerce.number().int().min(0).max(9999).optional().default(0),
  status: z.enum(asTuple(MODULE_STATUSES)).optional().default('draft'),
  /** Optional first form, so a new module is usable in one round-trip. */
  create_default_form: booleanish.optional().default(false),
  roles: z.array(z.string().trim().min(1).max(50)).max(10).optional().default([]),
});

export const moduleListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(200).optional().default(10),
  search: optionalString(200),
  status: optionalString(20),
  module_type: optionalString(30),
  category: optionalString(100),
  sortBy: optionalString(50),
  sortDir: z.enum(['asc', 'desc']).optional(),
});

export const formListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(200).optional().default(10),
  search: optionalString(200),
  module_id: optionalId,
  status: optionalString(20),
  form_type: optionalString(30),
  sortBy: optionalString(50),
  sortDir: z.enum(['asc', 'desc']).optional(),
});

export const submissionListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(200).optional().default(10),
  search: optionalString(200),
  module_id: optionalId,
  module_type: optionalString(40),
  form_id: optionalId,
  assignment_id: optionalId,
  employer_id: optionalId,
  status: optionalString(30),
  from_date: optionalString(10),
  to_date: optionalString(10),
  sortBy: optionalString(50),
  sortDir: z.enum(['asc', 'desc']).optional(),
});

export const assignmentPayloadSchema = z.object({
  roles: z.array(z.object({
    role: z.string().trim().min(1).max(50),
    can_create: booleanish.optional().default(true),
    can_read: booleanish.optional().default(true),
    can_update: booleanish.optional().default(true),
    can_delete: booleanish.optional().default(false),
    can_approve: booleanish.optional().default(false),
  })).max(10).optional().default([]),
  users: z.array(z.object({
    user_id: z.coerce.number().int().positive(),
    auditor_id: optionalId,
  })).max(500).optional().default([]),
});

export const cloneSchema = z.object({
  name: z.string().trim().min(3, 'Give the copy a name').max(200),
  slug: optionalString(200),
  copy_assignments: booleanish.optional().default(true),
  copy_forms: booleanish.optional().default(true),
});

/* ────────────────────────────── submission ─────────────────────────────── */

export const submissionStartSchema = z.object({
  form_id: z.coerce.number().int().positive('Pick the form to fill in'),
  assignment_id: optionalId,
  employer_id: optionalId,
  unit_id: optionalId,
  department_id: optionalId,
  employee_id: optionalId,
  auditor_id: optionalId,
  title: optionalString(255),
  period_from: optionalString(10),
  period_to: optionalString(10),
});

export const submissionSaveSchema = z.object({
  // A key that is absent keeps the stored answers; sending `{}` clears them. This
  // lets a partial save (or a submit that only carries the checklist flags) never
  // wipe what the person already filled in.
  values: z.record(z.string().max(100), z.unknown()).optional(),
  table_rows: z.record(z.string().max(100), z.array(z.record(z.string().max(100), z.unknown())).max(1000)).optional(),
  title: optionalString(255),
  remarks: optionalString(2000),
  period_from: optionalString(10),
  period_to: optionalString(10),
});

export const submissionSubmitSchema = submissionSaveSchema.extend({
  change_summary: optionalString(500),
  send_to_reviewer: booleanish.optional().default(true),
});

export const submissionReviewSchema = z.object({
  action: z.enum(['approve', 'reject', 'return', 'start_review']),
  comments: z.string().trim().min(5, 'Explain the decision in at least 5 characters').max(4000),
  score_obtained: z.coerce.number().min(-100000).max(1000000).optional().nullable(),
  score_max: z.coerce.number().min(0).max(1000000).optional().nullable(),
  notify_submitter: booleanish.optional().default(true),
});

export type ModulePayload = z.infer<typeof modulePayloadSchema>;
export type FormStructurePayload = z.infer<typeof formStructureSchema>;
export type SectionPayload = z.infer<typeof sectionSchema>;
export type FieldPayload = z.infer<typeof fieldSchema>;
export type TablePayload = z.infer<typeof tableSchema>;
export type ColumnPayload = z.infer<typeof columnSchema>;
export type OptionPayload = z.infer<typeof optionSchema>;
export type AssignmentPayload = z.infer<typeof assignmentPayloadSchema>;
export type SubmissionStartPayload = z.infer<typeof submissionStartSchema>;
export type SubmissionSavePayload = z.infer<typeof submissionSaveSchema>;
export type SubmissionSubmitPayload = z.infer<typeof submissionSubmitSchema>;
export type SubmissionReviewPayload = z.infer<typeof submissionReviewSchema>;
