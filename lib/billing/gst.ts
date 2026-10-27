/**
 * GST arithmetic for quotations and tax invoices. Pure functions, unit-tested by `npx tsx scripts/test-gst.ts`.
 *
 * Rules applied (CGST Act 2017): tax is charged on the taxable value of each line; where the supplier and the place of supply are in the
 * same state the tax is split equally into CGST and SGST, otherwise it is IGST. Every figure is rounded to paise per line, and the
 * invoice totals are the sums of those rounded lines, so the printed lines always add up to the printed total.
 */
export type SupplyType = 'Intra-state' | 'Inter-state';

export const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export interface LineInput {
  quantity: number;
  unit_price: number;
  gst_percent: number;
}

export interface LineAmounts {
  taxable_value: number;
  gst_amount: number;
  amount: number;
}

export function lineAmounts(line: LineInput): LineAmounts {
  const taxable = round2(line.quantity * line.unit_price);
  const gst = round2((taxable * line.gst_percent) / 100);
  return { taxable_value: taxable, gst_amount: gst, amount: round2(taxable + gst) };
}

export interface RateSummary {
  rate: number;
  taxable_value: number;
  cgst: number;
  sgst: number;
  igst: number;
}

export interface InvoiceTotals {
  subtotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  gst: number;
  total: number;
  lines: LineAmounts[];
  /** The "HSN / SAC summary" block: taxable value and tax by rate. */
  byRate: RateSummary[];
}

export function invoiceTotals(lines: LineInput[], supply: SupplyType): InvoiceTotals {
  const amounts = lines.map(lineAmounts);
  const groups = new Map<number, { taxable: number; gst: number }>();
  lines.forEach((line, i) => {
    const group = groups.get(line.gst_percent) ?? { taxable: 0, gst: 0 };
    group.taxable = round2(group.taxable + amounts[i].taxable_value);
    group.gst = round2(group.gst + amounts[i].gst_amount);
    groups.set(line.gst_percent, group);
  });
  const byRate: RateSummary[] = [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([rate, group]) => {
    if (supply === 'Inter-state') return { rate, taxable_value: group.taxable, cgst: 0, sgst: 0, igst: group.gst };
    const cgst = round2(group.gst / 2);
    return { rate, taxable_value: group.taxable, cgst, sgst: round2(group.gst - cgst), igst: 0 };
  });
  const sum = (key: 'taxable_value' | 'cgst' | 'sgst' | 'igst') => round2(byRate.reduce((total, row) => total + row[key], 0));
  const subtotal = sum('taxable_value');
  const cgst = sum('cgst');
  const sgst = sum('sgst');
  const igst = sum('igst');
  const gst = round2(cgst + sgst + igst);
  return { subtotal, cgst, sgst, igst, gst, total: round2(subtotal + gst), lines: amounts, byRate };
}

/** Intra-state when the buyer's state is the supplier's (or is not known: a local client is the common case). */
export function supplyTypeFor(sellerStateCode: string | null | undefined, buyerStateCode: string | null | undefined): SupplyType {
  const seller = String(sellerStateCode ?? '').trim();
  const buyer = String(buyerStateCode ?? '').trim();
  return !buyer || !seller || seller === buyer ? 'Intra-state' : 'Inter-state';
}

/** Quotation totals: one GST rate over the sum of the fee lines. */
export function quotationTotals(fees: number[], gstPercent: number): { subtotal: number; gst: number; total: number } {
  const subtotal = round2(fees.reduce((total, fee) => total + fee, 0));
  const gst = round2((subtotal * gstPercent) / 100);
  return { subtotal, gst, total: round2(subtotal + gst) };
}

const GSTIN = /^(0[1-9]|[1-2]\d|3[0-8])[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** A GSTIN is 15 characters: 2-digit state, 10-character PAN, entity number, "Z", check character. */
export function isValidGstin(value: string): boolean {
  return GSTIN.test(value.trim().toUpperCase());
}

export function stateCodeOfGstin(value: string): string {
  return value.trim().slice(0, 2);
}

/** The financial year an invoice date falls in, e.g. 2026-10-19 -> "2026-27" (April to March). */
export function financialYear(date: Date): string {
  const start = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}
