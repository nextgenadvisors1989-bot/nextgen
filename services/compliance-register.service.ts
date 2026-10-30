/**
 * Audit and Assessment, and Act & Compliance.
 *
 *   Audit and Assessment   the audit types the firm offers (Labour Law, Fire Safety, HIRA ...). A type opens its own form (not built yet).
 *   Act & Compliance       one table of Act / Chapter / Section / Sub Section / Amendments / Explain. Each row has a Legal Compliance
 *                          Register of Forms, Returns and Statements / Declarations, written by hand (and, if wanted, with a Word file).
 *
 * An administrator changes all of it; an auditor reads it.
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
  return fail('FORBIDDEN', 'Your account cannot open this page');
}

function mustAdmin(actor: RegisterActor) {
  if (actor.role !== 'admin') fail('FORBIDDEN', 'Only an administrator can change this');
}

const text = (max: number) => z.string().trim().max(max).optional().nullable().transform((value) => (value ? value : null));
const typeSchema = z.object({ name: z.string().trim().min(3, 'Enter the audit type').max(255), status: z.enum(['active', 'inactive']).optional() });
const rowSchema = z.object({
  act_name: text(255), chapter: text(255), section: text(255), sub_section: text(255), amendments: text(6000), explain_text: text(8000),
});

/* ───────────────────────────── audit types ───────────────────────────── */

