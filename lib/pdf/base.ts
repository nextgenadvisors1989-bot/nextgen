/**
 * Shared PDF layout engine.
 *
 * Everything a report needs to look like it came off the same letterhead:
 * document setup, the company header block, section headings, label/value
 * grids, data tables with repeating headers across page breaks, signature
 * blocks and the page footer that carries the report number.
 *
 * Layout is absolute-coordinate based (x/y passed to every `text()` call) so a
 * footer can be stamped onto already-rendered pages without pdfkit deciding to
 * start a new one.
 */
import PDFDocument from 'pdfkit';
import { registerFonts, fontFor, type FontOptions } from './fonts';

export type Doc = PDFKit.PDFDocument;

export const COLORS = {
  ink: '#111827',
  body: '#1f2937',
  muted: '#6b7280',
  line: '#e5e7eb',
  headerBg: '#f8fafc',
  brand: '#1e293b',
  accent: '#3b82f6',
  success: '#047857',
  danger: '#b91c1c',
};

export const MARGIN = 40;
export const CONTENT_WIDTH = 595.28 - MARGIN * 2; // A4 width in points minus margins

export interface PdfMeta {
  title: string;
  subject?: string;
  author?: string;
  keywords?: string;
}

export function createPdf(meta: PdfMeta, options: { landscape?: boolean } = {}): Doc {
  const doc = new PDFDocument({
    size: 'A4',
    layout: options.landscape ? 'landscape' : 'portrait',
    margins: { top: MARGIN, bottom: MARGIN + 12, left: MARGIN, right: MARGIN },
    bufferPages: true,
    info: {
      Title: meta.title,
      Author: meta.author ?? 'ComplianceOS',
      Subject: meta.subject ?? meta.title,
      Keywords: meta.keywords ?? 'compliance, audit, statutory register',
      Creator: 'ComplianceOS',
      Producer: 'ComplianceOS',
    },
  });
  registerFonts(doc);
  doc.font(fontFor());
  doc.fillColor(COLORS.body);

  // The bundled Noto Sans subsets carry no en / em dash glyph, so a dash would print as an empty box.
  // Every string drawn or measured goes through this, and the dashes become plain hyphens.
  const plain = (value: unknown) => (typeof value === 'string' ? value.replace(/[–—]/g, '-') : value);
  const d = doc as unknown as Record<string, (...args: unknown[]) => unknown>;
  const draw = d.text.bind(doc);
  d.text = (value: unknown, ...rest: unknown[]) => draw(plain(value), ...rest);
  const measure = d.heightOfString.bind(doc);
  d.heightOfString = (value: unknown, ...rest: unknown[]) => measure(plain(value), ...rest);
  return doc;
}

/** Collect the finished document as a Buffer for a route to stream back. */
export function renderPdf(doc: Doc): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

/* ------------------------------------------------------------------ layout */

export function setFont(doc: Doc, size: number, options: FontOptions = {}): void {
  doc.font(fontFor(options)).fontSize(size);
}

export function line(doc: Doc, color = COLORS.line, width = 0.7): void {
  const y = doc.y;
  doc.save().strokeColor(color).lineWidth(width)
    .moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_WIDTH, y).stroke().restore();
  doc.y = y + 6;
}

export function ensureSpace(doc: Doc, needed: number): void {
  const limit = doc.page.height - doc.page.margins.bottom;
  if (doc.y + needed > limit) doc.addPage();
}

export interface LetterheadOptions {
  companyName: string;
  addressLines?: string[];
  registrationLine?: string;
  documentTitle: string;
  subtitle?: string;
  /** Bilingual document title shown under the English one. */
  titleTa?: string;
  metaRows?: { label: string; value: string }[];
}

