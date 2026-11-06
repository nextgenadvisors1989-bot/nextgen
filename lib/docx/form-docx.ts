/**
 * Word (.docx) download of a dynamic form: the empty form to fill in on site, or the answers on record.
 * Built from the same blocks as the PDF (`lib/forms/form-document-model.ts`), so the two files carry the same content.
 * A table with many columns goes on landscape pages, the rest of the form stays portrait.
 */
import {
  AlignmentType, BorderStyle, Document, Footer, Header, HeadingLevel, ImageRun, PageBreak, PageOrientation, Packer, PageNumber, Paragraph, ShadingType, Table, TableCell,
  TableOfContents, TableRow, TextRun, WidthType,
} from 'docx';
import type { DocBlock, ReportCover } from '@/lib/forms/form-document-model';

const BRAND = '12346B';
const LINE = 'B8C2D4';
const HEAD_FILL = 'E8EEF8';
const FONT = 'Calibri';
const MARGIN_DXA = 1021; // 1.8 cm
/** A4 in twentieths of a point (dxa). */
const A4_W = 11906;
const A4_H = 16838;
const WIDE_COLUMNS = 7;

const border = { style: BorderStyle.SINGLE, size: 4, color: LINE };
const borders = { top: border, bottom: border, left: border, right: border };

export interface FormDocxInput {
  company: string;
  title: string;
  subtitle?: string;
  meta: { label: string; value: string }[];
  blocks: DocBlock[];
  signatures?: string[];
  footerLeft: string;
  /** A report-style document: a cover page and a table of contents come first. */
  cover?: ReportCover;
}

type Align = (typeof AlignmentType)[keyof typeof AlignmentType];

const run = (text: string, o: { bold?: boolean; size?: number; color?: string; italics?: boolean } = {}) =>
  new TextRun({ text, bold: o.bold, size: o.size ?? 19, color: o.color, italics: o.italics, font: FONT });

/** One paragraph per line of the value, so ruled answer lines and option lists keep their shape. */
const lines = (value: string, o: { size?: number; bold?: boolean; align?: Align } = {}) =>
  (value === '' ? [''] : value.split('\n')).map((line) => new Paragraph({ alignment: o.align, spacing: { before: 20, after: 20 }, children: [run(line, { size: o.size, bold: o.bold })] }));

function cell(children: Paragraph[], widthDxa: number, o: { fill?: string } = {}) {
  return new TableCell({
    width: { size: widthDxa, type: WidthType.DXA },
    borders,
    margins: { top: 50, bottom: 50, left: 90, right: 90 },
    shading: o.fill ? { type: ShadingType.CLEAR, color: 'auto', fill: o.fill } : undefined,
    children,
  });
}

function grid(widths: number[], head: string[] | null, rows: Paragraph[][][], sizes: { head?: number } = {}) {
  const out: TableRow[] = [];
  if (head) {
    out.push(new TableRow({
      tableHeader: true, cantSplit: true,
      children: head.map((label, index) => cell(lines(label.toUpperCase(), { size: sizes.head ?? 15, bold: true, align: widths[index] < 700 ? AlignmentType.CENTER : AlignmentType.LEFT }), widths[index], { fill: HEAD_FILL })),
    }));
  }
  for (const row of rows) out.push(new TableRow({ cantSplit: true, children: row.map((paragraphs, index) => cell(paragraphs, widths[index])) }));
  return new Table({ width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA }, columnWidths: widths, rows: out });
}

const gap = (after = 80) => new Paragraph({ spacing: { after }, children: [] });

