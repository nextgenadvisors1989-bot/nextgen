/** Renders billing PDFs from the database: npx tsx --env-file=.env scripts/render-billing.ts <quotation|invoice|receipt> <id> <out.pdf> */
import { writeFileSync } from 'node:fs';
import { generateInvoicePdf, generateQuotationPdf, generateReceiptPdf } from '../lib/pdf/billing-pdf';

const [kind, id, out] = process.argv.slice(2);
const context = { generatedByName: 'Demo Super Admin' };
(kind === 'quotation' ? generateQuotationPdf(Number(id), {}, context) : kind === 'invoice' ? generateInvoicePdf(Number(id), {}, context) : generateReceiptPdf(Number(id), {}))
  .then((buffer) => { writeFileSync(out, buffer); console.log(`wrote ${buffer.length} bytes`); process.exit(0); })
  .catch((error) => { console.error(error); process.exit(1); });