/** Company header + document title + the small meta table on the right. */
export function letterhead(doc: Doc, options: LetterheadOptions): void {
  const top = MARGIN;
  const leftWidth = CONTENT_WIDTH * 0.62;
  const metaWidth = CONTENT_WIDTH - leftWidth - 12;

  // The company name may wrap onto a second line; everything beneath it starts below however tall it is.
  setFont(doc, 15, { bold: true });
  const nameHeight = doc.heightOfString(options.companyName.toUpperCase(), { width: leftWidth });
  doc.fillColor(COLORS.brand).text(options.companyName.toUpperCase(), MARGIN, top, { width: leftWidth });
  let leftY = top + nameHeight + 3;

  const addressLines = (options.addressLines ?? []).filter(Boolean);
  if (addressLines.length) {
    setFont(doc, 8.5);
    const text = addressLines.join('  |  ');
    doc.fillColor(COLORS.muted).text(text, MARGIN, leftY, { width: leftWidth });
    leftY += doc.heightOfString(text, { width: leftWidth }) + 2;
  }
  if (options.registrationLine) {
    setFont(doc, 8);
    doc.fillColor(COLORS.muted).text(options.registrationLine, MARGIN, leftY, { width: leftWidth });
    leftY += doc.heightOfString(options.registrationLine, { width: leftWidth }) + 2;
  }
  doc.y = leftY;

  if (options.metaRows?.length) {
    const metaX = MARGIN + leftWidth + 12;
    let metaY = top - 2;
    for (const row of options.metaRows) {
      setFont(doc, 7.5, { bold: true });
      doc.fillColor(COLORS.muted).text(row.label.toUpperCase(), metaX, metaY, { width: metaWidth, align: 'right' });
      setFont(doc, 9);
      const valueHeight = doc.heightOfString(row.value || '-', { width: metaWidth });
      doc.fillColor(COLORS.ink).text(row.value, metaX, metaY + 9, { width: metaWidth, align: 'right' });
      metaY += 14 + valueHeight; // a long value (module name + version) wraps; the next row starts below it
    }
    doc.y = metaY;
  }

  const ruleY = Math.max(top + 46, doc.y + 8, leftY + 8);
  doc.save().strokeColor(COLORS.brand).lineWidth(1.4)
    .moveTo(MARGIN, ruleY).lineTo(MARGIN + CONTENT_WIDTH, ruleY).stroke().restore();

  setFont(doc, 13, { bold: true });
  doc.fillColor(COLORS.brand).text(options.documentTitle, MARGIN, ruleY + 10, { width: CONTENT_WIDTH });
  let y = doc.y + 2;

  if (options.titleTa) {
    setFont(doc, 10.5, { tamil: true });
    doc.fillColor(COLORS.body).text(options.titleTa, MARGIN, y, { width: CONTENT_WIDTH });
    y = doc.y + 2;
  }
  if (options.subtitle) {
    setFont(doc, 9);
    doc.fillColor(COLORS.muted).text(options.subtitle, MARGIN, y, { width: CONTENT_WIDTH });
    y = doc.y + 2;
  }

  doc.y = y + 8;
}

export function sectionHeading(doc: Doc, title: string, options: { titleTa?: string; note?: string } = {}): void {
  ensureSpace(doc, options.titleTa ? 46 : 34);
  const y = doc.y;
  doc.save().rect(MARGIN, y, CONTENT_WIDTH, 18).fill(COLORS.headerBg).restore();
  setFont(doc, 10, { bold: true });
  doc.fillColor(COLORS.brand).text(title.toUpperCase(), MARGIN + 6, y + 4, { width: CONTENT_WIDTH - 12, lineBreak: false });
  doc.y = y + 22;

  if (options.titleTa) {
    setFont(doc, 8.5, { tamil: true });
    doc.fillColor(COLORS.muted).text(options.titleTa, MARGIN + 6, doc.y, { width: CONTENT_WIDTH - 12 });
    doc.y += 2;
  }
  if (options.note) {
    setFont(doc, 8);
    doc.fillColor(COLORS.muted).text(options.note, MARGIN + 6, doc.y, { width: CONTENT_WIDTH - 12 });
    doc.y += 2;
  }
  doc.y += 4;
}

export interface KeyValuePair {
  label: string;
  value: string;
  labelTa?: string;
}

/** Two-column label/value grid — the standard way details are listed. */
export function keyValues(doc: Doc, pairs: KeyValuePair[], options: { columns?: 1 | 2 | 3 | 4; labelWidth?: number } = {}): void {
  const columns = options.columns ?? 2;
  const labelWidth = options.labelWidth ?? 92;
  const columnWidth = CONTENT_WIDTH / columns;
  let column = 0;
  let rowTop = doc.y;
  let rowHeight = 0;

  for (const pair of pairs) {
    const valueWidth = columnWidth - labelWidth - 14;
    const x = MARGIN + column * columnWidth;

    setFont(doc, 7.5, { bold: true });
    const labelHeight = doc.heightOfString(pair.label.toUpperCase(), { width: labelWidth });
    setFont(doc, 9);
    const valueHeight = doc.heightOfString(pair.value || '—', { width: valueWidth });
    const height = Math.max(labelHeight, valueHeight) + 5;

    if (rowTop + height > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      rowTop = doc.y;
      column = 0;
      rowHeight = 0;
    }

    setFont(doc, 7.5, { bold: true });
    doc.fillColor(COLORS.muted).text(pair.label.toUpperCase(), x, rowTop + 1, { width: labelWidth });
    if (pair.labelTa) {
      setFont(doc, 7, { tamil: true });
      doc.fillColor(COLORS.muted).text(pair.labelTa, x, rowTop + 9, { width: labelWidth });
    }
    setFont(doc, 9);
    doc.fillColor(COLORS.ink).text(pair.value || '—', x + labelWidth + 6, rowTop + 1, { width: valueWidth });

    rowHeight = Math.max(rowHeight, height);
    column += 1;
    if (column === columns) {
      column = 0;
      rowTop += rowHeight;
      rowHeight = 0;
    }
  }

  if (column !== 0) rowTop += rowHeight;
  doc.y = rowTop + 6;
}

