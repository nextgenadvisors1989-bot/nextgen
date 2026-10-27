/**
 * Loads the two reference lists that come from the client's documents into any database (no Python, no API login needed):
 *
 *   - the Designation Master      (scripts/fixtures/designations.json)       -> designations (shared master, employer_id NULL)
 *   - the Audit Documents checklist (scripts/fixtures/evidence-checklist.json) -> evidence_sections / evidence_items
 *
 * Safe to re-run: anything already there (same name) is left alone, so nothing an administrator edited is overwritten.
 * Run after `npm run db:migrate`:   npm run db:seed-masters
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnv } from '../lib/utils/env';
import { closePool, execute, query, queryOne, type RowDataPacket } from '../lib/db/mysql';

type Designation = {
  industry_code: string | null; industry_name: string | null; group_name: string | null; designation_name: string; department: string | null;
  skill_level: string | null; level_inferred: number; nature_of_work: string | null; statutory_category: string | null; sort_order: number;
};
type ChecklistSection = { name: string; sort_order: number; items: { group: string | null; name: string; sort_order: number }[] };

const read = <T>(file: string): T => JSON.parse(readFileSync(resolve(process.cwd(), 'scripts/fixtures', file), 'utf8')) as T;
const key = (a: string | null, b: string | null, c: string) => `${a ?? ''}|${b ?? ''}|${c.toLowerCase()}`;

async function seedDesignations() {
  const rows = read<{ designations: Designation[] }>('designations.json').designations;
  const have = new Set((await query<RowDataPacket>('SELECT industry_code, group_name, designation_name FROM designations WHERE employer_id IS NULL AND deleted_at IS NULL'))
    .map((r) => key(r.industry_code, r.group_name, String(r.designation_name))));
  const todo = rows.filter((r) => !have.has(key(r.industry_code, r.group_name, r.designation_name)));
  for (let i = 0; i < todo.length; i += 100) {
    const slice = todo.slice(i, i + 100);
    await execute(
      `INSERT INTO designations (employer_id, industry_code, industry_name, group_name, designation_name, department, skill_level, level_inferred, nature_of_work, statutory_category, status, sort_order)
       VALUES ${slice.map(() => "(NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)").join(',')}`,
      slice.flatMap((r) => [r.industry_code, r.industry_name, r.group_name, r.designation_name, r.department, r.skill_level, r.level_inferred ? 1 : 0, r.nature_of_work, r.statutory_category, r.sort_order]));
  }
  console.log(`Designation Master: ${todo.length} added, ${rows.length - todo.length} already there`);
}

async function seedChecklist() {
  const sections = read<{ sections: ChecklistSection[] }>('evidence-checklist.json').sections;
  let addedSections = 0, addedItems = 0;
  for (const section of sections) {
    let row = await queryOne<RowDataPacket>('SELECT id FROM evidence_sections WHERE name = ? AND deleted_at IS NULL', [section.name]);
    if (!row) {
      await execute('INSERT INTO evidence_sections (name, sort_order) VALUES (?, ?)', [section.name, section.sort_order]);
      row = await queryOne<RowDataPacket>('SELECT id FROM evidence_sections WHERE name = ? AND deleted_at IS NULL', [section.name]);
      addedSections += 1;
    }
    const sectionId = Number(row!.id);
    const have = new Set((await query<RowDataPacket>('SELECT group_name, name FROM evidence_items WHERE section_id = ? AND deleted_at IS NULL', [sectionId])).map((r) => `${r.group_name ?? ''}|${String(r.name).toLowerCase()}`));
    const todo = section.items.filter((i) => !have.has(`${i.group ?? ''}|${i.name.toLowerCase()}`));
    for (let i = 0; i < todo.length; i += 100) {
      const slice = todo.slice(i, i + 100);
      await execute(`INSERT INTO evidence_items (section_id, group_name, name, sort_order) VALUES ${slice.map(() => '(?, ?, ?, ?)').join(',')}`, slice.flatMap((r) => [sectionId, r.group, r.name, r.sort_order]));
    }
    addedItems += todo.length;
  }
  console.log(`Audit Documents checklist: ${addedSections} sections and ${addedItems} documents added`);
}

async function main() {
  loadEnv();
  await seedDesignations();
  await seedChecklist();
  await closePool();
}

main().catch((error) => { console.error(error); process.exit(1); });
