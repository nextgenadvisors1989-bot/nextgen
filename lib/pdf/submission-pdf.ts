/**
 * Dynamic submission PDF.
 *
 * Renders whatever the builder laid out — sections in their saved order, every
 * field that is flagged `show_in_pdf`, repeatable tables with their totals strip,
 * the score summary when the form scores, the reviewer's decision when the
 * submission has one, and the signature block when the form asks for signatures.
 *
 * The document number, version and page count are stamped into the footer of
 * every page after the body is complete, so the footer can never push the
 * document onto an extra page.
 */
import { query, queryOne, type RowDataPacket } from '@/lib/db/mysql';
import { formatDate, formatDateTime } from '@/lib/utils/dates';
import { formatCurrency } from '@/lib/utils/formatting';
import {
  COLORS, MARGIN, CONTENT_WIDTH, createPdf, letterhead, sectionHeading, keyValues, table,
  signatureBlock, stampFooters, setFont, paragraph, spacer, renderPdf, type Doc,
} from '@/lib/pdf/base';
import { tableTotals, type FormStructure, type TableRowMap, type ValueMap } from '@/services/dynamic-form-rules';

export interface SubmissionPdfInput {
  submission: Record<string, unknown>;
  form: Record<string, unknown>;
  module: Record<string, unknown>;
  structure: FormStructure;
  values: ValueMap;
  tableRows: TableRowMap;
  generatedByName: string;
  generatedByRole: string;
  generatedAt?: Date;
}

interface CompanyInfo {
  name: string;
  addressLines: string[];
  registrationLine: string;
}

/** The company whose letterhead appears on the document. */
async function companyInfo(employerId: number | null): Promise<CompanyInfo> {
  if (employerId) {
    const employer = await queryOne<RowDataPacket>(
      `SELECT company_name, address_line_1, address_line_2, city, state, pincode, employer_code, gst_number
       FROM employers WHERE id = ?`,
      [employerId]
    );
    if (employer) {
      return {
        name: String(employer.company_name),
        addressLines: [
          [employer.address_line_1, employer.address_line_2].filter(Boolean).join(', '),
          [employer.city, employer.state, employer.pincode].filter(Boolean).join(' - '),
        ].filter(Boolean) as string[],
        registrationLine: [employer.employer_code, employer.gst_number].filter(Boolean).join(' · '),
      };
    }
  }
  const rows = await query<RowDataPacket>(
    "SELECT setting_key, setting_value FROM settings WHERE setting_key IN ('company_name','company_address','company_email','company_phone','company_gstin')"
  );
  const setting = Object.fromEntries(rows.map((row) => [String(row.setting_key), String(row.setting_value ?? '').trim()]));
  return {
    name: setting.company_name || 'ComplianceOS',
    addressLines: setting.company_address ? [setting.company_address] : [],
    registrationLine: [setting.company_email, setting.company_phone, setting.company_gstin ? `GSTIN ${setting.company_gstin}` : ''].filter(Boolean).join('  |  '),
  };
}

function formatAnswer(fieldType: string, value: unknown): string {
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
  if (fieldType === 'signature') return 'Signed';
  return String(value);
}