export interface TableColumn {
  key: string;
  label: string;
  /** Share of the content width, e.g. 0.2 for a fifth. */
  width: number;
  align?: 'left' | 'right' | 'center';
  /** Optional cell formatter; defaults to `String(row[key])`. Unknown values print as a dash. */
  render?: (row: Record<string, unknown>, index: number) => string;
}

export interface TableOptions {
  columns: TableColumn[];
  rows: Record<string, unknown>[];
  empty?: string;
  /** Rows beyond this count are summarised instead of printed (keeps page counts bounded). */
  maxRows?: number;
  overflowNote?: (hidden: number) => string;
  /** Optional totals strip printed under the last row. */
  footer?: string;
}

/** Zebra-striped table with a header that repeats after every page break. */
export function table(doc: Doc, options: TableOptions): void {
  const { columns, rows } = options;
  const maxRows = options.maxRows ?? rows.length;

  if (!rows.length) {
    setFont(doc, 8.5);
    doc.fillColor(COLORS.muted).text(options.empty ?? 'No records to display.', MARGIN + 4, doc.y + 2, { width: CONTENT_WIDTH - 8 });
    doc.y += 14;
    return;
  }

  const widths = columns.map((column) => column.width * CONTENT_WIDTH);
  const visible = rows.slice(0, maxRows);

  // Header labels wrap inside their column; the band grows to the tallest label (narrow columns, long names).
  const headerHeight = () => {
    setFont(doc, 7.5, { bold: true });
    return Math.max(18, ...columns.map((column, index) => doc.heightOfString(column.label.toUpperCase(), { width: widths[index] - 8 }) + 10));
  };
  const drawHeader = () => {
    const height = headerHeight();
    ensureSpace(doc, height + 14);
    const y = doc.y;
    doc.save().rect(MARGIN, y, CONTENT_WIDTH, height).fill(COLORS.headerBg).restore();
    let x = MARGIN;
    columns.forEach((column, index) => {
      setFont(doc, 7.5, { bold: true });
      doc.fillColor(COLORS.brand).text(column.label.toUpperCase(), x + 4, y + 5, {
        width: widths[index] - 8, align: column.align ?? 'left',
      });
      x += widths[index];
    });
    doc.y = y + height;
  };

  drawHeader();

  const cellHeight = (row: Record<string, unknown>) => {
    let height = 0;
    columns.forEach((column, index) => {
      setFont(doc, 8.5);
      height = Math.max(height, doc.heightOfString(cellText(column, row), { width: widths[index] - 8 }));
    });
    return height + 8;
  };

  visible.forEach((row, rowIndex) => {
    const height = cellHeight(row);
    if (doc.y + height > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      drawHeader();
    }
    const y = doc.y;
    if (rowIndex % 2 === 1) {
      doc.save().rect(MARGIN, y, CONTENT_WIDTH, height).fill('#fcfcfd').restore();
    }
    let x = MARGIN;
    columns.forEach((column, index) => {
      setFont(doc, 8.5);
      doc.fillColor(COLORS.body).text(cellText(column, row, rowIndex), x + 4, y + 4, {
        width: widths[index] - 8, align: column.align ?? 'left',
      });
      x += widths[index];
    });
    doc.save().strokeColor(COLORS.line).lineWidth(0.5)
      .moveTo(MARGIN, y + height).lineTo(MARGIN + CONTENT_WIDTH, y + height).stroke().restore();
    doc.y = y + height;
  });

  if (options.footer) {
    setFont(doc, 8.5, { bold: true });
    doc.fillColor(COLORS.brand).text(options.footer, MARGIN + CONTENT_WIDTH * 0.42, doc.y + 5, {
      width: CONTENT_WIDTH * 0.58, align: 'right',
    });
    doc.y += 16;
  }

  if (rows.length > visible.length) {
    const hidden = rows.length - visible.length;
    setFont(doc, 8);
    doc.fillColor(COLORS.muted).text(
      options.overflowNote ? options.overflowNote(hidden) : `…and ${hidden} more row(s), available in the digital record.`,
      MARGIN + 4, doc.y + 3, { width: CONTENT_WIDTH - 8 }
    );
    doc.y += 12;
  }

  doc.y += 6;
}

/** Cell text for a table column: custom renderer first, then the raw key. */
function cellText(column: TableColumn, row: Record<string, unknown>, index = 0): string {
  if (column.render) return String(column.render(row, index) ?? '—');
  const value = row[column.key];
  return value === null || value === undefined || value === '' ? '—' : String(value);
}

