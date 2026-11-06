/**
 * What a dynamic form looks like on paper, as plain blocks, shared by the PDF and the Word download.
 *
 * `blank: true` prints the empty form an auditor takes on site (tick boxes for every choice, ruled lines for answers, empty table rows).
 * Otherwise the stored answers are printed. Keeping the layout rules here means the two file types can never disagree.
 */
import { formatDate, formatDateTime } from '@/lib/utils/dates';
import { formatCurrency } from '@/lib/utils/formatting';
import { tableTotals, type FormStructure, type StructureField, type TableRowMap, type ValueMap } from '@/services/dynamic-form-rules';

/** A file attached to a form: its name, and (for a PNG or JPEG picture) the bytes to print in the document. */
export interface AttachedFile { id: number; name: string; image?: { data: Buffer; format: 'png' | 'jpg'; width: number; height: number } }

export interface DocColumn { key: string; label: string; /** share of the page width, 0..1 */ width: number; align: 'left' | 'right' | 'center' }

export type DocBlock =
  | { kind: 'section'; title: string; note?: string; pageBreak: boolean }
  | { kind: 'checklist'; rows: { sr: number; item: string; response: string }[]; blank: boolean }
  | { kind: 'pair'; label: string; value: string; wide: boolean }
  | { kind: 'files'; label: string; items: AttachedFile[] }
  | { kind: 'qa'; rows: { q: string; a: string }[] }
  | { kind: 'heading'; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'divider' }
  | { kind: 'table'; name: string; columns: DocColumn[]; rows: string[][]; footer?: string; emptyNote: string };

const RULE = '________________________';
const BLANK_ROWS = 6;

export function formatAnswer(fieldType: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.length ? value.map((v) => formatAnswer(fieldType, v)).join(', ') : '—';
  if (fieldType === 'currency') return formatCurrency(Number(value));
  if (fieldType === 'date') return formatDate(String(value));
  if (fieldType === 'datetime') return formatDateTime(String(value));
  if (['number', 'decimal', 'rating', 'formula', 'auto_number'].includes(fieldType)) {
    const num = Number(value);
    return Number.isFinite(num) ? String(num) : String(value);
  }
  if (['file', 'image', 'signature'].includes(fieldType)) return `File #${String(value)}`;
  return String(value);
}

/** The text a text-editor answer reads as on paper: paragraphs, bullets and table rows kept, formatting dropped. */
export function richTextToPlain(html: unknown): string {
  const text = String(html ?? '')
    .replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, '')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<\/(p|div|h[1-6]|li|ul|ol|tr|blockquote|table)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(td|th)>/gi, '   |   ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/(\s*\|\s*)+\n/g, '\n')
    .replace(/\n\n+(?=• )/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text;
}

