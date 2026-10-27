export interface DynamicModule {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  category: string | null;
  version: string;
  module_type: 'AUDIT' | 'ASSESSMENT' | 'RISK' | 'STUDY' | 'WORK_PERMIT' | 'INSPECTION' | 'CUSTOM';
  default_tat_days: number | null;
  requires_verification: boolean;
  sort_order: number;
  status: 'draft' | 'published' | 'archived';
  form_count?: number;
  submission_count?: number;
  created_at?: string;
}

export interface DynamicForm {
  id: number;
  module_id: number;
  name: string;
  slug: string;
  description: string | null;
  form_type: string;
  version: number;
  layout_columns: number;
  requires_signature: boolean;
  requires_attachments: boolean;
  allow_draft: boolean;
  auto_number_prefix: string | null;
  status: 'draft' | 'published' | 'archived';
  section_count?: number;
  field_count?: number;
  table_count?: number;
  module_name?: string;
}

export type FieldType =
  | 'text' | 'textarea' | 'rich_text' | 'number' | 'decimal' | 'currency' | 'date' | 'time'
  | 'datetime' | 'email' | 'phone' | 'url' | 'password' | 'select' | 'multi_select' | 'radio'
  | 'checkbox' | 'switch' | 'file' | 'multi_file' | 'image' | 'signature' | 'rating' | 'table'
  | 'heading' | 'paragraph' | 'divider' | 'formula' | 'auto_number';

export interface DynamicFormSection {
  id: number;
  form_id: number;
  title: string;
  section_code: string | null;
  description: string | null;
  layout_columns: number;
  is_repeatable: boolean;
  is_collapsible: boolean;
  is_collapsed: boolean;
  show_in_pdf: boolean;
  page_break_before: boolean;
  sort_order: number;
  status: 'active' | 'inactive';
  fields?: DynamicFormField[];
  tables?: DynamicTable[];
}

export interface DynamicFormField {
  id: number;
  form_id: number;
  section_id: number;
  field_key: string;
  label: string;
  label_ta: string | null;
  field_type: FieldType;
  placeholder: string | null;
  help_text: string | null;
  default_value: string | null;
  options_json: FieldOption[] | null;
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
  min_value: number | string | null;
  max_value: number | string | null;
  min_length: number | null;
  max_length: number | null;
  regex_pattern: string | null;
  sort_order: number;
  status: 'active' | 'inactive';
  options?: FieldOption[];
}

export interface FieldOption {
  id?: number;
  option_key: string;
  option_label: string;
  option_label_ta?: string | null;
  option_value?: string | null;
  color?: string | null;
  score?: number | null;
  is_default?: boolean;
  sort_order?: number;
}

export interface ConditionalLogic {
  action: 'show' | 'hide' | 'require' | 'disable';
  match: 'all' | 'any';
  rules: { field_key: string; operator: 'equals' | 'not_equals' | 'contains' | 'gt' | 'lt' | 'is_empty' | 'is_not_empty'; value: string }[];
}

export interface DynamicTable {
  id: number;
  form_id: number;
  section_id: number | null;
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
  sort_order: number;
  status: 'active' | 'inactive';
  columns?: DynamicTableColumn[];
}

export interface DynamicTableColumn {
  id: number;
  table_id: number;
  column_key: string;
  column_label: string;
  column_label_ta: string | null;
  column_type: 'text' | 'textarea' | 'number' | 'decimal' | 'currency' | 'date' | 'time' | 'select' | 'multi_select' | 'checkbox' | 'file' | 'formula' | 'auto_number';
  options_json: FieldOption[] | null;
  formula_expression: string | null;
  default_value: string | null;
  width_pct: number | string | null;
  is_required: boolean;
  is_editable: boolean;
  is_sortable: boolean;
  is_total: boolean;
  show_in_pdf: boolean;
  validation_json?: Record<string, unknown> | null;
  sort_order: number;
  status: 'active' | 'inactive';
}

export interface DynamicFormSubmission {
  id: number;
  uuid: string;
  submission_number: string;
  module_id: number;
  form_id: number;
  assignment_id: number | null;
  employer_id: number | null;
  unit_id: number | null;
  department_id: number | null;
  submitted_by: number | null;
  auditor_id: number | null;
  title: string | null;
  status: 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'changes_requested' | 'archived';
  score_obtained: number | string | null;
  score_max: number | string | null;
  score_percentage: number | string | null;
  submission_date: string | null;
  period_from: string | null;
  period_to: string | null;
  remarks: string | null;
  version: number;
  employer_name?: string;
  module_name?: string;
  form_name?: string;
}

export interface PdfLayout {
  id: number;
  form_id: number;
  name: string;
  page_size: 'A4' | 'A3' | 'LETTER' | 'LEGAL';
  orientation: 'portrait' | 'landscape';
  margin_top_mm: number;
  margin_bottom_mm: number;
  margin_left_mm: number;
  margin_right_mm: number;
  header_enabled: boolean;
  header_html: string | null;
  footer_enabled: boolean;
  footer_html: string | null;
  show_page_numbers: boolean;
  show_company_header: boolean;
  repeat_table_headers: boolean;
  watermark_text: string | null;
  sections_json: { section_id: number; show: boolean; page_break_before: boolean }[] | null;
}