export function paragraph(doc: Doc, text: string, options: { size?: number; tamil?: boolean; bold?: boolean; color?: string } = {}): void {
  ensureSpace(doc, 28);
  setFont(doc, options.size ?? 9, { bold: options.bold, tamil: options.tamil });
  doc.fillColor(options.color ?? COLORS.body).text(text, MARGIN, doc.y, { width: CONTENT_WIDTH, align: 'justify' });
  doc.y += 6;
}

export function bullets(doc: Doc, items: string[]): void {
  for (const item of items) {
    ensureSpace(doc, 20);
    setFont(doc, 9);
    doc.fillColor(COLORS.accent).text('•', MARGIN + 2, doc.y, { width: 10 });
    doc.fillColor(COLORS.body).text(item, MARGIN + 14, doc.y - 10.5, { width: CONTENT_WIDTH - 14 });
    doc.y += 3;
  }
  doc.y += 4;
}

/** Tick / cross with a label, used by the personal-file checklist. */
export function checklistGrid(doc: Doc, items: { label: string; done: boolean; remark?: string | null }[]): void {
  const columnWidth = CONTENT_WIDTH / 2;
  let column = 0;
  let rowTop = doc.y;
  let rowHeight = 0;

  for (const item of items) {
    const height = 15;
    if (rowTop + height > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      rowTop = doc.y;
      column = 0;
      rowHeight = 0;
    }
    const x = MARGIN + column * columnWidth;
    setFont(doc, 9, { bold: true });
    doc.fillColor(item.done ? COLORS.success : COLORS.danger).text(item.done ? '☑' : '☐', x, rowTop + 1, { width: 12, lineBreak: false });
    setFont(doc, 8.5);
    doc.fillColor(COLORS.body).text(
      item.remark ? `${item.label} — ${item.remark}` : item.label,
      x + 14, rowTop + 1, { width: columnWidth - 22 }
    );
    rowHeight = Math.max(rowHeight, height);
    column += 1;
    if (column === 2) {
      column = 0;
      rowTop += rowHeight;
      rowHeight = 0;
    }
  }

  if (column !== 0) rowTop += rowHeight;
  doc.y = rowTop + 8;
}

export function signatureBlock(doc: Doc, labels: string[], options: { note?: string } = {}): void {
  ensureSpace(doc, 62);
  doc.y += 18;
  const columnWidth = CONTENT_WIDTH / labels.length;
  const y = doc.y;
  labels.forEach((label, index) => {
    const x = MARGIN + index * columnWidth;
    doc.save().strokeColor(COLORS.muted).lineWidth(0.6)
      .moveTo(x + 8, y).lineTo(x + columnWidth - 24, y).stroke().restore();
    setFont(doc, 8);
    doc.fillColor(COLORS.muted).text(label, x + 8, y + 4, { width: columnWidth - 24 });
  });
  doc.y = y + 30;
  if (options.note) {
    setFont(doc, 7.5);
    doc.fillColor(COLORS.muted).text(options.note, MARGIN, doc.y, { width: CONTENT_WIDTH });
    doc.y += 10;
  }
}

export function spacer(doc: Doc, height = 8): void {
  doc.y += height;
}

/**
 * Stamps a footer on every buffered page. Absolute coordinates are used so a
 * footer never pushes content onto a fresh page.
 */
export function stampFooters(
  doc: Doc,
  render: (page: { index: number; total: number; y: number; width: number }) => { left?: string; center?: string; right?: string }
): void {
  const range = doc.bufferedPageRange();
  const total = range.count;
  const footerY = doc.page.height - MARGIN - 6;

  for (let index = 0; index < total; index += 1) {
    doc.switchToPage(range.start + index);
    // Footers are stamped below the text frame; dropping the bottom margin for
    // the duration stops pdfkit from treating each stamp as an overflow and
    // spawning a fresh page (which would grow the document on every pass).
    const savedBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    const parts = render({ index: index + 1, total, y: footerY, width: CONTENT_WIDTH });
    doc.save().strokeColor(COLORS.line).lineWidth(0.5)
      .moveTo(MARGIN, footerY - 8).lineTo(MARGIN + CONTENT_WIDTH, footerY - 8).stroke().restore();

    setFont(doc, 7.5);
    doc.fillColor(COLORS.muted);
    if (parts.left) doc.text(parts.left, MARGIN, footerY, { width: CONTENT_WIDTH / 3, lineBreak: false });
    if (parts.center) doc.text(parts.center, MARGIN + CONTENT_WIDTH / 3, footerY, { width: CONTENT_WIDTH / 3, align: 'center', lineBreak: false });
    if (parts.right) doc.text(parts.right, MARGIN + (CONTENT_WIDTH * 2) / 3, footerY, { width: CONTENT_WIDTH / 3, align: 'right', lineBreak: false });

    doc.page.margins.bottom = savedBottom;
  }
}