/** The paragraphs and tables of a run of blocks, laid out for a page whose usable width is `page` dxa. */
function render(blocks: DocBlock[], page: number): (Paragraph | Table)[] {
  const body: (Paragraph | Table)[] = [];
  let pairs: Extract<DocBlock, { kind: 'pair' }>[] = [];
  const flushPairs = () => {
    if (!pairs.length) return;
    const label = Math.round(page * 0.34);
    body.push(grid([label, page - label], null, pairs.map((pair) => [lines(pair.label, { size: 17, bold: true }), lines(pair.value, { size: 18 })])), gap());
    pairs = [];
  };

  for (const block of blocks) {
    if (block.kind === 'pair') { pairs.push(block); continue; }
    flushPairs();
    if (block.kind === 'section') {
      body.push(new Paragraph({
        heading: HeadingLevel.HEADING_2, keepNext: true, pageBreakBefore: block.pageBreak, spacing: { before: 220, after: 80 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: BRAND, space: 2 } },
        children: [run(block.title, { bold: true, size: 24, color: BRAND })],
      }));
      if (block.note) body.push(new Paragraph({ spacing: { after: 80 }, children: [run(block.note, { size: 17, italics: true, color: '555555' })] }));
    } else if (block.kind === 'qa') {
      const q = Math.round(page * 0.5);
      body.push(grid([q, page - q], ['Question', 'Response'], block.rows.map((row) => [lines(row.q, { size: 18, bold: true }), lines(row.a, { size: 18 })])), gap());
    } else if (block.kind === 'files') {
      body.push(new Paragraph({ keepNext: true, spacing: { before: 100, after: 20 }, children: [run(block.label, { bold: true, size: 18 })] }));
      for (const item of block.items) {
        body.push(new Paragraph({ spacing: { before: 20, after: 20 }, indent: { left: 280 }, children: [run(`Attached: ${item.name}`, { size: 18 })] }));
        if (!item.image) continue;
        const scale = Math.min(1, 440 / item.image.width, 340 / item.image.height);
        body.push(new Paragraph({
          spacing: { before: 40, after: 100 }, indent: { left: 280 },
          children: [new ImageRun({ type: item.image.format, data: item.image.data, transformation: { width: Math.max(20, Math.round(item.image.width * scale)), height: Math.max(20, Math.round(item.image.height * scale)) } })],
        }));
      }
    } else if (block.kind === 'heading') {
      body.push(new Paragraph({ keepNext: true, spacing: { before: 120, after: 40 }, children: [run(block.text, { bold: true, size: 21 })] }));
    } else if (block.kind === 'paragraph') {
      body.push(new Paragraph({ spacing: { before: 40, after: 80 }, children: [run(block.text, { size: 18 })] }));
    } else if (block.kind === 'divider') {
      body.push(new Paragraph({ spacing: { after: 80 }, border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: LINE, space: 1 } }, children: [] }));
    } else if (block.kind === 'checklist') {
      const sr = Math.round(page * 0.07);
      const item = Math.round(page * (block.blank ? 0.45 : 0.65));
      body.push(grid([sr, item, page - sr - item], ['S.No', 'Requirement / item', 'Response'],
        block.rows.map((row) => [lines(String(row.sr), { size: 17, align: AlignmentType.CENTER }), lines(row.item, { size: 18 }), lines(row.response, { size: 17 })])), gap());
    } else if (block.kind === 'table') {
      body.push(new Paragraph({ keepNext: true, spacing: { before: 120, after: 40 }, children: [run(block.name, { bold: true, size: 20 })] }));
      let widths = block.columns.map((column) => Math.max(Math.round(column.width * page), 500));
      const sum = widths.reduce((a, b) => a + b, 0);
      widths = widths.map((w) => Math.round((w / sum) * page));
      const small = block.columns.length > WIDE_COLUMNS;
      const size = small ? 15 : 17;
      const dataRows = block.rows.length
        ? block.rows.map((cells) => cells.map((value, index) => lines(value === '' ? ' ' : value, { size, align: block.columns[index].align === 'right' ? AlignmentType.RIGHT : block.columns[index].key === '_sr' ? AlignmentType.CENTER : AlignmentType.LEFT })))
        : [block.columns.map((_, index) => lines(index === 0 ? block.emptyNote : '', { size }))];
      // an empty row on a paper form needs room to write
      const blankTable = block.rows.length > 0 && block.rows.every((row) => row.every((value, index) => value === '' || block.columns[index].key === '_sr'));
      if (blankTable) for (const row of dataRows) for (const paragraphs of row) paragraphs.push(new Paragraph({ spacing: { before: 0, after: 0 }, children: [run(' ', { size })] }));
      body.push(grid(widths, block.columns.map((column) => column.label), dataRows, { head: small ? 14 : 15 }));
      if (block.footer) body.push(new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 40 }, children: [run(block.footer, { bold: true, size: 17, color: BRAND })] }));
      body.push(gap());
    }
  }
  flushPairs();
  return body;
}

