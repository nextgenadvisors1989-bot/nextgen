/**
 * CAPAR Management: which checklist rows (documents) each auditor sees in a CAPAR report.
 *
 * The rows are the sections and documents of the Audit Documents checklist (evidence_sections / evidence_items), so there is one list for
 * the whole product. The administrator picks, per document, the auditors who work on it (capar_item_auditors). A document with no auditor is
 * shown to nobody. "Suggestions" start the assignment from each auditor's type (a Fire Safety Auditor gets the fire documents, a Payroll
 * Auditor the wage documents ...); they only ever add, so an administrator's own choices are never taken away.
 */
import { query, queryOne, transaction, type RowDataPacket } from '@/lib/db/mysql';

function fail(code: string, message: string): never {
  throw Object.assign(new Error(message), { code });
}
const n = (value: unknown) => Number(value ?? 0);

/* ───────────────────────────── what an auditor sees ───────────────────────────── */

export interface ChecklistSection { id: number; name: string; items: { id: number; group_name: string | null; name: string }[] }

/** The sections and documents the administrator gave this auditor (a section with none of their documents is left out). */
export async function checklistForAuditor(auditorId: number | null): Promise<ChecklistSection[]> {
  if (!auditorId) return [];
  const items = await query<RowDataPacket>(
    `SELECT i.id, i.section_id, i.group_name, i.name
       FROM capar_item_auditors a
       JOIN evidence_items i ON i.id = a.item_id AND i.deleted_at IS NULL AND i.status = 'active'
       JOIN evidence_sections s ON s.id = i.section_id AND s.deleted_at IS NULL AND s.status = 'active'
      WHERE a.auditor_id = ?
      ORDER BY s.sort_order, s.id, i.sort_order, i.id`, [auditorId]);
  if (!items.length) return [];
  const sections = await query<RowDataPacket>(
    `SELECT id, name FROM evidence_sections WHERE id IN (${[...new Set(items.map((i) => n(i.section_id)))].map(() => '?').join(',')}) ORDER BY sort_order, id`,
    [...new Set(items.map((i) => n(i.section_id)))]);
  return sections.map((s) => ({
    id: n(s.id), name: String(s.name),
    items: items.filter((i) => n(i.section_id) === n(s.id)).map((i) => ({ id: n(i.id), group_name: i.group_name ? String(i.group_name) : null, name: String(i.name) })),
  }));
}

/* ───────────────────────────── the management screen ───────────────────────────── */

export async function getManagement() {
  const auditors = await query<RowDataPacket>(
    `SELECT a.id, a.name, t.name AS type_name, t.code AS type_code
       FROM auditors a LEFT JOIN auditor_types t ON t.id = a.auditor_type_id
      WHERE a.deleted_at IS NULL AND a.status = 'active' ORDER BY a.name`);
  const sections = await query<RowDataPacket>(
    `SELECT id, name FROM evidence_sections WHERE deleted_at IS NULL AND status = 'active' ORDER BY sort_order, id`);
  const items = await query<RowDataPacket>(
    `SELECT id, section_id, group_name, name FROM evidence_items WHERE deleted_at IS NULL AND status = 'active' ORDER BY section_id, sort_order, id`);
  const links = await query<RowDataPacket>('SELECT item_id, auditor_id FROM capar_item_auditors');
  return {
    auditors: auditors.map((a) => ({ id: n(a.id), name: String(a.name), type_name: a.type_name ? String(a.type_name) : null, type_code: a.type_code ? String(a.type_code) : null })),
    sections: sections.map((s) => ({
      id: n(s.id), name: String(s.name),
      items: items.filter((i) => n(i.section_id) === n(s.id)).map((i) => ({
        id: n(i.id), name: String(i.name), group_name: i.group_name ? String(i.group_name) : null,
        auditor_ids: links.filter((l) => n(l.item_id) === n(i.id)).map((l) => n(l.auditor_id)),
      })),
    })),
  };
}

