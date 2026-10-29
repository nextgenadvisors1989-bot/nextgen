/**
 * Act & Compliance by audit type.
 *
 * The audit types the firm offers (Labour Law, Fire Safety, HIRA ...). For each, the administrator types rows of Act / Chapter / Section /
 * Sub Section / Amendments / Explain and keeps the Legal Compliance Register of that row: Forms, Returns and Statements / Declarations as
 * Word files. An auditor can read all of it and download the files; only an administrator changes anything.
 */
import { z } from 'zod';
import { execute, insert, query, queryOne, type RowDataPacket } from '@/lib/db/mysql';
import { saveUploads, archiveFile, type UploadInput } from '@/lib/files/file-service';
import type { AuthUser } from '@/types/user';

export type RegisterRole = 'admin' | 'auditor';
export interface RegisterActor { user: AuthUser; role: RegisterRole; ip?: string | null }

export const REGISTER_KINDS = ['Forms', 'Returns', 'Statement/Declaration'] as const;
type Kind = (typeof REGISTER_KINDS)[number];

function fail(code: string, message: string, issues?: { field: string; message: string }[]): never {
  throw Object.assign(new Error(message), { code, ...(issues ? { issues } : {}) });
}
const n = (value: unknown) => Number(value ?? 0);

export function registerRoleOf(user: AuthUser): RegisterRole {
  const slugs = user.roles.map((role) => role.slug);
  if (slugs.includes('super_admin') || slugs.includes('admin')) return 'admin';
  if (slugs.includes('auditor')) return 'auditor';
  return fail('FORBIDDEN', 'Your account cannot open Act & Compliance');
}

function mustAdmin(actor: RegisterActor) {
  if (actor.role !== 'admin') fail('FORBIDDEN', 'Only an administrator can change Act & Compliance');
}

const text = (max: number) => z.string().trim().max(max).optional().nullable().transform((value) => (value ? value : null));
const typeSchema = z.object({ name: z.string().trim().min(3, 'Enter the audit type').max(255), status: z.enum(['active', 'inactive']).optional() });
const rowSchema = z.object({
  act_name: text(255), chapter: text(255), section: text(255), sub_section: text(255), amendments: text(6000), explain_text: text(8000),
});

/* ───────────────────────────── audit types ───────────────────────────── */

export async function listTypes(actor: RegisterActor) {
  const rows = await query<RowDataPacket>(
    `SELECT t.id, t.name, t.sort_order, t.status,
            (SELECT COUNT(*) FROM audit_type_rows r WHERE r.audit_type_id = t.id AND r.deleted_at IS NULL) AS row_count,
            (SELECT COUNT(*) FROM audit_type_row_docs d JOIN audit_type_rows r ON r.id = d.row_id AND r.deleted_at IS NULL WHERE r.audit_type_id = t.id AND d.deleted_at IS NULL AND d.kind = 'Forms') AS forms,
            (SELECT COUNT(*) FROM audit_type_row_docs d JOIN audit_type_rows r ON r.id = d.row_id AND r.deleted_at IS NULL WHERE r.audit_type_id = t.id AND d.deleted_at IS NULL AND d.kind = 'Returns') AS returns_count,
            (SELECT COUNT(*) FROM audit_type_row_docs d JOIN audit_type_rows r ON r.id = d.row_id AND r.deleted_at IS NULL WHERE r.audit_type_id = t.id AND d.deleted_at IS NULL AND d.kind = 'Statement/Declaration') AS statements
       FROM audit_types t
      WHERE t.deleted_at IS NULL ${actor.role === 'admin' ? '' : "AND t.status = 'active'"}
      ORDER BY t.sort_order, t.id`);
  return rows.map((r) => ({
    id: n(r.id), name: String(r.name), status: String(r.status), rows: n(r.row_count), forms: n(r.forms), returns: n(r.returns_count), statements: n(r.statements),
  }));
}

