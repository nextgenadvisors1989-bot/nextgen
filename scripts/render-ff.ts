/** Renders a full and final settlement PDF from the database: npx tsx --env-file=.env scripts/render-ff.ts <settlementId> <out.pdf> */
import { writeFileSync } from 'node:fs';
import { generateFullFinalPdf } from '../lib/pdf/full-final-pdf';

const [id, out] = process.argv.slice(2);
generateFullFinalPdf(Number(id), { generatedByName: 'Demo Super Admin', generatedByRole: 'super_admin' })
  .then((buffer) => { if (!buffer) throw new Error('settlement not found'); writeFileSync(out, buffer); console.log(`wrote ${buffer.length} bytes`); process.exit(0); })
  .catch((error) => { console.error(error); process.exit(1); });
