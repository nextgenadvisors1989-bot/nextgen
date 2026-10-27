/**
 * The three billing documents: service price quotation, GST tax invoice (with the HSN / SAC summary) and payment acknowledgement / receipt.
 * The seller is the company configured in Company Settings (name, address, GSTIN, bank, terms, signatory, logo or letterhead).
 */
import { query, type RowDataPacket } from '@/lib/db/mysql';
import { COLORS, CONTENT_WIDTH, MARGIN, createPdf, ensureSpace, keyValues, paragraph, renderPdf, sectionHeading, setFont, spacer, stampFooters, table, type Doc } from '@/lib/pdf/base';
import { seller, type Seller } from '@/lib/pdf/billing-seller';
import { generatePremiumQuotation } from '@/lib/pdf/quotation-premium';
import { invoiceTotals, supplyTypeFor, type SupplyType } from '@/lib/billing/gst';
import { formatDate } from '@/lib/utils/dates';
import { formatCurrency, numberToWords } from '@/lib/utils/formatting';
import { getInvoice, getQuotation, getReceipt, type BillingScope } from '@/services/billing.service';

const n = (value: unknown) => Number(value ?? 0);
const t = (value: unknown, fallback = '-') => (value === null || value === undefined || value === '' ? fallback : String(value));
const money = (value: unknown) => n(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const INK = '#111827';

function check(doc: Doc, x: number, y: number): void {
  doc.save().strokeColor(INK).lineWidth(1.3).moveTo(x, y + 4).lineTo(x + 3, y + 7.5).lineTo(x + 9, y).stroke().restore();
}

function banner(doc: Doc, s: Seller, right: { title: string; lines: string[] }): void {
  const top = doc.y;
  if (s.letterhead) {
    try { doc.image(s.letterhead, MARGIN, top, { width: CONTENT_WIDTH }); doc.y = top + 70; } catch { doc.y = top; }
  } else if (s.logo) {
    try { doc.image(s.logo, MARGIN, top, { fit: [52, 44] }); } catch { /* an unreadable logo is skipped */ }
  }
  const nameX = s.letterhead ? MARGIN : MARGIN + (s.logo ? 62 : 0);
  if (!s.letterhead) {
    setFont(doc, 14, { bold: true });
    doc.fillColor(INK).text(s.name.toUpperCase(), nameX, top + 2, { width: 255 });
    if (s.tagline) { setFont(doc, 8.5); doc.fillColor(COLORS.muted).text(s.tagline, nameX, doc.y + 1, { width: 255 }); }
  }
  setFont(doc, 11, { bold: true });
  doc.fillColor(INK).text(right.title, MARGIN + CONTENT_WIDTH - 190, top + 2, { width: 190, align: 'right' });
  setFont(doc, 8.5);
  right.lines.forEach((line) => doc.text(line, MARGIN + CONTENT_WIDTH - 190, doc.y + 1, { width: 190, align: 'right' }));
  doc.y = Math.max(doc.y, top + 52) + 6;
  doc.save().strokeColor(INK).lineWidth(1.2).moveTo(MARGIN, doc.y).lineTo(MARGIN + CONTENT_WIDTH, doc.y).stroke().restore();
  doc.y += 10;
}

function box(doc: Doc, x: number, y: number, w: number, title: string, lines: [string, string][], fill = true): number {
  setFont(doc, 8.5, { bold: true });
  const start = y;
  let cy = y + 6;
  doc.fillColor(COLORS.muted).text(title, x + 8, cy, { width: w - 16 });
  cy = doc.y + 3;
  for (const [label, value] of lines) {
    setFont(doc, 8.5, { bold: true });
    doc.fillColor(INK).text(label, x + 8, cy, { width: 88, lineBreak: false });
    setFont(doc, 8.5);
    doc.fillColor(INK).text(value, x + 98, cy, { width: w - 106 });
    cy = Math.max(doc.y, cy + 11) + 2;
  }
  cy += 4;
  doc.save().strokeColor('#9ca3af').lineWidth(0.7);
  if (fill) doc.fillOpacity(0.06).fillColor('#64748b').rect(x, start, w, cy - start).fill().fillOpacity(1);
  doc.rect(x, start, w, cy - start).stroke().restore();
  return cy;
}

/* The quotation has its own premium layout (lib/pdf/quotation-premium.ts). */
export async function generateQuotationPdf(id: number, scope: BillingScope, _context: { generatedByName: string }): Promise<Buffer> {
  return generatePremiumQuotation(id, scope);
}

/* ───────────────────────────── tax invoice ───────────────────────────── */

export async function generateInvoicePdf(id: number, scope: BillingScope, context: { generatedByName: string }): Promise<Buffer> {
  const [inv, s] = await Promise.all([getInvoice(id, scope), seller()]);
  const supply: SupplyType = inv.supply_type === 'Inter-state' ? 'Inter-state' : supplyTypeFor(s.stateCode, inv.buyer_state_code);
  const totals = invoiceTotals(inv.items.map((item) => ({ quantity: n(item.quantity), unit_price: n(item.unit_price), gst_percent: n(item.gst_percent) })), supply);
  const doc = createPdf({ title: `Tax Invoice ${String(inv.invoice_number)}`, subject: String(inv.buyer_name), author: s.name });
  const isDraft = inv.status === 'Draft';
  const cancelled = inv.status === 'Cancelled';

  banner(doc, s, { title: 'Tax Invoice', lines: [s.gstin ? `GSTIN: ${s.gstin}` : '', s.pan ? `PAN: ${s.pan}` : '', `State Code: ${s.stateCode}${s.state ? ` (${s.state})` : ''}`, isDraft ? 'DRAFT - NOT A TAX INVOICE' : cancelled ? 'CANCELLED' : ''].filter(Boolean) });
  setFont(doc, 8.5);
  doc.fillColor(COLORS.muted).text([s.address, s.phone && `Phone: ${s.phone}`, s.email && `E-mail: ${s.email}`].filter(Boolean).join('   |   '), MARGIN, doc.y - 4, { width: CONTENT_WIDTH });
  doc.y += 8;

  const top = doc.y;
  const half = (CONTENT_WIDTH - 12) / 2;
  const buyer = box(doc, MARGIN, top, half, 'Buyer:', [['Name:', t(inv.buyer_name)], ['Address:', t(inv.buyer_address)], ['State Code:', t(inv.buyer_state_code)], ['PAN:', t(inv.buyer_pan)], ['GSTIN:', t(inv.buyer_gstin)]], false);
  const consignee = box(doc, MARGIN + half + 12, top, half, 'Consignee:', [['Name:', t(inv.consignee_name || inv.buyer_name)], ['Address:', t(inv.consignee_address || inv.buyer_address)], ['State Code:', t(inv.buyer_state_code)], ['GSTIN:', t(inv.buyer_gstin)]], false);
  doc.y = Math.max(buyer, consignee) + 8;
  keyValues(doc, [
    { label: 'Invoice No.', value: isDraft ? 'Draft - not yet issued' : String(inv.invoice_number) }, { label: 'Invoice Date', value: formatDate(inv.invoice_date) },
    { label: 'Payment Terms', value: t(inv.payment_terms) }, { label: 'Due Date', value: formatDate(inv.due_date) },
    { label: 'Place of Supply', value: t(inv.place_of_supply) }, { label: 'Supply', value: `${supply}${supply === 'Inter-state' ? ' (IGST)' : ' (CGST + SGST)'}` },
  ], { columns: 2 });

  table(doc, {
    columns: [{ key: 'sr', label: 'Sr.', width: 0.05, align: 'center' }, { key: 'description', label: 'Description', width: 0.24 }, { key: 'sac', label: 'HSN / SAC', width: 0.09 }, { key: 'qty', label: 'Qty', width: 0.06, align: 'right' },
      { key: 'uom', label: 'UOM', width: 0.06 }, { key: 'price', label: 'Unit Price', width: 0.11, align: 'right' }, { key: 'taxable', label: 'Taxable Value', width: 0.12, align: 'right' },
      { key: 'rate', label: 'GST %', width: 0.06, align: 'right' }, { key: 'gst', label: 'GST Amount', width: 0.1, align: 'right' }, { key: 'amount', label: 'Amount', width: 0.12, align: 'right' }],
    rows: inv.items.map((item, i) => ({ sr: i + 1, description: item.description, sac: t(item.sac_code, ''), qty: n(item.quantity).toFixed(2), uom: t(item.uom, ''), price: money(item.unit_price), taxable: money(item.taxable_value),
      rate: n(item.gst_percent).toFixed(2), gst: money(item.gst_amount), amount: money(item.amount) })),
    footer: `Total: ${money(inv.total)}`,
  });
  setFont(doc, 9, { bold: true });
  doc.fillColor(INK).text(`Rs. **** ${numberToWords(n(inv.total), { currency: true }).toUpperCase()}`, MARGIN, doc.y + 2, { width: CONTENT_WIDTH });
  doc.y += 8;

  sectionHeading(doc, 'HSN / SAC Summary');
  const sac = new Map<string, { taxable: number; rate: number }>();
  inv.items.forEach((item) => { const key = `${t(item.sac_code, '')}|${n(item.gst_percent)}`; const row = sac.get(key) ?? { taxable: 0, rate: n(item.gst_percent) }; row.taxable += n(item.taxable_value); sac.set(key, row); });
  const split = (amount: number) => (supply === 'Inter-state' ? { igst: amount, cgst: 0, sgst: 0 } : { igst: 0, cgst: Math.round(amount * 50) / 100, sgst: Math.round((amount - Math.round(amount * 50) / 100) * 100) / 100 });
  table(doc, {
    columns: [{ key: 'sac', label: 'HSN / SAC', width: 0.14 }, { key: 'taxable', label: 'Taxable Value', width: 0.16, align: 'right' }, { key: 'irate', label: 'IGST %', width: 0.08, align: 'right' }, { key: 'iamt', label: 'IGST Amount', width: 0.14, align: 'right' },
      { key: 'crate', label: 'CGST %', width: 0.08, align: 'right' }, { key: 'camt', label: 'CGST Amount', width: 0.14, align: 'right' }, { key: 'srate', label: 'SGST %', width: 0.08, align: 'right' }, { key: 'samt', label: 'SGST Amount', width: 0.18, align: 'right' }],
    rows: [...sac.entries()].map(([key, row]) => {
      const tax = split(Math.round(row.taxable * row.rate) / 100);
      const half2 = row.rate / 2;
      return { sac: key.split('|')[0], taxable: money(row.taxable), irate: supply === 'Inter-state' ? row.rate.toFixed(2) : '0.00', iamt: money(tax.igst), crate: supply === 'Inter-state' ? '0.00' : half2.toFixed(2), camt: money(tax.cgst),
        srate: supply === 'Inter-state' ? '0.00' : half2.toFixed(2), samt: money(tax.sgst) };
    }),
  });

  ensureSpace(doc, 130);
  if (inv.payments.length) {
    sectionHeading(doc, 'Payments received');
    table(doc, { columns: [{ key: 'receipt', label: 'Receipt', width: 0.3 }, { key: 'date', label: 'Date', width: 0.2 }, { key: 'mode', label: 'Mode', width: 0.2 }, { key: 'amount', label: 'Amount', width: 0.3, align: 'right' }],
      rows: inv.payments.map((p) => ({ receipt: p.receipt_number, date: formatDate(p.payment_date), mode: p.mode, amount: money(p.amount) })), footer: `Paid ${money(inv.amount_paid)}   Balance due ${money(inv.balance)}` });
  }
  const notesY = doc.y + 4;
  setFont(doc, 8.5, { bold: true });
  doc.fillColor(INK).text('Please Note:', MARGIN, notesY, { width: CONTENT_WIDTH * 0.6 });
  setFont(doc, 8);
  (s.terms.length ? s.terms : ['Please send payment advice to the e-mail address above.']).forEach((line, i) => doc.text(`${i + 1}. ${line}`, MARGIN, doc.y + 2, { width: CONTENT_WIDTH * 0.6 }));
  const termsEnd = doc.y;
  const bx = MARGIN + CONTENT_WIDTH * 0.64;
  setFont(doc, 8.5, { bold: true });
  doc.fillColor(INK).text('Bank Name :', bx, notesY, { width: 70, lineBreak: false });
  doc.text('Bank Account No. :', bx, notesY + 12, { width: 90, lineBreak: false });
  doc.text('IFSC Code :', bx, notesY + 24, { width: 70, lineBreak: false });
  setFont(doc, 8.5);
  doc.text(t(s.bank), bx + 92, notesY, { width: 100, lineBreak: false });
  doc.text(t(s.account), bx + 92, notesY + 12, { width: 100, lineBreak: false });
  doc.text(t(s.ifsc), bx + 92, notesY + 24, { width: 100, lineBreak: false });
  // declaration under the terms on the left; the signature sits in the free right-hand column under the bank details
  doc.y = termsEnd + 8;
  setFont(doc, 8);
  doc.fillColor(INK).text('Declaration: We declare that this invoice shows the actual price of the services described and that all particulars are true and correct.', MARGIN, doc.y, { width: CONTENT_WIDTH * 0.6 });
  const declarationEnd = doc.y;
  setFont(doc, 8.5, { bold: true });
  doc.text(`For ${s.name}`, bx, notesY + 46, { width: CONTENT_WIDTH * 0.36, align: 'right', lineBreak: false, ellipsis: true });
  doc.save().strokeColor(COLORS.muted).lineWidth(0.6).moveTo(bx + 20, notesY + 86).lineTo(bx + CONTENT_WIDTH * 0.36, notesY + 86).stroke().restore();
  doc.text(s.signatory ? `${s.signatory} - Authorised Signatory` : 'Authorised Signatory', bx, notesY + 90, { width: CONTENT_WIDTH * 0.36, align: 'right', lineBreak: false, ellipsis: true });
  doc.y = Math.max(declarationEnd, notesY + 104);
  stampFooters(doc, ({ index, total }) => ({ left: s.name, center: `${isDraft ? 'DRAFT' : String(inv.invoice_number)} - computer generated by ${context.generatedByName}`, right: `Page ${index} of ${total}` }));
  return renderPdf(doc);
}

/* ───────────────────────────── receipt ───────────────────────────── */

export async function generateReceiptPdf(paymentId: number, scope: BillingScope): Promise<Buffer> {
  const [r, s] = await Promise.all([getReceipt(paymentId, scope), seller()]);
  const doc = createPdf({ title: `Receipt ${String(r.receipt_number)}`, subject: String(r.buyer_name), author: s.name });
  banner(doc, s, { title: 'Payment Acknowledgement\n/ Receipt', lines: [`Receipt Number: ${String(r.receipt_number)}`, `Date: ${formatDate(r.payment_date)}`] });
  spacer(doc, 6);
  keyValues(doc, [
    { label: 'Received with thanks from', value: t(r.buyer_name) }, { label: 'Address', value: t(r.buyer_address) }, { label: 'GST number', value: t(r.buyer_gstin) },
    { label: 'Amount', value: money(r.amount) }, { label: 'The sum of', value: numberToWords(n(r.amount), { currency: true }).toUpperCase() }, { label: 'Mode of Payment', value: `${t(r.mode)}${r.reference ? `; ${String(r.reference)}` : ''}` },
    { label: 'Against invoice number', value: t(r.invoice_number) }, { label: 'Against invoice date', value: formatDate(r.invoice_date) },
    { label: 'Invoice total / paid so far', value: `${formatCurrency(n(r.total))} / ${formatCurrency(n(r.amount_paid))}` },
  ], { columns: 1, labelWidth: 150 });
  paragraph(doc, 'All payments are subject to realization and credit in the bank account.', { size: 8.5 });
  spacer(doc, 14);
  paragraph(doc, 'Note: This is a computer generated receipt and requires no signature.', { size: 8.5, bold: true });
  stampFooters(doc, ({ index, total }) => ({ left: s.name, center: String(r.receipt_number), right: `Page ${index} of ${total}` }));
  return renderPdf(doc);
}
