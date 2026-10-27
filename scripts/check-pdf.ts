/**
 * PDF smoke check.
 *
 *   npx tsx scripts/check-pdf.ts <employeeId> [payslipId]
 *
 * Renders two documents in-process and reports their page count and size:
 *
 *  * the employee personal file, asserting the ≤12 page format limit;
 *  * the bilingual payslip, when a payslip exists (run `npm run verify:payroll`
 *    first), asserting it fits the two-page Indian wage-statement convention and
 *    that the Tamil head names are embedded in the font rather than dropped.
 */
import { loadEnv } from '../lib/utils/env';
loadEnv();
import { generateEmployeePdf } from '../lib/pdf/employee-pdf';
import { generatePayslipPdf } from '../lib/pdf/payslip-pdf';
import { query, queryOne, closePool } from '../lib/db/mysql';

const MAX_PAGES = 12;
const MAX_PAYSLIP_PAGES = 2;
/** A two-page bilingual statement with its Tamil font subset runs ~19-25 kB. */
const MIN_PAYSLIP_BYTES = 15_000;

function countPages(buffer: Buffer): number {
  const text = buffer.toString('latin1');

  // The page tree carries the authoritative count; fall back to counting page
  // objects if a producer ever omits it.
  const declared = text.match(/\/Count\s+(\d+)/);
  if (declared) return Number(declared[1]);

  const pageObjects = (text.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  const pageTrees = (text.match(/\/Type\s*\/Pages/g) ?? []).length;
  return Math.max(pageObjects - pageTrees, 1);
}

async function main() {
  const arg = process.argv[2];
  const employeeId = Number(arg);

  let id = 0;

  if (Number.isInteger(employeeId) && employeeId > 0) {
    id = employeeId;
  } else {
    const live = await queryOne<{ id: number }>(
      'SELECT id FROM employees WHERE deleted_at IS NULL ORDER BY id DESC LIMIT 1'
    );
    if (live) id = Number(live.id);
  }

  if (!id) {
    console.error(
      'No live employee to render. Run `npm run verify:employees` (it leaves one in place) '
      + 'or pass an employee id: npx tsx scripts/check-pdf.ts <employeeId>'
    );
    process.exit(1);
  }

  const started = Date.now();
  const buffer = await generateEmployeePdf(id, {
    generatedByName: 'PDF check',
    generatedByRole: 'admin',
  });
  if (!buffer) {
    console.error(`Employee ${id} not found`);
    process.exit(1);
  }

  const pages = countPages(buffer);
  console.log(`employee ${id}: ${pages} page(s), ${(buffer.length / 1024).toFixed(1)} kB, ${Date.now() - started} ms`);
  const employeeOk = pages <= MAX_PAGES;
  console.log(employeeOk ? `PASS — within the ${MAX_PAGES}-page limit` : `FAIL — exceeds the ${MAX_PAGES}-page limit`);

  /* ── the bilingual payslip ─────────────────────────────────────────── */

  const argPayslip = Number(process.argv[3]);
  const slip = Number.isInteger(argPayslip) && argPayslip > 0
    ? await queryOne<{ id: number; payslip_number: string }>(
        'SELECT id, payslip_number FROM payslips WHERE id = ? AND deleted_at IS NULL LIMIT 1', [argPayslip])
    : (await query<{ id: number; payslip_number: string }>(
        'SELECT id, payslip_number FROM payslips WHERE deleted_at IS NULL ORDER BY id DESC LIMIT 1'))[0];

  let payslipOk = true;
  if (!slip) {
    console.log('payslip: none to render — run `npm run verify:payroll` first and try again');
  } else {
    const slipStarted = Date.now();
    const slipBuffer = await generatePayslipPdf(Number(slip.id), {
      generatedByName: 'PDF check',
      generatedByRole: 'admin',
    });
    if (!slipBuffer) {
      console.log(`payslip ${slip.payslip_number}: FAIL — the renderer returned nothing`);
      payslipOk = false;
    } else {
      const slipPages = countPages(slipBuffer);
      // Tamil renders as embedded glyphs; PDFKit subsets the font, so the Tamil
      // head names survive only if the font was actually used on the page.
      const fonts = (slipBuffer.toString('latin1').match(/\/FontFile2/g) ?? []).length;
      console.log(`payslip ${slip.payslip_number}: ${slipPages} page(s), ${(slipBuffer.length / 1024).toFixed(1)} kB, `
        + `${fonts} embedded font(s), ${Date.now() - slipStarted} ms`);
      payslipOk = slipPages >= 1 && slipPages <= MAX_PAYSLIP_PAGES
        && slipBuffer.length >= MIN_PAYSLIP_BYTES && fonts >= 1;
      console.log(payslipOk
        ? `PASS — a complete bilingual wage statement within ${MAX_PAYSLIP_PAGES} page(s), Tamil font embedded`
        : `FAIL — the payslip is not a complete statement (pages ${slipPages}, ${slipBuffer.length} bytes, ${fonts} font(s))`);
    }
  }

  await closePool();
  process.exit(employeeOk && payslipOk ? 0 : 1);
}

main();