export async function getType(actor: RegisterActor, id: number) {
  const type = await queryOne<RowDataPacket>('SELECT id, name, status FROM audit_types WHERE id = ? AND deleted_at IS NULL', [id]);
  if (!type || (actor.role !== 'admin' && type.status !== 'active')) fail('NOT_FOUND', 'Audit type not found');
  const rows = await query<RowDataPacket>(
    `SELECT id, act_id, act_name, chapter, section, sub_section, amendments, explain_text, sort_order
       FROM audit_type_rows WHERE audit_type_id = ? AND deleted_at IS NULL ORDER BY sort_order, id`, [id]);
  const docs = rows.length
    ? await query<RowDataPacket>(
        `SELECT d.id, d.row_id, d.kind, d.title, d.file_id, d.created_at, f.original_name, f.size_bytes
           FROM audit_type_row_docs d JOIN files f ON f.id = d.file_id AND f.deleted_at IS NULL
          WHERE d.deleted_at IS NULL AND d.row_id IN (${rows.map(() => '?').join(',')}) ORDER BY d.id`, rows.map((r) => n(r.id)))
    : [];
  const acts = await query<RowDataPacket>("SELECT id, COALESCE(NULLIF(short_name, ''), act_name) AS name, act_year FROM compliance_acts WHERE deleted_at IS NULL ORDER BY act_name");
  return {
    type: { id: n(type.id), name: String(type.name), status: String(type.status) },
    acts: acts.map((a) => (a.act_year && !String(a.name).includes(String(a.act_year)) ? `${a.name} ${a.act_year}` : String(a.name))),
    rows: rows.map((r) => ({
      id: n(r.id), act_name: r.act_name ? String(r.act_name) : '', chapter: r.chapter ? String(r.chapter) : '', section: r.section ? String(r.section) : '',
      sub_section: r.sub_section ? String(r.sub_section) : '', amendments: r.amendments ? String(r.amendments) : '', explain_text: r.explain_text ? String(r.explain_text) : '',
      docs: docs.filter((d) => n(d.row_id) === n(r.id)).map((d) => ({
        id: n(d.id), kind: String(d.kind) as Kind, title: String(d.title), file_id: n(d.file_id), name: String(d.original_name), size: n(d.size_bytes), created_at: d.created_at,
      })),
    })),
  };
}

export async function createType(actor: RegisterActor, input: unknown) {
  mustAdmin(actor);
  const data = typeSchema.parse(input);
  if (await queryOne<RowDataPacket>('SELECT id FROM audit_types WHERE name = ?', [data.name])) fail('DUPLICATE', 'That audit type is already in the list');
  const next = await queryOne<RowDataPacket>('SELECT COALESCE(MAX(sort_order), 0) + 10 AS next FROM audit_types');
  const id = await insert('INSERT INTO audit_types (name, sort_order) VALUES (?, ?)', [data.name, n(next?.next)]);
  return { id };
}

export async function updateType(actor: RegisterActor, id: number, input: unknown) {
  mustAdmin(actor);
  const data = typeSchema.parse(input);
  if (await queryOne<RowDataPacket>('SELECT id FROM audit_types WHERE name = ? AND id <> ?', [data.name, id])) fail('DUPLICATE', 'That audit type is already in the list');
  await execute('UPDATE audit_types SET name = ?, status = COALESCE(?, status) WHERE id = ? AND deleted_at IS NULL', [data.name, data.status ?? null, id]);
  return { id };
}

export async function deleteType(actor: RegisterActor, id: number) {
  mustAdmin(actor);
  await execute('UPDATE audit_types SET deleted_at = NOW() WHERE id = ?', [id]);
  return { id };
}

/* ───────────────────────────── rows (Act / Chapter / Section ...) ───────────────────────────── */

async function actIdFor(name: string | null): Promise<number | null> {
  if (!name) return null;
  const row = await queryOne<RowDataPacket>(
    `SELECT id FROM compliance_acts WHERE deleted_at IS NULL AND (act_name = ? OR short_name = ? OR CONCAT_WS(' ', COALESCE(NULLIF(short_name, ''), act_name), act_year) = ?) LIMIT 1`, [name, name, name]);
  return row ? n(row.id) : null;
}

