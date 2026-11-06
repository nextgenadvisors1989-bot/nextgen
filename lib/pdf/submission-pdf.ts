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
import { buildDocumentBlocks, reportCoverOf, type AttachedFile, type DocBlock, type ReportCover } from '@/lib/forms/form-document-model';
import {
  COLORS, MARGIN, CONTENT_WIDTH, createPdf, letterhead, sectionHeading, keyValues, table,
  signatureBlock, stampFooters, setFont, paragraph, spacer, renderPdf, ensureSpace, nextPage, type Doc,
} from '@/lib/pdf/base';
import type { FormStructure, TableRowMap, ValueMap } from '@/services/dynamic-form-rules';

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
  /** Files attached to the answers, by file id (names, and the bytes of pictures to print). */
  files?: Map<number, AttachedFile>;
}

export interface CompanyInfo {
  name: string;
  addressLines: string[];
  registrationLine: string;
}

/** The company whose letterhead appears on the document. */
export async function companyInfo(employerId: number | null): Promise<CompanyInfo> {
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

/** A question with a long label reads better stacked: the question across the page, the answer (or ruled lines) under it. */
function stackedPair(doc: Doc, label: string, value: string): void {
  const labelHeight = (() => { setFont(doc, 8.5, { bold: true }); return doc.heightOfString(label, { width: CONTENT_WIDTH }); })();
  const lines = value.split('\n');
  const rule = (line: string) => /^_{4,}( \/ _{4,})*$/.test(line.trim()) || /^_+$/.test(line.trim());
  const valueHeight = lines.reduce((sum, line) => {
    if (rule(line) && !line.includes('/')) return sum + 17;
    setFont(doc, 9);
    return sum + doc.heightOfString(line || ' ', { width: CONTENT_WIDTH - 14 }) + 2;
  }, 0);
  ensureSpace(doc, Math.min(labelHeight + valueHeight + 8, 200));
  setFont(doc, 8.5, { bold: true });
  doc.fillColor(COLORS.ink).text(label, MARGIN, doc.y + 2, { width: CONTENT_WIDTH });
  for (const line of lines) {
    if (rule(line) && !line.includes('/')) {
      const y = doc.y + 12;
      doc.save().strokeColor(COLORS.muted).lineWidth(0.5).moveTo(MARGIN + 14, y).lineTo(MARGIN + CONTENT_WIDTH, y).stroke().restore();
      doc.y = y + 5;
    } else {
      setFont(doc, 9);
      doc.fillColor(COLORS.body).text(line || ' ', MARGIN + 14, doc.y + 2, { width: CONTENT_WIDTH - 14 });
    }
  }
  doc.y += 5;
}

/** Draws the blocks of a form (answers or an empty paper form) in the platform's PDF style. A table with many columns gets a landscape page. */
export function renderBlocks(doc: Doc, blocks: DocBlock[], hooks: { onSection?: (title: string) => void } = {}): void {
  let landscape = false;
  const backToPortrait = () => {
    if (!landscape) return;
    doc.addPage({ size: 'A4', layout: 'portrait', margins: { top: MARGIN, bottom: MARGIN + 12, left: MARGIN, right: MARGIN } });
    landscape = false;
  };
  const isWide = (block: DocBlock | undefined) => Boolean(block && block.kind === 'table' && block.columns.length > 7);
  for (const [index, block] of blocks.entries()) {
    // a section heading goes on the landscape page together with the wide table that follows it
    const wideHere = isWide(block) || (block.kind === 'section' && isWide(blocks[index + 1]));
    if (!wideHere) backToPortrait();
    else if (!landscape) {
      doc.addPage({ size: 'A4', layout: 'landscape', margins: { top: MARGIN, bottom: MARGIN + 12, left: MARGIN, right: MARGIN } });
      landscape = true;
    }
    // pdfkit starts an automatic page in portrait; on a landscape page the heading and table title move on with nextPage so the orientation stays
    if (landscape && (block.kind === 'section' || block.kind === 'table')) ensureSpace(doc, 90);
    if (block.kind === 'section') {
      if (block.pageBreak && !landscape) doc.addPage();
      sectionHeading(doc, block.title, { titleTa: undefined, note: block.note });
      hooks.onSection?.(block.title);
    } else if (block.kind === 'qa') {
      table(doc, {
        columns: [{ key: 'q', label: 'Question', width: 0.5 }, { key: 'a', label: 'Response', width: 0.48 }],
        rows: block.rows,
        maxRows: 800,
      });
      spacer(doc, 4);
    } else if (block.kind === 'checklist') {
      table(doc, {
        columns: [
          { key: '_sr', label: 'S.No', width: 0.07, align: 'center' as const },
          { key: 'item', label: 'Requirement / item', width: block.blank ? 0.45 : 0.65 },
          { key: 'response', label: 'Response', width: block.blank ? 0.46 : 0.26 },
        ],
        rows: block.rows.map((row) => ({ _sr: row.sr, item: row.item, response: row.response })),
        maxRows: 500,
      });
      spacer(doc, 4);
    } else if (block.kind === 'files') {
      setFont(doc, 8.5, { bold: true });
      ensureSpace(doc, 40);
      doc.fillColor(COLORS.ink).text(block.label, MARGIN, doc.y + 2, { width: CONTENT_WIDTH });
      for (const item of block.items) {
        setFont(doc, 9);
        doc.fillColor(COLORS.body).text(`Attached: ${item.name}`, MARGIN + 14, doc.y + 2, { width: CONTENT_WIDTH - 14 });
        if (!item.image) continue;
        const scale = Math.min(1, 380 / item.image.width, 300 / item.image.height);
        const w = Math.max(20, item.image.width * scale);
        const h = Math.max(20, item.image.height * scale);
        ensureSpace(doc, h + 12);
        const y = doc.y + 4;
        try {
          doc.image(item.image.data, MARGIN + 14, y, { width: w, height: h });
          doc.y = y + h + 6;
        } catch { /* an unreadable picture is skipped; its name is already printed */ }
      }
      doc.y += 4;
    } else if (block.kind === 'heading') {
      setFont(doc, 10.5, { bold: true });
      doc.fillColor(COLORS.ink).text(block.text, MARGIN, doc.y, { width: CONTENT_WIDTH });
      doc.moveDown(0.3);
    } else if (block.kind === 'divider') {
      doc.moveTo(MARGIN, doc.y + 3).lineTo(MARGIN + CONTENT_WIDTH, doc.y + 3).strokeColor(COLORS.line).lineWidth(0.5).stroke();
      doc.moveDown(0.6);
    } else if (block.kind === 'paragraph') {
      paragraph(doc, block.text, { size: 9 });
    } else if (block.kind === 'pair') {
      if (block.wide || block.label.length > 42 || /^\d+(\.\d+)*\.?\s/.test(block.label)) stackedPair(doc, block.label, block.value);
      else keyValues(doc, [{ label: block.label, value: block.value }], { columns: 2 });
    } else if (block.kind === 'table') {
      const width = doc.page.width - MARGIN * 2;
      const blankTable = block.rows.length > 0 && block.rows.every((row) => row.every((cell, index) => cell === '' || block.columns[index]?.key === '_sr'));
      const rows = block.rows.map((cells) => Object.fromEntries(block.columns.map((column, index) => [column.key, cells[index] ?? ''])));
      setFont(doc, 9.5, { bold: true });
      doc.fillColor(COLORS.ink).text(block.name, MARGIN, doc.y + 4, { width });
      doc.moveDown(0.3);
      table(doc, {
        columns: block.columns.map((column) => ({
          key: column.key, label: column.label, width: column.width, align: column.align,
          // an empty row on a paper form needs room to write
          render: (row: Record<string, unknown>) => (blankTable && String(row[column.key] ?? '') === '' ? '\u00A0\n\u00A0' : String(row[column.key] ?? '—')),
        })),
        rows,
        width,
        empty: block.emptyNote,
        maxRows: 400,
        overflowNote: (hidden) => `… ${hidden} more row(s) are held in the digital submission.`,
        footer: block.footer,
      });
    }
  }
}

/** The cover page of a report-style document: the organisation, the logo, the title and year, and who prepared it. */
function drawCover(doc: Doc, cover: ReportCover): void {
  const centred = { width: CONTENT_WIDTH, align: 'center' as const };
  doc.y = 80;
  setFont(doc, 17, { bold: true });
  doc.fillColor(COLORS.ink).text((cover.organisation || ' ').toUpperCase(), MARGIN, doc.y, centred);
  for (const line of [cover.address, cover.affiliation]) {
    if (!line) continue;
    setFont(doc, 10.5);
    doc.fillColor(COLORS.muted).text(line, MARGIN, doc.y + 4, centred);
  }
  if (cover.logo?.image) {
    const scale = Math.min(1, 150 / cover.logo.image.width, 150 / cover.logo.image.height);
    const w = cover.logo.image.width * scale;
    const h = cover.logo.image.height * scale;
    try {
      doc.image(cover.logo.image.data, (doc.page.width - w) / 2, doc.y + 26, { width: w, height: h });
      doc.y += h + 30;
    } catch { /* an unreadable logo is left out */ }
  }
  doc.y = Math.max(doc.y + 70, 340);
  setFont(doc, 24, { bold: true });
  doc.fillColor(COLORS.brand).text(cover.title.toUpperCase(), MARGIN, doc.y, centred);
  if (cover.period) {
    setFont(doc, 18, { bold: true });
    doc.fillColor(COLORS.ink).text(cover.period, MARGIN, doc.y + 10, centred);
  }
  if (cover.preparedBy) {
    setFont(doc, 9, { bold: true });
    doc.fillColor(COLORS.muted).text('PREPARED BY', MARGIN, 640, centred);
    setFont(doc, 13, { bold: true });
    doc.fillColor(COLORS.ink).text(cover.preparedBy, MARGIN, doc.y + 4, centred);
  }
  if (cover.reference) {
    setFont(doc, 8.5);
    doc.fillColor(COLORS.muted).text(`Reference: ${cover.reference}`, MARGIN, 730, centred);
  }
}

const CONTENTS_FIRST_PAGE = 30;
const CONTENTS_NEXT_PAGES = 40;
const contentsPagesFor = (count: number) => 1 + Math.max(0, Math.ceil((count - CONTENTS_FIRST_PAGE) / CONTENTS_NEXT_PAGES));

/** Writes the table of contents into the pages kept for it, once the chapters' page numbers are known. */
function drawContents(doc: Doc, firstPage: number, entries: { title: string; page: number }[]): void {
  const pages = contentsPagesFor(entries.length);
  let index = 0;
  for (let p = 0; p < pages; p += 1) {
    doc.switchToPage(firstPage + p);
    const saved = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    let y = MARGIN + 6;
    if (p === 0) {
      setFont(doc, 16, { bold: true });
      doc.fillColor(COLORS.brand).text('Table of Contents', MARGIN, y, { width: CONTENT_WIDTH, align: 'center' });
      y += 44;
      doc.save().rect(MARGIN, y, CONTENT_WIDTH, 18).fill(COLORS.headerBg).restore();
      setFont(doc, 8, { bold: true });
      doc.fillColor(COLORS.brand);
      doc.text('S. NO.', MARGIN + 6, y + 5, { width: 44, lineBreak: false });
      doc.text('CONTENT', MARGIN + 60, y + 5, { width: 360, lineBreak: false });
      doc.text('PAGE NO.', MARGIN + CONTENT_WIDTH - 66, y + 5, { width: 60, align: 'right', lineBreak: false });
      y += 24;
    }
    const capacity = p === 0 ? CONTENTS_FIRST_PAGE : CONTENTS_NEXT_PAGES;
    for (let row = 0; row < capacity && index < entries.length; row += 1, index += 1) {
      const entry = entries[index];
      setFont(doc, 9.5);
      doc.fillColor(COLORS.body);
      doc.text(String(index + 1), MARGIN + 6, y, { width: 44, lineBreak: false });
      doc.text(entry.title, MARGIN + 60, y, { width: CONTENT_WIDTH - 140, lineBreak: false, ellipsis: true });
      doc.text(String(entry.page), MARGIN + CONTENT_WIDTH - 66, y, { width: 60, align: 'right', lineBreak: false });
      doc.save().strokeColor(COLORS.line).lineWidth(0.4).moveTo(MARGIN, y + 14).lineTo(MARGIN + CONTENT_WIDTH, y + 14).stroke().restore();
      y += 19;
    }
    doc.page.margins.bottom = saved;
  }
}

export async function generateSubmissionPdf(input: SubmissionPdfInput): Promise<Buffer> {
  const { submission, form, module, structure, values, tableRows } = input;
  const report = String(form.output_style ?? 'standard') === 'report';
  const employerId = submission.employer_id ? Number(submission.employer_id) : null;
  const company = await companyInfo(employerId);

  const submissionNumber = String(submission.submission_number ?? '');
  const version = Number(submission.version ?? 1);
  const doc = createPdf({
    title: `${form.name ?? 'Submission'} — ${submissionNumber}`,
    subject: String(submission.title ?? form.name ?? ''),
    author: company.name,
  });

  let contentsPage = -1;
  const blocks = buildDocumentBlocks({ structure, values, tableRows, files: input.files, report });
  const entries: { title: string; page: number }[] = [];
  if (report) {
    drawCover(doc, reportCoverOf({ formName: String(form.name ?? 'Report'), structure, values, files: input.files, fallbackOrganisation: company.name }));
    doc.addPage();
    contentsPage = doc.bufferedPageRange().count - 1;
    const reserved = contentsPagesFor(blocks.filter((block) => block.kind === 'section').length);
    for (let i = 1; i < reserved; i += 1) doc.addPage();
    doc.addPage();
    keyValues(doc, [
      { label: 'Submission No.', value: submissionNumber },
      { label: 'Employer', value: String(submission.company_name ?? '—') },
      { label: 'Auditor', value: String(submission.auditor_name ?? '—') },
    ], { columns: 3 });
  } else {
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
  }

  /* ── sections ──────────────────────────────────────────────────────── */
  renderBlocks(doc, blocks, { onSection: (title) => entries.push({ title, page: doc.bufferedPageRange().count }) });

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

  if (report && contentsPage >= 0) drawContents(doc, contentsPage, entries);

  /* ── footer on every page ──────────────────────────────────────────── */
  stampFooters(doc, ({ index, total }) => ({
    left: report ? String(form.name ?? '').toUpperCase().slice(0, 48) : `${submissionNumber} · v${version}`,
    center: company.name,
    right: `Page ${index} of ${total}`,
  }));

  return renderPdf(doc);
}

export { COLORS };

/** The empty form, ready to print and fill in on site (every choice a tick box, every answer a ruled line, empty table rows). */
export async function generateBlankFormPdf(input: { form: Record<string, unknown>; module: Record<string, unknown>; structure: FormStructure }): Promise<Buffer> {
  const { form, module, structure } = input;
  const company = await companyInfo(null);
  const doc = createPdf({ title: String(form.name ?? 'Form'), subject: String(module.name ?? ''), author: company.name });
  letterhead(doc, {
    companyName: company.name,
    addressLines: company.addressLines,
    registrationLine: company.registrationLine,
    documentTitle: String(form.name ?? 'Form'),
    subtitle: form.description ? String(form.description) : undefined,
    metaRows: [
      { label: 'Module', value: String(module.name ?? '') },
      { label: 'Form version', value: `v${String(form.version ?? 1)}` },
      { label: 'Reference No.', value: '______________' },
      { label: 'Date', value: '____ / ____ / ________' },
    ],
  });
  renderBlocks(doc, buildDocumentBlocks({ structure, blank: true }));
  if (structure.requiresSignature) signatureBlock(doc, ['Completed by', 'Reviewed by', 'Authorised signatory']);
  stampFooters(doc, ({ index, total }) => ({ left: `${String(form.name ?? 'Form')} · v${String(form.version ?? 1)}`, center: company.name, right: `Page ${index} of ${total}` }));
  return renderPdf(doc);
}