async function validAuditorIds(ids: unknown): Promise<number[]> {
  if (!Array.isArray(ids)) return fail('VALIDATION_FAILED', 'Choose the auditors as a list');
  const unique = [...new Set(ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
  if (!unique.length) return [];
  const rows = await query<RowDataPacket>(`SELECT id FROM auditors WHERE deleted_at IS NULL AND id IN (${unique.map(() => '?').join(',')})`, unique);
  if (rows.length !== unique.length) fail('INVALID_REFERENCE', 'One of the chosen auditors no longer exists');
  return unique;
}

export async function setItemAuditors(itemId: number, ids: unknown, userId: number) {
  const item = await queryOne<RowDataPacket>('SELECT id FROM evidence_items WHERE id = ? AND deleted_at IS NULL', [itemId]);
  if (!item) fail('NOT_FOUND', 'Document not found');
  const auditorIds = await validAuditorIds(ids);
  await transaction(async (conn) => {
    await conn.execute('DELETE FROM capar_item_auditors WHERE item_id = ?', [itemId]);
    for (const auditorId of auditorIds) await conn.execute('INSERT INTO capar_item_auditors (item_id, auditor_id, created_by) VALUES (?, ?, ?)', [itemId, auditorId, userId]);
  });
  return { item_id: itemId, auditor_ids: auditorIds };
}

/** `add` gives the chosen auditors to every document of the section; `set` makes them the only auditors of every document. */
export async function setSectionAuditors(sectionId: number, ids: unknown, mode: unknown, userId: number) {
  const section = await queryOne<RowDataPacket>('SELECT id FROM evidence_sections WHERE id = ? AND deleted_at IS NULL', [sectionId]);
  if (!section) fail('NOT_FOUND', 'Section not found');
  if (mode !== 'add' && mode !== 'set') fail('VALIDATION_FAILED', 'Choose whether to add the auditors or set them');
  const auditorIds = await validAuditorIds(ids);
  const items = await query<RowDataPacket>("SELECT id FROM evidence_items WHERE section_id = ? AND deleted_at IS NULL AND status = 'active'", [sectionId]);
  await transaction(async (conn) => {
    for (const item of items) {
      if (mode === 'set') await conn.execute('DELETE FROM capar_item_auditors WHERE item_id = ?', [n(item.id)]);
      for (const auditorId of auditorIds) await conn.execute('INSERT IGNORE INTO capar_item_auditors (item_id, auditor_id, created_by) VALUES (?, ?, ?)', [n(item.id), auditorId, userId]);
    }
  });
  return { section_id: sectionId, documents: items.length };
}

/* ───────────────────────────── suggestions from the auditor's type ───────────────────────────── */

const ALL = '*';

/** Section-wide defaults; Health & Safety is decided document by document, below. */
function sectionTypes(section: string): string[] {
  const name = section.toLowerCase();
  if (name.startsWith('factory profile')) return [ALL];
  if (name.startsWith('recruitment')) return ['SOCIAL', 'LEGAL'];
  if (name.startsWith('wages')) return ['PAYROLL', 'SOCIAL'];
  if (name.startsWith('employee treatment')) return ['SOCIAL', 'LEGAL'];
  if (name.startsWith('health')) return [];
  if (name.startsWith('management systems')) return ['SOCIAL', 'QUAL', 'LEGAL'];
  // SA8000, BSCI and any other social-audit list: the social auditor takes the lot, specialists pick theirs by document below.
  return ['SOCIAL'];
}

const DOCUMENT_RULES: { test: RegExp; types: string[] }[] = [
  { test: /fire|extinguish|evacuation|hydrant|sprinkler|emergency|mock drill|smoke detect/i, types: ['FIRE', 'SAFETY'] },
  { test: /boiler|\blift\b|pressure vessel|air receiver|steam receiver|compressed gas/i, types: ['BOIL', 'SAFETY'] },
  { test: /electric|genset|generator|thermograph|lock out|loto|\be\.b\.|switch/i, types: ['ELEC', 'SAFETY'] },
  { test: /drinking water|waste ?water|effluent|drainage|cooling tower|water extraction|treatment plant|\betp\b|water consumption/i, types: ['WATER', 'ENV'] },
  { test: /waste|hazardous|chemical|msds|ozone|air emission|\bvoc\b|pollution|environment|\beia\b|\biee\b|asbestos|\bpcb\b|ambient air|stack/i, types: ['ENV', 'SAFETY'] },
  { test: /ghg|greenhouse|fuel consumption|energy|co2/i, types: ['GHG', 'ENV'] },
  { test: /food|canteen|\bphi\b|kitchen/i, types: ['FOOD'] },
  { test: /licen[cs]e|certificate|permit|\bnoc\b|registration|consent|approval|incorporation|membership|insurance|bond|\btin\b|\bvat\b|legal register/i, types: ['LEGAL'] },
  { test: /payroll|salary|wage|bonus|overtime|leave|eobi|\besi\b|provident|pay ?slip|time card|settlement|increment|maternity|piece rate|attendance|remuneration/i, types: ['PAYROLL', 'SOCIAL'] },
  { test: /policy|procedure|grievance|committee|union|disciplin|harass|child labo|forced|recruit|hiring|terminat|worker|employee|contract|association/i, types: ['SOCIAL'] },
  { test: /\biso\b|quality|calibration|internal audit|management system/i, types: ['QUAL'] },
  { test: /\bgots\b|\bgrs\b|\bocs\b|\brcs\b|\brws\b|organic|recycled/i, types: ['TEXSTD'] },
  { test: /ppe|accident|injur|first aid|safety|training|machine|risk assessment|confined space|hot work|noise|illumination|ventilation|sanitation|health/i, types: ['SAFETY'] },
];

/** The auditor-type codes (prefixes) that should work on a document, or [ALL]. */
export function suggestedTypes(section: string, document: string): string[] {
  const base = sectionTypes(section);
  if (base.includes(ALL)) return [ALL];
  const found = new Set<string>(base);
  for (const rule of DOCUMENT_RULES) if (rule.test.test(document)) rule.types.forEach((type) => found.add(type));
  if (!found.size) found.add('SAFETY');
  return [...found];
}

/** Gives every document the auditors whose type suits it. Adds only: nothing an administrator set is removed. Returns how many links were added. */
export async function applySuggestions(userId: number) {
  const { auditors, sections } = await getManagement();
  let added = 0;
  await transaction(async (conn) => {
    for (const section of sections) {
      for (const item of section.items) {
        const types = suggestedTypes(section.name, item.name);
        const have = new Set(item.auditor_ids);
        for (const auditor of auditors) {
          if (have.has(auditor.id)) continue;
          const code = (auditor.type_code ?? '').toUpperCase();
          if (!types.includes(ALL) && !types.some((type) => code.startsWith(type))) continue;
          await conn.execute('INSERT IGNORE INTO capar_item_auditors (item_id, auditor_id, created_by) VALUES (?, ?, ?)', [item.id, auditor.id, userId]);
          added += 1;
        }
      }
    }
  });
  return { added };
}

export async function unassignedCount(): Promise<number> {
  const row = await queryOne<RowDataPacket>(
    `SELECT COUNT(*) AS c FROM evidence_items i JOIN evidence_sections s ON s.id = i.section_id AND s.deleted_at IS NULL AND s.status = 'active'
      WHERE i.deleted_at IS NULL AND i.status = 'active' AND NOT EXISTS (SELECT 1 FROM capar_item_auditors a WHERE a.item_id = i.id)`);
  return n(row?.c);
}

