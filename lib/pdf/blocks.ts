/**
 * Layout blocks shared by the audit-style PDFs (CAPAR, groundwater NOC): a bordered header grid, a shaded heading bar and a
 * small caption-over-text field. Everything is drawn at absolute positions and measured first, so a block never splits
 * across a page break in the middle of a line.
 */
import { COLORS, CONTENT_WIDTH, MARGIN, ensureSpace, setFont, type Doc } from '@/lib/pdf/base';

export const BORDER = '#9ca3af';
export const BAND = '#eef2f7';

export function textHeight(doc: Doc, text: string, size: number, width: number, bold = false): number {
  setFont(doc, size, { bold });
  return doc.heightOfString(text || ' ', { width });
}

/** A bordered two-column header like the facility block of a third-party CAPAR. */
export function headerGrid(doc: Doc, cells: { label: string; value: string }[]) {
  const half = CONTENT_WIDTH / 2;
  for (let index = 0; index < cells.length; index += 2) {
    const pair = cells.slice(index, index + 2);
    const heights = pair.map((cell) => textHeight(doc, cell.value || '-', 9.5, half - 16) + 20);
    const height = Math.max(...heights, 30);
    ensureSpace(doc, height + 2);
    const y = doc.y;
    pair.forEach((cell, column) => {
      const x = MARGIN + column * half;
      doc.save().lineWidth(0.8).strokeColor(BORDER).rect(x, y, half, height).stroke().restore();
      setFont(doc, 7.5, { bold: true });
      doc.fillColor(COLORS.muted).text(cell.label.toUpperCase(), x + 8, y + 6, { width: half - 16 });
      setFont(doc, 9.5);
      doc.fillColor(COLORS.ink).text(cell.value || '-', x + 8, y + 17, { width: half - 16 });
    });
    doc.y = y + height;
  }
  doc.y += 10;
}

export function categoryBar(doc: Doc, title: string, note: string) {
  // The heading must never be left alone at the bottom of a page: it needs room for the first finding's opening lines too.
  ensureSpace(doc, 130);
  const y = doc.y;
  doc.save().rect(MARGIN, y, CONTENT_WIDTH, 20).fill(BAND).restore();
  doc.save().lineWidth(0.8).strokeColor(BORDER).rect(MARGIN, y, CONTENT_WIDTH, 20).stroke().restore();
  setFont(doc, 10, { bold: true });
  doc.fillColor(COLORS.brand).text(title.toUpperCase(), MARGIN + 8, y + 5, { width: CONTENT_WIDTH * 0.7, lineBreak: false });
  setFont(doc, 8.5);
  doc.fillColor(COLORS.muted).text(note, MARGIN + CONTENT_WIDTH * 0.7, y + 6, { width: CONTENT_WIDTH * 0.3 - 8, align: 'right', lineBreak: false });
  doc.y = y + 24;
}

export function labelled(doc: Doc, label: string, text: string, x: number, width: number) {
  const bodyHeight = textHeight(doc, text, 9, width);
  ensureSpace(doc, bodyHeight + 14);
  const y = doc.y;
  setFont(doc, 7.5, { bold: true });
  doc.fillColor(COLORS.muted).text(label.toUpperCase(), x, y, { width });
  setFont(doc, 9);
  doc.fillColor(COLORS.body).text(text, x, y + 10, { width });
  doc.y = y + 10 + bodyHeight + 4;
}
