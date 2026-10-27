/**
 * The premium service price quotation: a corporate layout with the firm's brand pillars, client and subject panels, an itemised fee table with
 * an icon per service, price summary, inclusions, notes, payment terms, the acceptance sign-off and a contact bar.
 * One A4 page for about ten service lines; more lines continue on a second page with the table header repeated.
 */
import { BRAND_PILLARS, DEFAULT_OBJECTIVE, DEFAULT_PAYMENT_TERMS, DEFAULT_QUOTATION_ELEMENTS, DEFAULT_QUOTATION_NOTES, DEFAULT_SUBJECT, serviceIcon } from '@/lib/billing/defaults';
import { badge, drawIcon } from '@/lib/pdf/icons';
import { createPdf, renderPdf, setFont, type Doc } from '@/lib/pdf/base';
import { seller, type Seller } from '@/lib/pdf/billing-seller';
import { formatDate } from '@/lib/utils/dates';
import { numberToWords } from '@/lib/utils/formatting';
import { getQuotation, type BillingScope } from '@/services/billing.service';

const NAVY = '#12346B';
const BLUE = '#1B4A93';
const GREEN = '#1F8A3B';
const ORANGE = '#D96A12';
const PURPLE = '#5A3E9E';
const INK = '#1F2937';
const MUTED = '#6B7280';
const LINE = '#C9D3E3';
const PALE = '#F3F6FB';
const M = 26;
const W = 595.28 - M * 2;
const FOOTER = 26;
const TB = 15; /* height of a title bar */

