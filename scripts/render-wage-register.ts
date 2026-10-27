/** Renders a wage register straight from the database: npx tsx --env-file=.env scripts/render-wage-register.ts <runId> <out.pdf> */
import { writeFileSync } from 'node:fs';
import { generateWageRegisterPdf } from '../lib/pdf/registers-pdf';

const [id, out] = process.argv.slice(2);
generateWageRegisterPdf(Number(id), { generatedByName: 'Demo Super Admin', generatedByRole: 'super_admin' })
  .then((buffer) => { if (!buffer) throw new Error('run not found'); writeFileSync(out, buffer); console.log(`wrote ${buffer.length} bytes`); process.exit(0); })
  .catch((error) => { console.error(error); process.exit(1); });
