/**
 * CAPAR categories and the documents under them.
 *
 * Every CAPAR report is made of the same six categories (Governance, Social Security System, Health & Safety, Environmental System,
 * Security System, Work Permit System) for every auditor. The documents are the Audit Documents checklist (evidence_items); each one
 * belongs to one category, which the administrator can change in CAPAR Management. On a report the auditor ticks the categories being
 * audited and only those are reported.
 */
import { execute, query, queryOne, transaction, type RowDataPacket } from '@/lib/db/mysql';

function fail(code: string, message: string): never {
  throw Object.assign(new Error(message), { code });
}
const n = (value: unknown) => Number(value ?? 0);

export interface ChecklistGroup { id: number; name: string; items: { id: number; group_name: string | null; name: string }[] }

export async function listGroups() {
  const rows = await query<RowDataPacket>("SELECT id, name FROM capar_groups WHERE status = 'active' ORDER BY sort_order, id");
  return rows.map((row) => ({ id: n(row.id), name: String(row.name) }));
}

/** The six categories with their documents. A document the administrator has not placed yet sits under the first category. */
export async function checklistGroups(): Promise<ChecklistGroup[]> {
  const groups = await listGroups();
  if (!groups.length) return [];
  const items = await query<RowDataPacket>(
    `SELECT i.id, i.capar_group_id, i.group_name, i.name
       FROM evidence_items i JOIN evidence_sections s ON s.id = i.section_id AND s.deleted_at IS NULL AND s.status = 'active'
      WHERE i.deleted_at IS NULL AND i.status = 'active'
      ORDER BY s.sort_order, s.id, i.sort_order, i.id`);
  return groups.map((group, index) => ({
    id: group.id,
    name: group.name,
    items: items
      .filter((item) => (item.capar_group_id ? n(item.capar_group_id) === group.id : index === 0))
      .map((item) => ({ id: n(item.id), group_name: item.group_name ? String(item.group_name) : null, name: String(item.name) })),
  }));
}

/* ───────────────────────────── the categories ticked on a report ───────────────────────────── */

export async function reportGroupIds(reportId: number): Promise<number[]> {
  const rows = await query<RowDataPacket>('SELECT group_id FROM capar_report_groups WHERE report_id = ?', [reportId]);
  return rows.map((row) => n(row.group_id));
}

export async function setReportGroups(reportId: number, ids: unknown): Promise<number[]> {
  if (!Array.isArray(ids)) fail('VALIDATION_FAILED', 'Choose the categories as a list');
  const wanted = [...new Set((ids as unknown[]).map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
  const valid = new Set((await listGroups()).map((group) => group.id));
  if (wanted.some((id) => !valid.has(id))) fail('INVALID_REFERENCE', 'One of the categories no longer exists');
  await transaction(async (conn) => {
    await conn.execute('DELETE FROM capar_report_groups WHERE report_id = ?', [reportId]);
    for (const id of wanted) await conn.execute('INSERT INTO capar_report_groups (report_id, group_id) VALUES (?, ?)', [reportId, id]);
  });
  return wanted;
}

/* ───────────────────────────── CAPAR Management (administrator) ───────────────────────────── */

export async function getManagement() {
  const groups = await listGroups();
  const sections = await query<RowDataPacket>("SELECT id, name FROM evidence_sections WHERE deleted_at IS NULL AND status = 'active' ORDER BY sort_order, id");
  const items = await query<RowDataPacket>(
    "SELECT id, section_id, capar_group_id, name FROM evidence_items WHERE deleted_at IS NULL AND status = 'active' ORDER BY section_id, sort_order, id");
  return {
    groups,
    sections: sections.map((section) => ({
      id: n(section.id), name: String(section.name),
      items: items.filter((item) => n(item.section_id) === n(section.id)).map((item) => ({ id: n(item.id), name: String(item.name), group_id: item.capar_group_id ? n(item.capar_group_id) : null })),
    })),
  };
}

async function checkGroup(groupId: unknown): Promise<number> {
  const id = Number(groupId);
  if (!(await queryOne<RowDataPacket>("SELECT id FROM capar_groups WHERE id = ? AND status = 'active'", [id]))) fail('INVALID_REFERENCE', 'Choose one of the six categories');
  return id;
}

export async function setItemGroup(itemId: number, groupId: unknown) {
  const group = await checkGroup(groupId);
  if (!(await queryOne<RowDataPacket>('SELECT id FROM evidence_items WHERE id = ? AND deleted_at IS NULL', [itemId]))) fail('NOT_FOUND', 'Document not found');
  await execute('UPDATE evidence_items SET capar_group_id = ? WHERE id = ?', [group, itemId]);
  return { item_id: itemId, group_id: group };
}

export async function setSectionGroup(sectionId: number, groupId: unknown) {
  const group = await checkGroup(groupId);
  if (!(await queryOne<RowDataPacket>('SELECT id FROM evidence_sections WHERE id = ? AND deleted_at IS NULL', [sectionId]))) fail('NOT_FOUND', 'Section not found');
  const result = await query<RowDataPacket>('SELECT id FROM evidence_items WHERE section_id = ? AND deleted_at IS NULL', [sectionId]);
  await execute('UPDATE evidence_items SET capar_group_id = ? WHERE section_id = ? AND deleted_at IS NULL', [group, sectionId]);
  return { section_id: sectionId, group_id: group, documents: result.length };
}