const n = (value: unknown) => Number(value ?? 0);
const t = (value: unknown, fallback = '-') => (value === null || value === undefined || value === '' ? fallback : String(value));
const inr = (value: unknown) => n(value).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const inr2 = (value: unknown) => n(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function text(doc: Doc, value: string, x: number, y: number, width: number, o: { size?: number; bold?: boolean; color?: string; align?: 'left' | 'center' | 'right'; lineGap?: number } = {}): number {
  setFont(doc, o.size ?? 7, { bold: o.bold });
  const saved = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;
  doc.fillColor(o.color ?? INK).text(value, x, y, { width, align: o.align ?? 'left', lineGap: o.lineGap ?? 1 });
  doc.page.margins.bottom = saved;
  return doc.y;
}

const heightOf = (doc: Doc, value: string, width: number, size: number, bold = false) => {
  setFont(doc, size, { bold });
  return doc.heightOfString(value, { width, lineGap: 1 });
};

function fillRect(doc: Doc, x: number, y: number, w: number, h: number, fill: string, stroke?: string): void {
  doc.save().fillColor(fill).rect(x, y, w, h).fill();
  if (stroke) doc.strokeColor(stroke).lineWidth(0.6).rect(x, y, w, h).stroke();
  doc.restore();
}

function frame(doc: Doc, x: number, y: number, w: number, h: number): void {
  doc.save().strokeColor(LINE).lineWidth(0.7).rect(x, y, w, h).stroke().restore();
}

/** A coloured title bar with an icon. */
function titleBar(doc: Doc, x: number, y: number, w: number, label: string, color: string, icon?: string, align: 'left' | 'center' = 'left'): number {
  fillRect(doc, x, y, w, TB, color);
  if (icon) drawIcon(doc, icon, x + 12, y + TB / 2, 9, '#FFFFFF', 1.8);
  text(doc, label, x + (icon ? 24 : 8), y + 4.4, w - (icon ? 30 : 16), { size: 7.8, bold: true, color: '#FFFFFF', align });
  return y + TB;
}

function bullet(doc: Doc, x: number, y: number, color: string): void {
  doc.save().fillColor(color).moveTo(x, y).lineTo(x + 4, y + 2.4).lineTo(x, y + 4.8).closePath().fill().restore();
}

export async function generatePremiumQuotation(id: number, scope: BillingScope): Promise<Buffer> {
  const [q, s] = await Promise.all([getQuotation(id, scope), seller()]);
  const doc = createPdf({ title: `Quotation ${String(q.quotation_number)}`, subject: String(q.client_name), author: s.name });
  const H = doc.page.height;
  const limit = () => H - FOOTER - 6;
  let y = 24;

  /* ───────── header ───────── */
  if (s.logo) { try { doc.image(s.logo, M, y, { fit: [74, 66] }); } catch { /* an unreadable logo is skipped */ } }
  const nameX = M + (s.logo ? 82 : 0);
  const rightW = 176;
  const nameW = W - rightW - (nameX - M) - 14;
  y = text(doc, s.brandName.toUpperCase(), nameX, y, nameW, { size: s.brandName.length > 26 ? 12.5 : 17, bold: true, color: NAVY, lineGap: 0 });
  if (s.quotationTagline) y = text(doc, s.quotationTagline, nameX, y + 1, nameW, { size: 9, bold: true, color: GREEN });
  y = text(doc, BRAND_PILLARS.map((p) => p.label).join('  •  '), nameX, y + 3, nameW, { size: 5.2, bold: true, color: BLUE });
  // brand pillars: seven circles with their labels
  const pillarW = nameW / BRAND_PILLARS.length;
  const pillarY = y + 13;
  BRAND_PILLARS.forEach((pillar, i) => {
    const cx = nameX + pillarW * i + pillarW / 2;
    badge(doc, pillar.icon, cx, pillarY, 10, pillar.color);
    text(doc, pillar.label, cx - pillarW / 2 + 1, pillarY + 13, pillarW - 2, { size: 4.4, bold: true, color: NAVY, align: 'center', lineGap: 0 });
  });
  const headerBottom = Math.max(pillarY + 13 + 11, 24 + 38 + 5 * 10 + 8);
  // quotation title box and its facts
  const rx = M + W - rightW;
  fillRect(doc, rx, 24, rightW, 38, NAVY);
  text(doc, 'SERVICE PRICE\nQUOTATION', rx, 28.5, rightW, { size: 11.5, bold: true, color: '#FFFFFF', align: 'center', lineGap: 0.5 });
  const facts: [string, string][] = [['Quotation No.', String(q.quotation_number)], ['Date', formatDate(q.quote_date)], ['Valid Upto', q.valid_until ? formatDate(q.valid_until) : '-'],
    ['Service Period', t(q.service_period, 'Monthly / Renewable')], ['Currency', 'Indian Rupees (INR)']];
  let fy = 68;
  for (const [label, value] of facts) {
    text(doc, label, rx + 4, fy, 66, { size: 6.6, color: INK });
    text(doc, `:  ${value}`, rx + 70, fy, rightW - 72, { size: 6.6, bold: true, color: INK });
    fy += 10;
  }
  y = headerBottom;
  doc.save().strokeColor(NAVY).lineWidth(1.4).moveTo(M, y).lineTo(M + W, y).stroke().restore();
  y += 7;

  /* ───────── client and subject panels ───────── */
  const half = (W - 10) / 2;
  const rows: [string, string][] = [['Company / Organisation', t(q.client_name)], ['Address', t(q.client_address)], ['Contact Person', t(q.client_contact)], ['Designation', t(q.contact_designation)],
    ['Employee Strength', q.employee_strength ? `${n(q.employee_strength)} Employees` : '-'], ['No. of Shifts', q.shifts ? `${n(q.shifts)} Shift${n(q.shifts) === 1 ? '' : 's'}` : '-'], ['Industry / Sector', t(q.industry ?? q.client_profile)]];
  let leftH = 5;
  rows.forEach(([, value]) => { leftH += Math.max(9.8, heightOf(doc, value, half - 96, 6.8) + 2); });
  const subject = t(q.subject, DEFAULT_SUBJECT);
  const objective = t(q.directive, DEFAULT_OBJECTIVE);
  const rightH = heightOf(doc, subject, half - 16, 6.8) + heightOf(doc, objective, half - 28, 6.8) + 26;
  const panelH = Math.max(leftH, rightH);
  titleBar(doc, M, y, half, 'QUOTATION SUBMITTED TO', NAVY, 'building');
  frame(doc, M, y + TB, half, panelH);
  let ly = y + TB + 4;
  for (const [label, value] of rows) {
    text(doc, label, M + 8, ly, 80, { size: 6.8, color: MUTED });
    const end = text(doc, `:  ${value}`, M + 88, ly, half - 96, { size: 6.8, bold: label === 'Company / Organisation', color: INK });
    ly = Math.max(end, ly + 9.8) + 1.2;
  }
  const rxp = M + half + 10;
  titleBar(doc, rxp, y, half, 'SUBJECT', GREEN, 'target');
  frame(doc, rxp, y + TB, half, panelH);
  let ry = text(doc, subject, rxp + 8, y + TB + 5, half - 16, { size: 6.8, color: INK });
  const boxY = ry + 5;
  const boxH = heightOf(doc, objective, half - 28, 6.8) + 8;
  fillRect(doc, rxp + 8, boxY, half - 16, boxH, '#EEF7F0', '#B9DCC2');
  text(doc, objective, rxp + 14, boxY + 4, half - 28, { size: 6.8, color: INK });
  y += TB + panelH + 5;

  /* ───────── itemised fee table ───────── */
  const cols = [28, 150, 205, 50, W - 433];
  const colX = cols.reduce<number[]>((acc, w, i) => { acc.push(i === 0 ? M : acc[i - 1] + cols[i - 1]); return acc; }, []);
  const tableHead = (top: number) => {
    let hy = titleBar(doc, M, top, W, 'MONTHLY PROFESSIONAL SERVICE PRICE SUMMARY', NAVY, undefined, 'center');
    fillRect(doc, M, hy, W, 19, PALE);
    frame(doc, M, hy, W, 19);
    const labels = ['SL. NO.', 'SERVICE CATEGORY', 'SCOPE COVERED (SUMMARY)', 'FREQUENCY', 'MONTHLY PROFESSIONAL FEE (₹)'];
    labels.forEach((label, i) => text(doc, label, colX[i] + 3, hy + (i === 4 ? 2.5 : 6.5), cols[i] - 6, { size: 6.2, bold: true, color: NAVY, align: i === 1 || i === 2 ? 'left' : 'center', lineGap: 0 }));
    return hy + 19;
  };
  y = tableHead(y);
  q.items.forEach((item, index) => {
    const scopeH = heightOf(doc, t(item.scope, ''), cols[2] - 10, 6.5);
    const catH = heightOf(doc, String(item.category).toUpperCase(), cols[1] - 30, 6.6, true);
    const rowH = Math.max(17.5, scopeH + 6, catH + 6);
    if (y + rowH > limit() - 22) {
      doc.addPage();
      y = tableHead(24);
    }
    fillRect(doc, M, y, W, rowH, index % 2 ? PALE : '#FFFFFF');
    frame(doc, M, y, W, rowH);
    colX.slice(1).forEach((x) => doc.save().strokeColor(LINE).lineWidth(0.5).moveTo(x, y).lineTo(x, y + rowH).stroke().restore());
    text(doc, String(index + 1), colX[0], y + rowH / 2 - 4, cols[0], { size: 7, color: INK, align: 'center' });
    fillRect(doc, colX[1] + 5, y + rowH / 2 - 7, 14, 14, '#E4ECF8');
    drawIcon(doc, serviceIcon(String(item.category)), colX[1] + 12, y + rowH / 2, 9, BLUE, 1.7);
    text(doc, String(item.category).toUpperCase(), colX[1] + 23, y + rowH / 2 - catH / 2, cols[1] - 28, { size: 6.6, bold: true, color: NAVY });
    text(doc, t(item.scope, ''), colX[2] + 5, y + rowH / 2 - scopeH / 2, cols[2] - 10, { size: 6.5, color: INK });
    text(doc, String(item.frequency), colX[3], y + rowH / 2 - 4, cols[3], { size: 6.6, color: INK, align: 'center' });
    text(doc, inr(item.fee), colX[4], y + rowH / 2 - 4.5, cols[4], { size: 8, bold: true, color: NAVY, align: 'center' });
    y += rowH;
  });
  // total row
  if (y + 24 > limit()) { doc.addPage(); y = 24; }
  fillRect(doc, M, y, W, 20, '#E4ECF8');
  frame(doc, M, y, W, 20);
  text(doc, 'TOTAL PROFESSIONAL SERVICE FEE (PER MONTH)', M, y + 6.5, colX[4] - M, { size: 8, bold: true, color: NAVY, align: 'center' });
  fillRect(doc, colX[4], y, cols[4], 20, '#FFFFFF', LINE);
  text(doc, `₹ ${inr(q.subtotal)}`, colX[4], y + 4.5, cols[4], { size: 11, bold: true, color: NAVY, align: 'center' });
  y += 20 + 5;

  /* ───────── price summary and inclusions ───────── */
  const elements = q.framework_elements.length ? q.framework_elements : DEFAULT_QUOTATION_ELEMENTS;
  const leftW = W * 0.41;
  const rightX = M + leftW + 10;
  const rightWidth = W - leftW - 10;
  let inclH = 6;
  elements.forEach((el) => { inclH += Math.max(9, heightOf(doc, el, rightWidth - 28, 6.4) + 2); });
  const sumH = Math.max(inclH, 60);
  if (y + TB + sumH > limit()) { doc.addPage(); y = 24; }
  titleBar(doc, M, y, leftW, 'PRICE SUMMARY', NAVY);
  frame(doc, M, y + TB, leftW, sumH);
  const summary: [string, string, boolean][] = [['Professional Service Fee (Per Month)', `₹ ${inr2(q.subtotal)}`, false], [`GST @ ${n(q.gst_percent)}%`, `₹ ${inr2(q.gst_amount)}`, false], ['TOTAL MONTHLY PAYABLE AMOUNT', `₹ ${inr2(q.total)}`, true]];
  let sy = y + TB + 4;
  for (const [label, value, strong] of summary) {
    if (strong) fillRect(doc, M + 1, sy - 2, leftW - 2, 19, '#E2F3E6');
    text(doc, label, M + 8, sy + (strong ? 3 : 1.5), leftW - 96, { size: strong ? 6.6 : 6.8, bold: strong, color: strong ? GREEN : INK });
    text(doc, value, M + leftW - 86, sy + (strong ? 2.5 : 1), 78, { size: strong ? 10 : 7.4, bold: true, color: strong ? GREEN : INK, align: 'right' });
    sy += strong ? 20 : 13;
  }
  text(doc, `(${numberToWords(n(q.total), { currency: true })})`, M + 8, sy + 2, leftW - 16, { size: 6.4, color: MUTED });

  titleBar(doc, rightX, y, rightWidth, 'WHAT IS INCLUDED IN MONTHLY SERVICE', GREEN);
  frame(doc, rightX, y + TB, rightWidth, sumH);
  let iy = y + TB + 5;
  for (const el of elements) {
    badge(doc, 'check', rightX + 11, iy + 3.6, 4.2, GREEN);
    const end = text(doc, el, rightX + 21, iy, rightWidth - 28, { size: 6.4, color: INK });
    iy = Math.max(end, iy + 7.5) + 1.6;
  }
  y += TB + sumH + 5;

  /* ───────── notes and payment terms ───────── */
  const notes = String(q.notes ?? '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const noteList = notes.length ? notes : DEFAULT_QUOTATION_NOTES;
  const terms = q.payment_terms.length ? q.payment_terms : DEFAULT_PAYMENT_TERMS;
  const measure = (list: string[]) => list.reduce((sum, line) => sum + Math.max(8.5, heightOf(doc, line, half - 26, 6.3) + 1.6), 7);
  const listH = Math.max(measure(noteList), measure(terms));
  if (y + TB + listH > limit()) { doc.addPage(); y = 24; }
  const drawList = (x: number, label: string, color: string, list: string[]) => {
    titleBar(doc, x, y, half, label, color);
    frame(doc, x, y + TB, half, listH);
    let by = y + TB + 5;
    for (const line of list) {
      bullet(doc, x + 8, by + 1.2, color);
      const end = text(doc, line, x + 17, by, half - 26, { size: 6.3, color: INK });
      by = Math.max(end, by + 7) + 1.2;
    }
  };
  drawList(M, 'NOTES', ORANGE, noteList);
  drawList(M + half + 10, 'PAYMENT TERMS', PURPLE, terms);
  y += TB + listH + 5;

  /* ───────── acceptance sign-off ───────── */
  const signH = 66;
  if (y + signH > limit()) { doc.addPage(); y = 24; }
  const colW = W * 0.4;
  fillRect(doc, M, y, 84, 14, NAVY);
  text(doc, 'ACCEPTANCE', M, y + 4, 84, { size: 7, bold: true, color: '#FFFFFF', align: 'center' });
  frame(doc, M, y + 14, colW, signH - 14);
  text(doc, 'We hereby confirm our acceptance of the above service price quotation and agree to the scope, terms and conditions.', M + 8, y + 18, colW - 16, { size: 6.2, color: INK });
  const signLine = (x: number, ly: number, w: number, label: string) => {
    doc.save().strokeColor(MUTED).lineWidth(0.5).moveTo(x, ly).lineTo(x + w, ly).stroke().restore();
    text(doc, label, x, ly + 1.2, w, { size: 5.6, color: MUTED });
  };
  signLine(M + 8, y + 46, colW - 16, 'Authorised Signatory - For Company / Organisation');
  signLine(M + 8, y + 58, (colW - 24) / 2, 'Name / Designation');
  signLine(M + 16 + (colW - 24) / 2, y + 58, (colW - 24) / 2, 'Date / Company Seal');

  // the seal between the two sign-off boxes
  const sealX = M + colW + (W - colW - W * 0.4) / 2 + 0;
  const cx = M + W * 0.5;
  const cy = y + signH / 2 + 2;
  doc.save().fillColor(NAVY).circle(cx, cy, 31).fill().strokeColor('#FFFFFF').lineWidth(0.8).circle(cx, cy, 27.5).stroke().restore();
  text(doc, 'YOUR PARTNER IN\nCOMPLIANCE,\nSAFETY &\nSUSTAINABLE\nGROWTH', cx - 28, cy - 18, 56, { size: 5.6, bold: true, color: '#FFFFFF', align: 'center', lineGap: 0.5 });
  void sealX;

  const bx = M + W - colW;
  titleBar(doc, bx, y, colW, `FOR ${s.brandName.toUpperCase()}`.slice(0, 44), GREEN);
  frame(doc, bx, y + TB, colW, signH - TB);
  text(doc, 'Authorised Signatory', bx + 8, y + 19, colW - 16, { size: 6.2, bold: true, color: INK });
  signLine(bx + 8, y + 38, colW - 16, 'Signature');
  signLine(bx + 8, y + 48, (colW - 24) / 2, s.signatory ? s.signatory : 'Name');
  signLine(bx + 16 + (colW - 24) / 2, y + 48, (colW - 24) / 2, 'Designation');
  signLine(bx + 8, y + 58, (colW - 24) / 2, 'Mobile / Email');
  signLine(bx + 16 + (colW - 24) / 2, y + 58, (colW - 24) / 2, 'Date');

  /* ───────── contact bar on every page ───────── */
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i += 1) {
    doc.switchToPage(range.start + i);
    const saved = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const by = H - FOOTER;
    fillRect(doc, 0, by, doc.page.width, FOOTER, NAVY);
    const items: [string, string][] = [['phone', s.phone], ['mail', s.email], ['globe', s.website], ['pin', s.address.split(',').slice(-3).join(',').trim()]].filter(([, v]) => v) as [string, string][];
    const cell = (doc.page.width - 2 * M) / Math.max(items.length, 1);
    items.forEach(([icon, value], k) => {
      const x = M + k * cell;
      drawIcon(doc, icon, x + 6, by + 15, 9, '#FFFFFF', 1.5);
      setFont(doc, 6.8, { bold: true });
      // trim to the cell by measuring: pdfkit's own ellipsis can wrap a long address onto a new page
      let shown = value;
      while (shown.length > 4 && doc.widthOfString(shown) > cell - 22) shown = shown.slice(0, -2);
      if (shown !== value) shown = `${shown.trimEnd()}...`;
      doc.fillColor('#FFFFFF').text(shown, x + 16, by + 11.5, { width: 400, lineBreak: false });
    });
    setFont(doc, 5.6);
    doc.fillColor('#A9B8D6').text(`Confidential - ${s.name}   |   Page ${i + 1} of ${range.count}`, M, by - 8, { width: W, align: 'right', lineBreak: false });
    doc.page.margins.bottom = saved;
  }
  return renderPdf(doc);
}

export type { Seller };