export async function generateSubmissionPdf(input: SubmissionPdfInput): Promise<Buffer> {
  const { submission, form, module, structure, values, tableRows } = input;
  const employerId = submission.employer_id ? Number(submission.employer_id) : null;
  const company = await companyInfo(employerId);

  const submissionNumber = String(submission.submission_number ?? '');
  const version = Number(submission.version ?? 1);
  const doc = createPdf({
    title: `${form.name ?? 'Submission'} — ${submissionNumber}`,
    subject: String(submission.title ?? form.name ?? ''),
    author: company.name,
  });

  letterhead(doc, {
    companyName: company.name,
    addressLines: company.addressLines,
    registrationLine: company.registrationLine,
    documentTitle: String(form.name ?? 'Submission'),
    subtitle: String(submission.title ?? ''),
    metaRows: [
      { label: 'Submission No.', value: submissionNumber },
      { label: 'Module', value: `${String(module.name ?? '')} (v${String(module.version ?? '1.0')})` },
      { label: 'Status', value: String(submission.status ?? '').replace(/_/g, ' ') },
      { label: 'Form version', value: `v${String(form.version ?? 1)}` },
      { label: 'Period', value: submission.period_from
        ? `${formatDate(String(submission.period_from))}${submission.period_to ? ` to ${formatDate(String(submission.period_to))}` : ''}`
        : '—' },
      { label: 'Submitted on', value: submission.submitted_at ? formatDateTime(String(submission.submitted_at)) : (submission.submission_date ? formatDateTime(String(submission.submission_date)) : '—') },
    ],
  });

  keyValues(doc, [
    { label: 'Submitted by', value: String(submission.submitted_by_name ?? '—') },
    { label: 'Role', value: String(submission.submitter_role ?? submission.generated_as ?? input.generatedByRole) },
    { label: 'Employer', value: String(submission.company_name ?? '—') },
    { label: 'Unit', value: String(submission.unit_name ?? '—') },
    { label: 'Department', value: String(submission.department_name ?? '—') },
    { label: 'Auditor', value: String(submission.auditor_name ?? '—') },
  ], { columns: 3 });

  /* ── score summary ─────────────────────────────────────────────────── */
  if (Number(submission.score_max ?? 0) > 0) {
    spacer(doc, 4);
    sectionHeading(doc, 'Score summary');
    const obtained = Number(submission.score_obtained ?? 0);
    const max = Number(submission.score_max ?? 0);
    const percentage = submission.score_percentage === null || submission.score_percentage === undefined
      ? (max > 0 ? Math.round((obtained / max) * 10000) / 100 : null)
      : Number(submission.score_percentage);
    keyValues(doc, [
      { label: 'Score', value: max > 0 ? `${obtained} / ${max}` : String(obtained) },
      { label: 'Percentage', value: percentage === null ? '—' : `${percentage}%` },
      { label: 'Result', value: percentage === null ? '—' : percentage >= 75 ? 'Compliant' : percentage >= 50 ? 'Partially compliant' : 'Non-compliant' },
    ], { columns: 3 });
  }

  /* ── sections ──────────────────────────────────────────────────────── */
  for (const section of structure.sections) {
    const printableFields = section.fields.filter((field) => Boolean(field.show_in_pdf));
    const printableTables = section.tables.filter((dynamicTable) => Boolean(dynamicTable.show_in_pdf));
    if (printableFields.length === 0 && printableTables.length === 0) continue;

    if (section.page_break_before) doc.addPage();
    sectionHeading(doc, String(section.title), {
      titleTa: undefined,
      note: section.description ? String(section.description) : undefined,
    });

    // A run of full-width select questions is a checklist: print it the way an auditor's paper checklist
    // reads - S.No, requirement, response - instead of one key/value strip per line.
    const isChecklistItem = (field: (typeof printableFields)[number]) =>
      ['select', 'radio'].includes(String(field.field_type)) && Number(field.column_width ?? 12) === 12;
    const checklistItems = printableFields.filter(isChecklistItem);
    const asChecklist = checklistItems.length >= 5 && checklistItems.length >= printableFields.length - 3;
    if (asChecklist) {
      const rows = checklistItems.map((field, index) => {
        const answer = values[String(field.field_key)];
        const option = (field.options ?? []).find((o) => o.option_key === answer);
        return { _sr: index + 1, item: String(field.label), response: option ? String(option.option_label) : formatAnswer(String(field.field_type), answer) };
      });
      table(doc, {
        columns: [
          { key: '_sr', label: 'S.No', width: 0.07, align: 'center' as const },
          { key: 'item', label: 'Requirement / item', width: 0.65 },
          { key: 'response', label: 'Response', width: 0.26 },
        ],
        rows,
        maxRows: 500,
      });
      spacer(doc, 4);
    }

    for (const field of printableFields) {
      if (asChecklist && isChecklistItem(field)) continue;
      if (field.field_type === 'heading') {
        setFont(doc, 10.5, { bold: true });
        doc.fillColor(COLORS.ink).text(String(field.label), MARGIN, doc.y, { width: CONTENT_WIDTH });
        doc.moveDown(0.3);
        continue;
      }
      if (field.field_type === 'divider') {
        doc.moveTo(MARGIN, doc.y + 3).lineTo(MARGIN + CONTENT_WIDTH, doc.y + 3).strokeColor(COLORS.line).lineWidth(0.5).stroke();
        doc.moveDown(0.6);
        continue;
      }
      if (field.field_type === 'paragraph') {
        paragraph(doc, String(field.default_value ?? field.help_text ?? ''), { size: 9 });
        continue;
      }
      if (field.field_type === 'signature') {
        const signed = Boolean(values[String(field.field_key)]);
        keyValues(doc, [{ label: String(field.label), value: signed ? `Signed — file #${String(values[String(field.field_key)])}` : 'Not signed' }], { columns: 1 });
        continue;
      }
      if (field.field_type === 'table') continue; // rendered from `structure.tables`

      const answer = formatAnswer(String(field.field_type), values[String(field.field_key)]);
      // A calculated field may carry options so its number reads as a word (a grade of 3 prints as "Green").
      const option = (field.options ?? []).find((o) => String(o.option_key) === String(values[String(field.field_key)]));
      const label = option ? String(option.option_label) : answer;
      keyValues(doc, [{ label: String(field.label_ta ? `${field.label} / ${field.label_ta}` : field.label), value: label }], {
        columns: String(field.field_type) === 'textarea' || String(field.field_type) === 'rich_text' ? 1 : 2,
      });
    }

    for (const dynamicTable of printableTables) {
      const rows = (tableRows[String(dynamicTable.table_key)] ?? []).map((row, index) => ({ ...row, _sr: index + 1 }));
      const totals = tableTotals(dynamicTable, rows);
      const columns = dynamicTable.columns
        .filter((column) => Boolean(column.show_in_pdf))
        .map((column) => ({
          key: String(column.column_key),
          label: String(column.column_label),
          width: Math.min(Math.max(Number(column.width_pct ?? 0) / 100, 0.08), 0.35),
          align: ['number', 'decimal', 'currency', 'formula'].includes(String(column.column_type)) ? 'right' as const : 'left' as const,
          render: (row: Record<string, unknown>) => {
            const raw = row[String(column.column_key)];
            const choices = (column.options_json ?? []) as { option_key: string; option_label: string }[];
            if (['select', 'multi_select'].includes(String(column.column_type)) && choices.length) {
              const label = (key: unknown) => choices.find((c) => c.option_key === String(key))?.option_label ?? String(key);
              return Array.isArray(raw) ? (raw.length ? raw.map(label).join(', ') : '—') : (raw === null || raw === undefined || raw === '' ? '—' : label(raw));
            }
            return formatAnswer(String(column.column_type), raw);
          },
        }));
      const columnsWithSr = dynamicTable.show_row_numbers
        ? [{ key: '_sr', label: 'S.No', width: 0.06, align: 'center' as const }, ...columns]
        : columns;
      const totalWidth = columnsWithSr.reduce((sum, column) => sum + column.width, 0);
      const scaled = totalWidth > 0
        ? columnsWithSr.map((column) => ({ ...column, width: (column.width / totalWidth) * 0.98 }))
        : columnsWithSr;

      setFont(doc, 9.5, { bold: true });
      doc.fillColor(COLORS.ink).text(String(dynamicTable.table_name), MARGIN, doc.y + 4, { width: CONTENT_WIDTH });
      doc.moveDown(0.3);
      const totalLine = Object.entries(totals).length
        ? Object.entries(totals)
          .map(([key, value]) => `${dynamicTable.columns.find((c) => String(c.column_key) === key)?.column_label ?? key}: ${value}`)
          .join('   ')
        : undefined;
      table(doc, {
        columns: scaled,
        rows,
        empty: 'No rows recorded.',
        maxRows: 400,
        overflowNote: (hidden) => `… ${hidden} more row(s) are held in the digital submission.`,
        footer: totalLine ? `Totals — ${totalLine}` : undefined,
      });
    }
  }

  /* ── reviewer decision ─────────────────────────────────────────────── */
  if (submission.review_action) {
    spacer(doc, 6);
    sectionHeading(doc, 'Review');
    keyValues(doc, [
      { label: 'Decision', value: String(submission.review_action).toUpperCase() },
      { label: 'Reviewed by', value: String(submission.reviewed_by_name ?? '—') },
      { label: 'Reviewed on', value: submission.reviewed_at ? formatDateTime(String(submission.reviewed_at)) : '—' },
    ], { columns: 3 });
    if (submission.review_comments) paragraph(doc, String(submission.review_comments), { size: 9 });
  }

  if (submission.remarks) {
    spacer(doc, 4);
    sectionHeading(doc, 'Remarks');
    paragraph(doc, String(submission.remarks), { size: 9 });
  }

  if (structure.requiresSignature) {
    signatureBlock(doc, ['Submitted by', 'Reviewed by', 'Authorised signatory'], {
      note: `Signed electronically on ${formatDateTime(input.generatedAt ?? new Date())}`,
    });
  } else {
    spacer(doc, 8);
    paragraph(doc, `Generated by ${input.generatedByName} (${input.generatedByRole}) on ${formatDateTime(input.generatedAt ?? new Date())}.`, { size: 8 });
  }

  /* ── footer on every page ──────────────────────────────────────────── */
  stampFooters(doc, ({ index, total }) => ({
    left: `${submissionNumber} · v${version}`,
    center: company.name,
    right: `Page ${index} of ${total}`,
  }));

  return renderPdf(doc);
}

export { COLORS };
