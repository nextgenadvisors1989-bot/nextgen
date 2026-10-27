/** Unit checks for lib/billing/gst.ts: npx tsx scripts/test-gst.ts */
import { financialYear, invoiceTotals, isValidGstin, lineAmounts, quotationTotals, stateCodeOfGstin, supplyTypeFor } from '../lib/billing/gst';

let failed = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failed += 1;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${ok ? '' : `  -> got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`}`);
}

// the client's sample invoice: 10,500.00 at 18 % is 1,890.00 tax, 12,390.00 in all
check('sample invoice line', lineAmounts({ quantity: 1, unit_price: 10500, gst_percent: 18 }), { taxable_value: 10500, gst_amount: 1890, amount: 12390 });
const sample = invoiceTotals([{ quantity: 1, unit_price: 10500, gst_percent: 18 }], 'Inter-state');
check('sample IGST', [sample.subtotal, sample.igst, sample.cgst, sample.sgst, sample.total], [10500, 1890, 0, 0, 12390]);
const local = invoiceTotals([{ quantity: 1, unit_price: 10500, gst_percent: 18 }], 'Intra-state');
check('same state splits CGST + SGST', [local.cgst, local.sgst, local.igst, local.total], [945, 945, 0, 12390]);

// the client's sample quotation: ten lines, 55,000 + 18 % GST 9,900 = 64,900
const fees = [7000, 7000, 6000, 7500, 3500, 5000, 4000, 4000, 5000, 6000];
check('sample quotation', quotationTotals(fees, 18), { subtotal: 55000, gst: 9900, total: 64900 });

// odd paise: tax 1 paisa over a split must still add up
const odd = invoiceTotals([{ quantity: 3, unit_price: 33.33, gst_percent: 18 }], 'Intra-state');
check('odd-paise split adds up', Math.round((odd.cgst + odd.sgst) * 100), Math.round(odd.gst * 100));
check('lines add up to the total', Math.round((odd.subtotal + odd.gst) * 100), Math.round(odd.total * 100));

// several rates group into the HSN / SAC summary
const mixed = invoiceTotals([{ quantity: 1, unit_price: 1000, gst_percent: 18 }, { quantity: 2, unit_price: 500, gst_percent: 18 }, { quantity: 1, unit_price: 200, gst_percent: 5 }], 'Intra-state');
check('rates are grouped', mixed.byRate.map((r) => [r.rate, r.taxable_value]), [[5, 200], [18, 2000]]);
check('mixed total', mixed.total, 2000 + 360 + 200 + 10);

check('fractional quantity', lineAmounts({ quantity: 2.5, unit_price: 100, gst_percent: 12 }), { taxable_value: 250, gst_amount: 30, amount: 280 });
check('zero rate has no tax', lineAmounts({ quantity: 1, unit_price: 999.99, gst_percent: 0 }).gst_amount, 0);

check('same state is intra', supplyTypeFor('33', '33'), 'Intra-state');
check('other state is inter', supplyTypeFor('33', '07'), 'Inter-state');
check('unknown buyer state is intra', supplyTypeFor('33', ''), 'Intra-state');

check('valid GSTIN', isValidGstin('33AABCS1234D1Z5'), true);
check('GSTIN is case-insensitive', isValidGstin('33aabcs1234d1z5'), true);
check('GSTIN with a wrong length', isValidGstin('33AABCS1234D1Z'), false);
check('GSTIN with a state code 00', isValidGstin('00AABCS1234D1Z5'), false);
check('GSTIN without the Z', isValidGstin('33AABCS1234D1A5'), false);
check('state code from a GSTIN', stateCodeOfGstin('33AABCS1234D1Z5'), '33');

check('April starts a new financial year', financialYear(new Date(2026, 3, 1)), '2026-27');
check('March belongs to the earlier year', financialYear(new Date(2027, 2, 31)), '2026-27');
check('October', financialYear(new Date(2026, 9, 19)), '2026-27');
check('January', financialYear(new Date(2027, 0, 5)), '2026-27');

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