export async function listTypes(actor: RegisterActor) {
  const rows = await query<RowDataPacket>(
    `SELECT id, name, sort_order, status FROM audit_types WHERE deleted_at IS NULL ${actor.role === 'admin' ? '' : "AND status = 'active'"} ORDER BY sort_order, id`);
  return rows.map((r) => ({ id: n(r.id), name: String(r.name), status: String(r.status) }));
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

/* ───────────────────────────── Act & Compliance rows ───────────────────────────── */

export async function listRows(actor: RegisterActor) {
  void actor;
  const rows = await query<RowDataPacket>(
    `SELECT id, act_name, chapter, section, sub_section, amendments, explain_text FROM audit_type_rows WHERE deleted_at IS NULL ORDER BY sort_order, id`);
  const docs = rows.length
    ? await query<RowDataPacket>(
        `SELECT d.id, d.row_id, d.kind, d.title, d.content, d.file_id, d.created_at, f.original_name, f.size_bytes
           FROM audit_type_row_docs d LEFT JOIN files f ON f.id = d.file_id AND f.deleted_at IS NULL
          WHERE d.deleted_at IS NULL AND d.row_id IN (${rows.map(() => '?').join(',')}) ORDER BY d.id`, rows.map((r) => n(r.id)))
    : [];
  const acts = await query<RowDataPacket>("SELECT COALESCE(NULLIF(short_name, ''), act_name) AS name, act_year FROM compliance_acts WHERE deleted_at IS NULL ORDER BY act_name");
  return {
    acts: acts.map((a) => (a.act_year && !String(a.name).includes(String(a.act_year)) ? `${a.name} ${a.act_year}` : String(a.name))),
    rows: rows.map((r) => ({
      id: n(r.id), act_name: r.act_name ? String(r.act_name) : '', chapter: r.chapter ? String(r.chapter) : '', section: r.section ? String(r.section) : '',
      sub_section: r.sub_section ? String(r.sub_section) : '', amendments: r.amendments ? String(r.amendments) : '', explain_text: r.explain_text ? String(r.explain_text) : '',
      records: docs.filter((d) => n(d.row_id) === n(r.id)).map((d) => ({
        id: n(d.id), kind: String(d.kind) as Kind, title: String(d.title), content: d.content ? String(d.content) : '',
        file_id: d.file_id ? n(d.file_id) : null, file_name: d.original_name ? String(d.original_name) : null, size: n(d.size_bytes),
      })),
    })),
  };
}

async function actIdFor(name: string | null): Promise<number | null> {
  if (!name) return null;
  const row = await queryOne<RowDataPacket>(
    `SELECT id FROM compliance_acts WHERE deleted_at IS NULL AND (act_name = ? OR short_name = ? OR CONCAT_WS(' ', COALESCE(NULLIF(short_name, ''), act_name), act_year) = ?) LIMIT 1`, [name, name, name]);
  return row ? n(row.id) : null;
}

export async function createRow(actor: RegisterActor, input: unknown) {
  mustAdmin(actor);
  const data = rowSchema.parse(input);
  if (!data.act_name) fail('VALIDATION_FAILED', 'Enter the Act', [{ field: 'act_name', message: 'Enter the Act' }]);
  const next = await queryOne<RowDataPacket>('SELECT COALESCE(MAX(sort_order), 0) + 10 AS next FROM audit_type_rows');
  const id = await insert(
    `INSERT INTO audit_type_rows (audit_type_id, act_id, act_name, chapter, section, sub_section, amendments, explain_text, sort_order, created_by)
     VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [await actIdFor(data.act_name), data.act_name, data.chapter, data.section, data.sub_section, data.amendments, data.explain_text, n(next?.next), actor.user.id]);
  return { id };
}

export async function updateRow(actor: RegisterActor, rowId: number, input: unknown) {
  mustAdmin(actor);
  const data = rowSchema.parse(input);
  if (!data.act_name) fail('VALIDATION_FAILED', 'Enter the Act', [{ field: 'act_name', message: 'Enter the Act' }]);
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

/* ───────────────────────────── the Legal Compliance Register of a row ───────────────────────────── */

const WORD = /\.(docx?)$/i;
const recordSchema = z.object({
  title: z.string().trim().min(2, 'Give it a name').max(255),
  content: z.string().trim().max(60000).optional().nullable().transform((value) => (value ? value : null)),
});

export async function addRecord(actor: RegisterActor, rowId: number, kindInput: unknown, input: unknown, uploads: UploadInput[] = []) {
  mustAdmin(actor);
  const kind = REGISTER_KINDS.find((value) => value === kindInput);
  if (!kind) fail('VALIDATION_FAILED', 'Choose Forms, Returns or Statement / Declaration', [{ field: 'kind', message: 'Choose one' }]);
  if (!(await queryOne<RowDataPacket>('SELECT id FROM audit_type_rows WHERE id = ? AND deleted_at IS NULL', [rowId]))) fail('NOT_FOUND', 'Row not found');
  const data = recordSchema.parse(input);
  if (!data.content && !uploads.length) fail('VALIDATION_FAILED', 'Type the details, or attach a Word file', [{ field: 'content', message: 'Type the details' }]);
  const notWord = uploads.find((upload) => !WORD.test(upload.originalName));
  if (notWord) fail('VALIDATION_FAILED', `"${notWord.originalName}" is not a Word file. Attach a .doc or .docx file.`, [{ field: 'files', message: 'Only Word files (.doc, .docx)' }]);
  let fileId: number | null = null;
  if (uploads.length) {
    const saved = await saveUploads(uploads.slice(0, 1), { entityType: 'COMPLIANCE_DOCUMENT', entityId: rowId, category: `Legal register: ${kind}`, accessLevel: 'auditor' }, { user: actor.user, ip: actor.ip ?? null });
    fileId = saved[0].id;
  }
  const id = await insert('INSERT INTO audit_type_row_docs (row_id, kind, title, content, file_id, created_by) VALUES (?, ?, ?, ?, ?, ?)', [rowId, kind, data.title, data.content, fileId, actor.user.id]);
  return { id };
}

export async function updateRecord(actor: RegisterActor, docId: number, input: unknown) {
  mustAdmin(actor);
  const data = recordSchema.parse(input);
  const doc = await queryOne<RowDataPacket>('SELECT id, file_id FROM audit_type_row_docs WHERE id = ? AND deleted_at IS NULL', [docId]);
  if (!doc) fail('NOT_FOUND', 'Record not found');
  if (!data.content && !doc!.file_id) fail('VALIDATION_FAILED', 'Type the details', [{ field: 'content', message: 'Type the details' }]);
  await execute('UPDATE audit_type_row_docs SET title = ?, content = ?, updated_at = NOW() WHERE id = ?', [data.title, data.content, docId]);
  return { id: docId };
}

export async function deleteDocument(actor: RegisterActor, docId: number) {
  mustAdmin(actor);
  const doc = await queryOne<RowDataPacket>('SELECT id, file_id FROM audit_type_row_docs WHERE id = ? AND deleted_at IS NULL', [docId]);
  if (!doc) fail('NOT_FOUND', 'Record not found');
  await execute('UPDATE audit_type_row_docs SET deleted_at = NOW() WHERE id = ?', [docId]);
  if (doc!.file_id) {
    try { await archiveFile(n(doc!.file_id), { user: actor.user, ip: actor.ip ?? null }); } catch { /* an already archived file is fine */ }
  }
  return { id: docId };
}
