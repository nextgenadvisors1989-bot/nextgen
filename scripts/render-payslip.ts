/** Renders payslip PDFs straight from the database: npx tsx scripts/render-payslip.ts <payslipId> <out.pdf> [standard] */
import { writeFileSync } from 'node:fs';
import { generatePayslipPdf } from '../lib/pdf/payslip-pdf';

const [id, out, format] = process.argv.slice(2);
generatePayslipPdf(Number(id), { generatedByName: 'Demo Super Admin', generatedByRole: 'super_admin', format: format === 'standard' ? 'standard' : 'service-card' })
  .then((buffer) => { if (!buffer) throw new Error('payslip not found'); writeFileSync(out, buffer); console.log(`wrote ${buffer.length} bytes`); process.exit(0); })
  .catch((error) => { console.error(error); process.exit(1); });