/** Width and height of a PNG or JPEG, read from its header (null for anything else). */
export function imageInfo(data: Buffer): { format: 'png' | 'jpg'; width: number; height: number } | null {
  if (data.length > 24 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) {
    return { format: 'png', width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
  }
  if (data.length > 4 && data[0] === 0xff && data[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < data.length) {
      if (data[offset] !== 0xff) { offset += 1; continue; }
      const marker = data[offset + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { format: 'jpg', height: data.readUInt16BE(offset + 5), width: data.readUInt16BE(offset + 7) };
      offset += 2 + data.readUInt16BE(offset + 2);
    }
  }
  return null;
}

const tickList = (labels: string[]) => labels.map((label) => `[  ] ${label}`).join('    ');

/** What an empty answer looks like for one field on a paper form. */
function blankAnswer(field: StructureField): string {
  const type = String(field.field_type);
  const labels = (field.options ?? []).map((o) => String(o.option_label));
  if (['select', 'radio', 'multi_select'].includes(type) && labels.length) return tickList(labels);
  if (['checkbox', 'switch'].includes(type)) return tickList(['Yes', 'No']);
  if (type === 'date') return '____ / ____ / ________';
  if (type === 'datetime') return '____ / ____ / ________   ____ : ____';
  if (['textarea', 'rich_text'].includes(type)) return [RULE + RULE, RULE + RULE, RULE + RULE].join('\n');
  if (['formula', 'auto_number'].includes(type)) return '(calculated)';
  if (['file', 'multi_file', 'image'].includes(type)) return '(attach a copy)';
  if (type === 'signature') return RULE;
  return RULE;
}

function answerFor(field: StructureField, values: ValueMap): string {
  const raw = values[String(field.field_key)];
  const option = (field.options ?? []).find((o) => String(o.option_key) === String(raw));
  return option ? String(option.option_label) : formatAnswer(String(field.field_type), raw);
}

/** What the cover page of a report-style document says, read from the form's own fields (keys the audit forms share). */
export interface ReportCover { title: string; organisation: string; address: string; affiliation: string; preparedBy: string; period: string; reference: string; logo?: AttachedFile }

export function reportCoverOf(input: { formName: string; structure: FormStructure; values: ValueMap; files?: Map<number, AttachedFile>; fallbackOrganisation?: string }): ReportCover {
  const text = (...keys: string[]) => {
    for (const key of keys) {
      const raw = input.values[key];
      if (raw === null || raw === undefined || raw === '') continue;
      const field = input.structure.fields.find((f) => String(f.field_key) === key);
      const value = field && ['rich_text'].includes(String(field.field_type)) ? richTextToPlain(raw) : String(raw);
      if (value.trim()) return value.trim();
    }
    return '';
  };
  const logoId = Number(input.values.logo);
  return {
    title: text('report_title') || input.formName,
    organisation: text('facility_unit_name', 'organisation') || input.fallbackOrganisation || '',
    address: text('facility_address'),
    affiliation: [text('affiliation_board', 'university'), text('aegis')].filter(Boolean).join(' - '),
    preparedBy: text('prepared_by', 'audited_by_auditor_firm'),
    period: text('period', 'report_year', 'audit_date'),
    reference: text('audit_document_reference'),
    logo: Number.isInteger(logoId) && logoId > 0 ? input.files?.get(logoId) : undefined,
  };
}

/** A finished report leaves out what was not answered (but keeps every numbered question), empty tables and the headings that end up with nothing under them. */
function tidyReport(blocks: DocBlock[]): DocBlock[] {
  const question = (block: DocBlock) => block.kind === 'pair' && /^\d+\.\s/.test(block.label);
  const kept = blocks.filter((block) => !((block.kind === 'pair' && block.value === '—' && !question(block)) || (block.kind === 'table' && block.rows.length === 0)));
  const real = (block: DocBlock) => !['section', 'heading', 'paragraph', 'divider'].includes(block.kind);
  const out: DocBlock[] = [];
  for (let i = 0; i < kept.length; i += 1) {
    const block = kept[i];
    if (block.kind === 'section' || block.kind === 'heading') {
      // is there any answer under this one before the next section (or the next heading)?
      let has = false;
      for (let j = i + 1; j < kept.length; j += 1) {
        if (kept[j].kind === 'section' || (block.kind === 'heading' && kept[j].kind === 'heading')) break;
        if (real(kept[j])) { has = true; break; }
      }
      if (!has) continue;
    }
    out.push(block);
  }
  return out;
}

/** A run of numbered questions reads as a two-column question / answer table, like the printed questionnaires. */
function groupQuestions(blocks: DocBlock[]): DocBlock[] {
  const numbered = (block: DocBlock) => block.kind === 'pair' && /^\d+\.\s/.test(block.label);
  const out: DocBlock[] = [];
  for (let i = 0; i < blocks.length; i += 1) {
    if (!numbered(blocks[i])) { out.push(blocks[i]); continue; }
    let j = i;
    while (j < blocks.length && numbered(blocks[j])) j += 1;
    if (j - i < 3) { out.push(...blocks.slice(i, j)); i = j - 1; continue; }
    out.push({ kind: 'qa', rows: blocks.slice(i, j).map((b) => { const pair = b as Extract<DocBlock, { kind: 'pair' }>; return { q: pair.label, a: pair.value }; }) });
    i = j - 1;
  }
  return out;
}

export function buildDocumentBlocks(input: { structure: FormStructure; values?: ValueMap; tableRows?: TableRowMap; blank?: boolean; report?: boolean; files?: Map<number, AttachedFile> }): DocBlock[] {
  const { structure } = input;
  const blank = Boolean(input.blank);
  const values = input.values ?? {};
  const tableRows = input.tableRows ?? {};
  const blocks: DocBlock[] = [];

  for (const section of structure.sections) {
    // the cover page of a report is the document's own front page, not a chapter of it
    if (input.report && !blank && String(section.title) === 'Cover page') continue;
    const fields = section.fields.filter((field) => Boolean(field.show_in_pdf));
    const tables = section.tables.filter((t) => Boolean(t.show_in_pdf));
    if (fields.length === 0 && tables.length === 0) continue;

    blocks.push({ kind: 'section', title: String(section.title), note: section.description ? String(section.description) : undefined, pageBreak: Boolean(section.page_break_before) });

    // A run of full-width select questions is a checklist: S.No, requirement, response, the way a paper checklist reads.
    const isChecklistItem = (field: StructureField) => ['select', 'radio'].includes(String(field.field_type)) && Number(field.column_width ?? 12) === 12;
    const checklistItems = fields.filter(isChecklistItem);
    const asChecklist = checklistItems.length >= 5 && checklistItems.length >= fields.length - 3;
    if (asChecklist) {
      blocks.push({
        kind: 'checklist', blank,
        rows: checklistItems.map((field, index) => ({
          sr: index + 1, item: String(field.label),
          response: blank ? blankAnswer(field) : answerFor(field, values),
        })),
      });
    }

    for (const field of fields) {
      if (asChecklist && isChecklistItem(field)) continue;
      const type = String(field.field_type);
      if (type === 'heading') { blocks.push({ kind: 'heading', text: String(field.label) }); continue; }
      if (type === 'divider') { blocks.push({ kind: 'divider' }); continue; }
      if (type === 'paragraph') { blocks.push({ kind: 'paragraph', text: String(field.default_value ?? field.help_text ?? field.label ?? '') }); continue; }
      if (type === 'table') continue; // rendered from the section's tables
      const label = String(field.label_ta ? `${field.label} / ${field.label_ta}` : field.label);
      const wide = ['textarea', 'rich_text'].includes(type);
      if (blank) { blocks.push({ kind: 'pair', label, value: blankAnswer(field), wide }); continue; }
      if (['file', 'image', 'multi_file'].includes(type)) {
        const raw = values[String(field.field_key)];
        const ids = (Array.isArray(raw) ? raw : raw ? [raw] : []).map(Number).filter((id) => Number.isInteger(id) && id > 0);
        if (ids.length === 0) { blocks.push({ kind: 'pair', label, value: '—', wide: true }); continue; }
        blocks.push({ kind: 'files', label, items: ids.map((id) => input.files?.get(id) ?? { id, name: `File #${id}` }) });
        continue;
      }
      if (type === 'rich_text') { blocks.push({ kind: 'pair', label, value: richTextToPlain(values[String(field.field_key)]) || '—', wide: true }); continue; }
      if (type === 'signature') {
        const signed = Boolean(values[String(field.field_key)]);
        blocks.push({ kind: 'pair', label: String(field.label), value: signed ? `Signed — file #${String(values[String(field.field_key)])}` : 'Not signed', wide: true });
        continue;
      }
      blocks.push({ kind: 'pair', label, value: answerFor(field, values), wide });
    }

    for (const dynamicTable of tables) {
      const printable = dynamicTable.columns.filter((column) => Boolean(column.show_in_pdf));
      const numbered = Boolean(dynamicTable.show_row_numbers);
      const raw: DocColumn[] = [
        ...(numbered ? [{ key: '_sr', label: 'S.No', width: 0.06, align: 'center' as const }] : []),
        ...printable.map((column) => ({
          key: String(column.column_key),
          label: String(column.column_label),
          width: Math.min(Math.max(Number(column.width_pct ?? 0) / 100, 0.08), 0.35),
          align: (['number', 'decimal', 'currency', 'formula'].includes(String(column.column_type)) ? 'right' : 'left') as 'left' | 'right',
        })),
      ];
      const total = raw.reduce((sum, column) => sum + column.width, 0);
      const columns = total > 0 ? raw.map((column) => ({ ...column, width: (column.width / total) * 0.98 })) : raw;

      let rows: string[][];
      let footer: string | undefined;
      if (blank) {
        const count = Math.min(Math.max(Number(dynamicTable.min_rows ?? 0), BLANK_ROWS), 12, Number(dynamicTable.max_rows ?? 12) || 12);
        rows = Array.from({ length: count }, (_, index) => columns.map((column) => (column.key === '_sr' ? String(index + 1) : '')));
      } else {
        const source: Record<string, unknown>[] = (tableRows[String(dynamicTable.table_key)] ?? []).map((row, index) => ({ ...row, _sr: index + 1 }));
        const totals = tableTotals(dynamicTable, source);
        rows = source.map((row) => columns.map((column) => {
          if (column.key === '_sr') return String(row._sr);
          const definition = printable.find((c) => String(c.column_key) === column.key);
          const value = row[column.key];
          const choices = (definition?.options_json ?? []) as { option_key: string; option_label: string }[];
          if (definition && ['select', 'multi_select'].includes(String(definition.column_type)) && choices.length) {
            const label = (key: unknown) => choices.find((c) => c.option_key === String(key))?.option_label ?? String(key);
            return Array.isArray(value) ? (value.length ? value.map(label).join(', ') : '—') : (value === null || value === undefined || value === '' ? '—' : label(value));
          }
          return formatAnswer(String(definition?.column_type ?? 'text'), value);
        }));
        const entries = Object.entries(totals);
        if (entries.length) footer = `Totals — ${entries.map(([key, value]) => `${dynamicTable.columns.find((c) => String(c.column_key) === key)?.column_label ?? key}: ${value}`).join('   ')}`;
      }
      blocks.push({ kind: 'table', name: String(dynamicTable.table_name), columns, rows, footer, emptyNote: 'No rows recorded.' });
    }
  }
  return input.report && !blank ? groupQuestions(tidyReport(blocks)) : blocks;
}