export async function createRow(actor: RegisterActor, typeId: number, input: unknown) {
  mustAdmin(actor);
  const data = rowSchema.parse(input);
  if (!(await queryOne<RowDataPacket>('SELECT id FROM audit_types WHERE id = ? AND deleted_at IS NULL', [typeId]))) fail('NOT_FOUND', 'Audit type not found');
  if (!Object.values(data).some(Boolean)) fail('VALIDATION_FAILED', 'Fill in at least the Act', [{ field: 'act_name', message: 'Enter the Act' }]);
  const next = await queryOne<RowDataPacket>('SELECT COALESCE(MAX(sort_order), 0) + 10 AS next FROM audit_type_rows WHERE audit_type_id = ?', [typeId]);
  const id = await insert(
    `INSERT INTO audit_type_rows (audit_type_id, act_id, act_name, chapter, section, sub_section, amendments, explain_text, sort_order, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [typeId, await actIdFor(data.act_name), data.act_name, data.chapter, data.section, data.sub_section, data.amendments, data.explain_text, n(next?.next), actor.user.id]);
  return { id };
}

export async function updateRow(actor: RegisterActor, rowId: number, input: unknown) {
  mustAdmin(actor);
  const data = rowSchema.parse(input);
  if (!(await queryOne<RowDataPacket>('SELECT id FROM audit_type_rows WHERE id = ? AND deleted_at IS NULL', [rowId]))) fail('NOT_FOUND', 'Row not found');
  await execute(
    `UPDATE audit_type_rows SET act_id = ?, act_name = ?, chapter = ?, section = ?, sub_section = ?, amendments = ?, explain_text = ? WHERE id = ?`,
    [await actIdFor(data.act_name), data.act_name, data.chapter, data.section, data.sub_section, data.amendments, data.explain_text, rowId]);
  return { id: rowId };
}

export async function deleteRow(actor: RegisterActor, rowId: number) {
  mustAdmin(actor);
  await execute('UPDATE audit_type_rows SET deleted_at = NOW() WHERE id = ?', [rowId]);
  return { id: rowId };
}

/* ───────────────────────────── register documents (Word files) ───────────────────────────── */

const WORD = /\.(docx?|DOCX?)$/;

export async function addDocuments(actor: RegisterActor, rowId: number, kindInput: unknown, titleInput: unknown, uploads: UploadInput[]) {
  mustAdmin(actor);
  const kind = REGISTER_KINDS.find((value) => value === kindInput);
  if (!kind) fail('VALIDATION_FAILED', 'Choose Forms, Returns or Statement / Declaration', [{ field: 'kind', message: 'Choose one' }]);
  if (!(await queryOne<RowDataPacket>('SELECT id FROM audit_type_rows WHERE id = ? AND deleted_at IS NULL', [rowId]))) fail('NOT_FOUND', 'Row not found');
  if (!uploads.length) fail('VALIDATION_FAILED', 'Choose a Word file', [{ field: 'files', message: 'Choose a Word file' }]);
  const notWord = uploads.find((upload) => !WORD.test(upload.originalName));
  if (notWord) fail('VALIDATION_FAILED', `"${notWord.originalName}" is not a Word file. Upload .doc or .docx files.`, [{ field: 'files', message: 'Only Word files (.doc, .docx)' }]);
  const title = typeof titleInput === 'string' ? titleInput.trim().slice(0, 255) : '';
  const saved = await saveUploads(uploads, { entityType: 'COMPLIANCE_DOCUMENT', entityId: rowId, category: `Legal register: ${kind}`, accessLevel: 'auditor' }, { user: actor.user, ip: actor.ip ?? null });
  for (const file of saved) {
    await insert('INSERT INTO audit_type_row_docs (row_id, kind, title, file_id, created_by) VALUES (?, ?, ?, ?, ?)',
      [rowId, kind, (title && uploads.length === 1 ? title : String(file.original_name).replace(/\.docx?$/i, '')).slice(0, 255), file.id, actor.user.id]);
  }
  return { files: saved.length };
}

export async function deleteDocument(actor: RegisterActor, docId: number) {
  mustAdmin(actor);
  const doc = await queryOne<RowDataPacket>('SELECT id, file_id FROM audit_type_row_docs WHERE id = ? AND deleted_at IS NULL', [docId]);
  if (!doc) fail('NOT_FOUND', 'Document not found');
  await execute('UPDATE audit_type_row_docs SET deleted_at = NOW() WHERE id = ?', [docId]);
  try { await archiveFile(n(doc!.file_id), { user: actor.user, ip: actor.ip ?? null }); } catch { /* the register row is gone; an already archived file is fine */ }
  return { id: docId };
}

/** Every Word file in the register, for the "all documents" list. */
export async function listDocuments(actor: RegisterActor) {
  const rows = await query<RowDataPacket>(
    `SELECT d.id, d.kind, d.title, d.file_id, f.original_name, f.size_bytes, d.created_at, t.id AS type_id, t.name AS type_name, r.act_name
       FROM audit_type_row_docs d
       JOIN audit_type_rows r ON r.id = d.row_id AND r.deleted_at IS NULL
       JOIN audit_types t ON t.id = r.audit_type_id AND t.deleted_at IS NULL ${actor.role === 'admin' ? '' : "AND t.status = 'active'"}
       JOIN files f ON f.id = d.file_id AND f.deleted_at IS NULL
      WHERE d.deleted_at IS NULL ORDER BY t.sort_order, r.sort_order, d.kind, d.id`);
  return rows.map((d) => ({
    id: n(d.id), kind: String(d.kind), title: String(d.title), file_id: n(d.file_id), name: String(d.original_name), size: n(d.size_bytes),
    type_id: n(d.type_id), type_name: String(d.type_name), act_name: d.act_name ? String(d.act_name) : '',
  }));
}
