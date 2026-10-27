/** Renders personal-file documents straight from the database: npx tsx --env-file=.env scripts/render-employee-doc.ts <employeeId> <outDir> [type...] */
import { mkdirSync, writeFileSync } from 'node:fs';
import { EMPLOYEE_DOCUMENTS, generateEmployeeDocument, isEmployeeDocumentType } from '../lib/pdf/employee-documents';

const [id, dir, ...only] = process.argv.slice(2);
mkdirSync(dir, { recursive: true });
(async () => {
  for (const { type } of EMPLOYEE_DOCUMENTS) {
    if (only.length && !only.includes(type) || !isEmployeeDocumentType(type)) continue;
    const buffer = await generateEmployeeDocument(Number(id), type, { generatedByName: 'Demo Super Admin', generatedByRole: 'super_admin' });
    if (!buffer) throw new Error(`employee ${id} not found`);
    writeFileSync(`${dir}/${type}.pdf`, buffer);
    console.log(type, buffer.length);
  }
  process.exit(0);
})().catch((error) => { console.error(error); process.exit(1); });