export async function buildFormDocx(input: FormDocxInput): Promise<Buffer> {
  const portrait = A4_W - 2 * MARGIN_DXA;
  const landscape = A4_H - 2 * MARGIN_DXA;

  const head: (Paragraph | Table | TableOfContents)[] = [];
  const cover = input.cover;
  if (cover) {
    const centred = (text: string, o: { size?: number; bold?: boolean; color?: string; before?: number; after?: number }) =>
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: o.before ?? 0, after: o.after ?? 80 }, children: [run(text, { size: o.size, bold: o.bold, color: o.color })] });
    head.push(centred((cover.organisation || input.company).toUpperCase(), { size: 34, bold: true, before: 1200 }));
    if (cover.address) head.push(centred(cover.address, { size: 21, color: '555555' }));
    if (cover.affiliation) head.push(centred(cover.affiliation, { size: 21, color: '555555' }));
    if (cover.logo?.image) {
      const scale = Math.min(1, 190 / cover.logo.image.width, 190 / cover.logo.image.height);
      head.push(new Paragraph({
        alignment: AlignmentType.CENTER, spacing: { before: 400, after: 400 },
        children: [new ImageRun({ type: cover.logo.image.format, data: cover.logo.image.data, transformation: { width: Math.max(20, Math.round(cover.logo.image.width * scale)), height: Math.max(20, Math.round(cover.logo.image.height * scale)) } })],
      }));
    }
    head.push(centred(cover.title.toUpperCase(), { size: 52, bold: true, color: BRAND, before: cover.logo?.image ? 800 : 2400, after: 160 }));
    if (cover.period) head.push(centred(cover.period, { size: 36, bold: true }));
    if (cover.preparedBy) {
      head.push(centred('PREPARED BY', { size: 18, bold: true, color: '777777', before: 1800 }));
      head.push(centred(cover.preparedBy, { size: 26, bold: true }));
    }
    if (cover.reference) head.push(centred(`Reference: ${cover.reference}`, { size: 17, color: '777777', before: 600 }));
    head.push(new Paragraph({ children: [new PageBreak()] }));
    head.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [run('Table of Contents', { size: 32, bold: true, color: BRAND })] }));
    head.push(new TableOfContents('Table of Contents', { hyperlink: true, headingStyleRange: '2-2' }));
    head.push(new Paragraph({ children: [new PageBreak()] }));
  }
  if (!cover) head.push(new Paragraph({ spacing: { after: 40 }, children: [run(input.company.toUpperCase(), { bold: true, size: 26, color: BRAND })] }));
  if (!cover) head.push(new Paragraph({ heading: HeadingLevel.TITLE, spacing: { after: 40 }, children: [run(input.title, { bold: true, size: 36, color: BRAND })] }));
  if (input.subtitle && !cover) head.push(new Paragraph({ spacing: { after: 100 }, children: [run(input.subtitle, { size: 19, color: '555555' })] }));
  if (input.meta.length) {
    const quarter = Math.floor(portrait / 4);
    const rows: Paragraph[][][] = [];
    for (let i = 0; i < input.meta.length; i += 2) {
      const a = input.meta[i];
      const b = input.meta[i + 1];
      rows.push([lines(a.label.toUpperCase(), { size: 15, bold: true }), lines(a.value, { size: 18 }), lines(b?.label.toUpperCase() ?? '', { size: 15, bold: true }), lines(b?.value ?? '', { size: 18 })]);
    }
    head.push(grid([quarter - 200, quarter + 200, quarter - 200, quarter + 200], null, rows), gap(120));
  }

  // consecutive blocks share a section unless one of them is a table too wide for a portrait page
  const groups: { landscape: boolean; blocks: DocBlock[] }[] = [];
  for (const block of input.blocks) {
    const wide = block.kind === 'table' && block.columns.length > WIDE_COLUMNS;
    const last = groups[groups.length - 1];
    if (last && last.landscape === wide) last.blocks.push(block);
    else groups.push({ landscape: wide, blocks: [block] });
  }
  if (!groups.length) groups.push({ landscape: false, blocks: [] });

  const signatures: (Paragraph | Table)[] = [];
  if (input.signatures?.length) {
    signatures.push(new Paragraph({ spacing: { before: 360 }, children: [] }));
    const width = Math.floor(portrait / input.signatures.length);
    const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
    signatures.push(new Table({
      width: { size: width * input.signatures.length, type: WidthType.DXA }, columnWidths: input.signatures.map(() => width),
      rows: [new TableRow({ cantSplit: true, children: input.signatures.map((label) => new TableCell({
        width: { size: width, type: WidthType.DXA },
        borders: { top: { style: BorderStyle.SINGLE, size: 6, color: '777777' }, bottom: none, left: none, right: none },
        margins: { top: 60, left: 60, right: 200 },
        children: [new Paragraph({ children: [run(label, { size: 16, color: '555555' })] }), new Paragraph({ children: [run('Name / date', { size: 14, color: '888888' })] })],
      })) })],
    }));
  }

  const header = () => new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [run(input.company, { size: 15, color: '888888' })] })] });
  const footer = () => new Footer({ children: [new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [run(`${input.footerLeft}   ·   Page `, { size: 15, color: '888888' }), new TextRun({ children: [PageNumber.CURRENT], size: 15, color: '888888', font: FONT }), run(' of ', { size: 15, color: '888888' }), new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 15, color: '888888', font: FONT })],
  })] });

  const sections = groups.map((group, index) => ({
    properties: {
      page: {
        size: { width: A4_W, height: A4_H, orientation: group.landscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT },
        margin: { top: MARGIN_DXA, bottom: MARGIN_DXA, left: MARGIN_DXA, right: MARGIN_DXA },
      },
    },
    headers: { default: header() },
    footers: { default: footer() },
    children: [
      ...(index === 0 ? head : []),
      ...render(group.blocks, group.landscape ? landscape : portrait),
      ...(index === groups.length - 1 ? signatures : []),
    ],
  }));

  const doc = new Document({
    creator: input.company,
    title: input.title,
    styles: { default: { document: { run: { font: FONT, size: 19 } } } },
    features: { updateFields: Boolean(cover) },
    sections,
  });
  return Buffer.from(await Packer.toBuffer(doc));
}
