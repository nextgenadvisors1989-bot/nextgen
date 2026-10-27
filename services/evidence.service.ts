/**
 * Employer pre-audit document pack.
 *
 * The administrator keeps the checklist (sections and items) and chooses which sections each auditor receives. An employer records, item by item,
 * whether a document is provided (with reference, validity, notes and files) and submits the pack: every submission is a dated snapshot.
 * An auditor downloads the latest submission before a CAPAR can be started for that employer; each download is recorded.
 */
import { z } from 'zod';
import { execute, insert, query, queryOne, transaction, type PoolConnection, type RowDataPacket } from '@/lib/db/mysql';
import { saveUploads, archiveFile, type UploadInput } from '@/lib/files/file-service';
import type { AuthUser } from '@/types/user';

export type EvidenceRole = 'admin' | 'employer' | 'auditor';
export interface EvidenceActor { user: AuthUser; role: EvidenceRole; ip?: string | null }

function fail(message: string, code: string, extra: Record<string, unknown> = {}): never {
  throw Object.assign(new Error(message), { code, ...extra });
}
const invalid = (field: string, message: string): never => fail('Validation failed. Please correct the highlighted fields.', 'VALIDATION_FAILED', { issues: [{ field, message }] });
const n = (value: unknown) => Number(value ?? 0);

export function evidenceRoleOf(user: AuthUser): EvidenceRole {
  const slugs = user.roles.map((role) => role.slug);
  if (slugs.includes('super_admin') || slugs.includes('admin')) return 'admin';
  if (slugs.includes('auditor')) return 'auditor';
  if (slugs.includes('employer')) return 'employer';
  return fail('Your account cannot open the document pack', 'FORBIDDEN');
}

/** A DATETIME as `YYYY-MM-DD HH:mm:ss` in local time (the column is local time). */
function stamp(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    const p = (x: number) => String(x).padStart(2, '0');
    return `${value.getFullYear()}-${p(value.getMonth() + 1)}-${p(value.getDate())} ${p(value.getHours())}:${p(value.getMinutes())}:${p(value.getSeconds())}`;
  }
  return String(value).replace('T', ' ').slice(0, 19);
}
const day = (value: unknown) => (value ? stamp(value)!.slice(0, 10) : null);

/* ───────────────────────────── template (administrator) ───────────────────────────── */

const label = (max: number) => z.string().trim().min(2, 'Enter a name').max(max);
const optional = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));
const sectionSchema = z.object({ name: label(200), description: optional(500), sort_order: z.coerce.number().int().min(0).max(1000000).optional(), status: z.enum(['active', 'inactive']).default('active') });
const itemSchema = z.object({ section_id: z.coerce.number().int().positive(), group_name: optional(200), name: label(500), sort_order: z.coerce.number().int().min(0).max(1000000).optional(), status: z.enum(['active', 'inactive']).default('active') });

function mustAdmin(actor: EvidenceActor) {
  if (actor.role !== 'admin') fail('Only an administrator can change the checklist', 'FORBIDDEN');
}

export async function listTemplate(actor: EvidenceActor) {
  mustAdmin(actor);
  const sections = await query<RowDataPacket>(
    `SELECT s.id, s.name, s.description, s.sort_order, s.status,
            (SELECT COUNT(*) FROM evidence_items i WHERE i.section_id = s.id AND i.deleted_at IS NULL) AS item_count
       FROM evidence_sections s WHERE s.deleted_at IS NULL ORDER BY s.sort_order, s.id`);
  const items = await query<RowDataPacket>(
    'SELECT id, section_id, group_name, name, sort_order, status FROM evidence_items WHERE deleted_at IS NULL ORDER BY section_id, sort_order, id');
  return sections.map((s) => ({ ...s, id: n(s.id), item_count: n(s.item_count), sort_order: n(s.sort_order), items: items.filter((i) => n(i.section_id) === n(s.id)).map((i) => ({ ...i, id: n(i.id), section_id: n(i.section_id), sort_order: n(i.sort_order) })) }));
}

export async function createSection(actor: EvidenceActor, payload: unknown) {
  mustAdmin(actor);
  const input = sectionSchema.parse(payload);
  const next = n((await queryOne<RowDataPacket>('SELECT COALESCE(MAX(sort_order), 0) + 10 AS next FROM evidence_sections WHERE deleted_at IS NULL'))?.next);
  const id = await insert('INSERT INTO evidence_sections (name, description, sort_order, status) VALUES (?, ?, ?, ?)', [input.name, input.description, input.sort_order ?? next, input.status]);
  return { id };
}

export async function updateSection(actor: EvidenceActor, id: number, payload: unknown) {
  mustAdmin(actor);
  const input = sectionSchema.parse(payload);
  const result = await execute('UPDATE evidence_sections SET name = ?, description = ?, sort_order = COALESCE(?, sort_order), status = ? WHERE id = ? AND deleted_at IS NULL', [input.name, input.description, input.sort_order ?? null, input.status, id]);
  if (!result.affectedRows) fail('Section not found', 'NOT_FOUND');
  return { id };
}

export async function deleteSection(actor: EvidenceActor, id: number) {
  mustAdmin(actor);
  const result = await execute('UPDATE evidence_sections SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL', [id]);
  if (!result.affectedRows) fail('Section not found', 'NOT_FOUND');
  await execute('UPDATE evidence_items SET deleted_at = NOW() WHERE section_id = ? AND deleted_at IS NULL', [id]);
  await execute('DELETE FROM auditor_evidence_sections WHERE section_id = ?', [id]);
  return { id };
}

export async function createItem(actor: EvidenceActor, payload: unknown) {
  mustAdmin(actor);
  const input = itemSchema.parse(payload);
  if (!(await queryOne<RowDataPacket>('SELECT id FROM evidence_sections WHERE id = ? AND deleted_at IS NULL', [input.section_id]))) invalid('section_id', 'That section no longer exists');
  const next = n((await queryOne<RowDataPacket>('SELECT COALESCE(MAX(sort_order), 0) + 10 AS next FROM evidence_items WHERE section_id = ? AND deleted_at IS NULL', [input.section_id]))?.next);
  const id = await insert('INSERT INTO evidence_items (section_id, group_name, name, sort_order, status) VALUES (?, ?, ?, ?, ?)', [input.section_id, input.group_name, input.name, input.sort_order ?? next, input.status]);
  return { id };
}

export async function updateItem(actor: EvidenceActor, id: number, payload: unknown) {
  mustAdmin(actor);
  const input = itemSchema.parse(payload);
  if (!(await queryOne<RowDataPacket>('SELECT id FROM evidence_sections WHERE id = ? AND deleted_at IS NULL', [input.section_id]))) invalid('section_id', 'That section no longer exists');
  const result = await execute('UPDATE evidence_items SET section_id = ?, group_name = ?, name = ?, sort_order = COALESCE(?, sort_order), status = ? WHERE id = ? AND deleted_at IS NULL', [input.section_id, input.group_name, input.name, input.sort_order ?? null, input.status, id]);
  if (!result.affectedRows) fail('Item not found', 'NOT_FOUND');
  return { id };
}

export async function deleteItem(actor: EvidenceActor, id: number) {
  mustAdmin(actor);
  const result = await execute('UPDATE evidence_items SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL', [id]);
  if (!result.affectedRows) fail('Item not found', 'NOT_FOUND');
  return { id };
}

/* ───────────────────────────── auditor access (administrator) ───────────────────────────── */

export async function getAccess(actor: EvidenceActor, auditorId: number) {
  mustAdmin(actor);
  if (!(await queryOne<RowDataPacket>('SELECT id FROM auditors WHERE id = ? AND deleted_at IS NULL', [auditorId]))) fail('Auditor not found', 'NOT_FOUND');
  const rows = await query<RowDataPacket>(
    `SELECT s.id, s.name, (SELECT COUNT(*) FROM evidence_items i WHERE i.section_id = s.id AND i.deleted_at IS NULL AND i.status = 'active') AS item_count,
            EXISTS (SELECT 1 FROM auditor_evidence_sections a WHERE a.auditor_id = ? AND a.section_id = s.id) AS granted
       FROM evidence_sections s WHERE s.deleted_at IS NULL AND s.status = 'active' ORDER BY s.sort_order, s.id`, [auditorId]);
  return rows.map((r) => ({ id: n(r.id), name: String(r.name), item_count: n(r.item_count), granted: Boolean(Number(r.granted)) }));
}

export async function listAccess(actor: EvidenceActor) {
  mustAdmin(actor);
  const auditors = await query<RowDataPacket>(
    `SELECT a.id, a.name, a.email, t.name AS type_name,
            (SELECT COUNT(*) FROM auditor_evidence_sections x WHERE x.auditor_id = a.id) AS sections
       FROM auditors a LEFT JOIN auditor_types t ON t.id = a.auditor_type_id WHERE a.deleted_at IS NULL ORDER BY a.name`);
  return auditors.map((a) => ({ id: n(a.id), name: String(a.name), email: a.email ?? null, type_name: a.type_name ?? null, sections: n(a.sections) }));
}

export async function setAccess(actor: EvidenceActor, auditorId: number, payload: unknown) {
  mustAdmin(actor);
  const { section_ids } = z.object({ section_ids: z.array(z.coerce.number().int().positive()).max(200) }).parse(payload);
  if (!(await queryOne<RowDataPacket>('SELECT id FROM auditors WHERE id = ? AND deleted_at IS NULL', [auditorId]))) fail('Auditor not found', 'NOT_FOUND');
  const valid = section_ids.length
    ? (await query<RowDataPacket>(`SELECT id FROM evidence_sections WHERE deleted_at IS NULL AND id IN (${section_ids.map(() => '?').join(',')})`, section_ids)).map((r) => n(r.id))
    : [];
  await transaction(async (conn) => {
    await conn.execute('DELETE FROM auditor_evidence_sections WHERE auditor_id = ?', [auditorId]);
    for (const sectionId of valid) await conn.execute('INSERT INTO auditor_evidence_sections (auditor_id, section_id, created_by) VALUES (?, ?, ?)', [auditorId, sectionId, actor.user.id]);
  });
  return { auditor_id: auditorId, sections: valid.length };
}

async function allowedSectionIds(actor: EvidenceActor): Promise<number[] | null> {
  if (actor.role !== 'auditor') return null; // null = every active section
  const rows = await query<RowDataPacket>(
    `SELECT a.section_id FROM auditor_evidence_sections a JOIN evidence_sections s ON s.id = a.section_id AND s.deleted_at IS NULL AND s.status = 'active' WHERE a.auditor_id = ?`, [n(actor.user.auditorId)]);
  return rows.map((r) => n(r.section_id));
}

/* ───────────────────────────── the employer's checklist ───────────────────────────── */

async function checkEmployer(actor: EvidenceActor, employerId: number, write: boolean) {
  const employer = await queryOne<RowDataPacket>('SELECT id, company_name, employer_code FROM employers WHERE id = ? AND deleted_at IS NULL', [employerId]);
  if (!employer) fail('Company not found', 'NOT_FOUND');
  if (actor.role === 'employer' && n(actor.user.employerId) !== employerId) fail('Company not found', 'NOT_FOUND');
  if (actor.role === 'auditor' && write) fail('An auditor cannot change the employer\'s documents', 'FORBIDDEN');
  return employer!;
}

export async function latestSubmission(employerId: number) {
  const row = await queryOne<RowDataPacket>(
    `SELECT id, submitted_at, submitted_by_name, total_items, provided_items, na_items, pending_items, note FROM evidence_submissions WHERE employer_id = ? ORDER BY submitted_at DESC, id DESC LIMIT 1`, [employerId]);
  return row ? { id: n(row.id), submitted_at: stamp(row.submitted_at), submitted_by_name: row.submitted_by_name ?? null, total_items: n(row.total_items), provided_items: n(row.provided_items), na_items: n(row.na_items), pending_items: n(row.pending_items), note: row.note ?? null } : null;
}

async function loadSections(employerId: number, allowed: number[] | null) {
  if (allowed && !allowed.length) return [];
  const filter = allowed ? `AND s.id IN (${allowed.map(() => '?').join(',')})` : '';
  const sections = await query<RowDataPacket>(`SELECT s.id, s.name, s.description FROM evidence_sections s WHERE s.deleted_at IS NULL AND s.status = 'active' ${filter} ORDER BY s.sort_order, s.id`, allowed ?? []);
  if (!sections.length) return [];
  const ids = sections.map((s) => n(s.id));
  const items = await query<RowDataPacket>(
    `SELECT i.id, i.section_id, i.group_name, i.name, e.id AS evidence_id, e.status, e.reference_no, e.valid_until, e.notes, e.updated_at
       FROM evidence_items i LEFT JOIN employer_evidence e ON e.item_id = i.id AND e.employer_id = ?
      WHERE i.deleted_at IS NULL AND i.status = 'active' AND i.section_id IN (${ids.map(() => '?').join(',')}) ORDER BY i.section_id, i.sort_order, i.id`, [employerId, ...ids]);
  const evidenceIds = items.map((i) => n(i.evidence_id)).filter(Boolean);
  const files = evidenceIds.length
    ? await query<RowDataPacket>(
      `SELECT ef.evidence_id, f.id AS file_id, f.original_name, f.size_bytes, f.created_at FROM employer_evidence_files ef JOIN files f ON f.id = ef.file_id AND f.deleted_at IS NULL
        WHERE ef.evidence_id IN (${evidenceIds.map(() => '?').join(',')}) ORDER BY ef.id`, evidenceIds)
    : [];
  return sections.map((s) => ({
    id: n(s.id), name: String(s.name), description: s.description ?? null,
    items: items.filter((i) => n(i.section_id) === n(s.id)).map((i) => ({
      id: n(i.id), group_name: i.group_name ?? null, name: String(i.name), status: (i.status ?? 'Pending') as 'Pending' | 'Provided' | 'Not applicable',
      reference_no: i.reference_no ?? null, valid_until: day(i.valid_until), notes: i.notes ?? null, updated_at: stamp(i.updated_at),
      files: files.filter((f) => n(f.evidence_id) === n(i.evidence_id)).map((f) => ({ id: n(f.file_id), name: String(f.original_name), size_bytes: n(f.size_bytes), url: `/api/files/${n(f.file_id)}/download` })),
    })),
  }));
}

/** A comparable fingerprint of a pack: each document's status, reference, validity, notes and files. */
function signature(sections: { items: { id: number; status: string; reference_no: string | null; valid_until: string | null; notes: string | null; files: { id: number }[] }[] }[]): string {
  return sections.flatMap((s) => s.items).map((i) => [i.id, i.status, i.reference_no ?? '', i.valid_until ?? '', i.notes ?? '', i.files.map((f) => f.id).join(',')].join('|')).sort().join(';');
}

export async function getChecklist(actor: EvidenceActor, employerId: number) {
  const employer = await checkEmployer(actor, employerId, false);
  const allowed = await allowedSectionIds(actor);
  const sections = await loadSections(employerId, allowed);
  const items = sections.flatMap((s) => s.items);
  const summary = { total: items.length, provided: items.filter((i) => i.status === 'Provided').length, na: items.filter((i) => i.status === 'Not applicable').length, pending: items.filter((i) => i.status === 'Pending').length };
  const latest = await latestSubmission(employerId);
  let changedSince = false;
  if (latest) {
    // Compare what the employer has now with what it last submitted (every active document, not only the sections this caller may see).
    const stored = await queryOne<RowDataPacket>('SELECT snapshot FROM evidence_submissions WHERE id = ?', [latest.id]);
    const was = signature((JSON.parse(String(stored?.snapshot ?? '{"sections":[]}')) as Snapshot).sections);
    changedSince = was !== signature(await loadSections(employerId, null));
  }
  let downloaded: string | null = null;
  if (actor.role === 'auditor' && latest) {
    const row = await queryOne<RowDataPacket>('SELECT MAX(downloaded_at) AS at FROM evidence_pack_downloads WHERE auditor_id = ? AND submission_id = ?', [n(actor.user.auditorId), latest.id]);
    downloaded = stamp(row?.at);
  }
  return {
    employer: { id: n(employer.id), name: String(employer.company_name), code: employer.employer_code ?? null },
    sections, summary, latest, downloaded_at: downloaded,
    changed_since_submission: changedSince,
    can: { edit: actor.role !== 'auditor', submit: actor.role !== 'auditor', download: Boolean(latest) },
  };
}

const itemInput = z.object({
  status: z.enum(['Pending', 'Provided', 'Not applicable']),
  reference_no: optional(150),
  valid_until: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date'), z.literal(''), z.null()]).optional().transform((v) => (v ? v : null)),
  notes: optional(2000),
});

async function ensureEvidence(employerId: number, itemId: number, userId: number) {
  if (!(await queryOne<RowDataPacket>("SELECT id FROM evidence_items WHERE id = ? AND deleted_at IS NULL AND status = 'active'", [itemId]))) fail('That document is not on the checklist', 'NOT_FOUND');
  await execute('INSERT INTO employer_evidence (employer_id, item_id, updated_by) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE updated_by = VALUES(updated_by)', [employerId, itemId, userId]);
  return n((await queryOne<RowDataPacket>('SELECT id FROM employer_evidence WHERE employer_id = ? AND item_id = ?', [employerId, itemId]))!.id);
}

export async function saveItem(actor: EvidenceActor, employerId: number, itemId: number, payload: unknown) {
  await checkEmployer(actor, employerId, true);
  const input = itemInput.parse(payload);
  const evidenceId = await ensureEvidence(employerId, itemId, actor.user.id);
  await execute('UPDATE employer_evidence SET status = ?, reference_no = ?, valid_until = ?, notes = ?, updated_by = ? WHERE id = ?', [input.status, input.reference_no, input.valid_until, input.notes, actor.user.id, evidenceId]);
  return { id: evidenceId };
}

export async function attachFiles(actor: EvidenceActor, employerId: number, itemId: number, uploads: UploadInput[]) {
  await checkEmployer(actor, employerId, true);
  if (!uploads.length) invalid('files', 'Choose at least one file');
  const evidenceId = await ensureEvidence(employerId, itemId, actor.user.id);
  const saved = await saveUploads(uploads, { entityType: 'EMPLOYER', entityId: employerId, category: 'Audit document', accessLevel: 'private' }, { user: actor.user, ip: actor.ip });
  for (const file of saved) await execute('INSERT IGNORE INTO employer_evidence_files (evidence_id, file_id, created_by) VALUES (?, ?, ?)', [evidenceId, file.id, actor.user.id]);
  // Attaching a file means the document is there: a still-pending item becomes Provided.
  await execute("UPDATE employer_evidence SET status = 'Provided', updated_by = ? WHERE id = ? AND status = 'Pending'", [actor.user.id, evidenceId]);
  return saved;
}

export async function removeFile(actor: EvidenceActor, employerId: number, itemId: number, fileId: number) {
  await checkEmployer(actor, employerId, true);
  const link = await queryOne<RowDataPacket>(
    'SELECT ef.id FROM employer_evidence_files ef JOIN employer_evidence e ON e.id = ef.evidence_id WHERE e.employer_id = ? AND e.item_id = ? AND ef.file_id = ?', [employerId, itemId, fileId]);
  if (!link) fail('File not found', 'NOT_FOUND');
  await execute('DELETE FROM employer_evidence_files WHERE id = ?', [n(link!.id)]);
  await archiveFile(fileId, { user: actor.user, ip: actor.ip });
  await execute('UPDATE employer_evidence SET updated_by = ? WHERE employer_id = ? AND item_id = ?', [actor.user.id, employerId, itemId]);
  return { id: fileId };
}

/* ───────────────────────────── submissions ───────────────────────────── */

export interface SnapshotItem { id: number; group_name: string | null; name: string; status: string; reference_no: string | null; valid_until: string | null; notes: string | null; files: { id: number; name: string }[] }
export interface Snapshot { sections: { id: number; name: string; items: SnapshotItem[] }[] }

export async function submitPack(actor: EvidenceActor, employerId: number, payload: unknown) {
  await checkEmployer(actor, employerId, true);
  const { note } = z.object({ note: optional(1000) }).parse(payload ?? {});
  const sections = await loadSections(employerId, null);
  const items = sections.flatMap((s) => s.items);
  const provided = items.filter((i) => i.status === 'Provided').length;
  const na = items.filter((i) => i.status === 'Not applicable').length;
  if (provided + na === 0) invalid('items', 'Mark at least one document as provided or not applicable before you submit');
  const snapshot: Snapshot = { sections: sections.map((s) => ({ id: s.id, name: s.name, items: s.items.map((i) => ({ id: i.id, group_name: i.group_name, name: i.name, status: i.status, reference_no: i.reference_no, valid_until: i.valid_until, notes: i.notes, files: i.files.map((f) => ({ id: f.id, name: f.name })) })) })) };
  const id = await insert(
    `INSERT INTO evidence_submissions (employer_id, submitted_by, submitted_by_name, total_items, provided_items, na_items, pending_items, note, snapshot) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [employerId, actor.user.id, actor.user.fullName, items.length, provided, na, items.length - provided - na, note, JSON.stringify(snapshot)]);
  return { id, ...(await latestSubmission(employerId)) };
}

export async function listSubmissions(actor: EvidenceActor, employerId: number) {
  await checkEmployer(actor, employerId, false);
  const rows = await query<RowDataPacket>(
    'SELECT id, submitted_at, submitted_by_name, total_items, provided_items, na_items, pending_items, note FROM evidence_submissions WHERE employer_id = ? ORDER BY submitted_at DESC, id DESC LIMIT 50', [employerId]);
  return rows.map((r) => ({ id: n(r.id), submitted_at: stamp(r.submitted_at), submitted_by_name: r.submitted_by_name ?? null, total_items: n(r.total_items), provided_items: n(r.provided_items), na_items: n(r.na_items), pending_items: n(r.pending_items), note: r.note ?? null }));
}

/** A submission for the pack PDF, narrowed to the sections the caller may see; an auditor's download is recorded. */
export async function submissionForPdf(actor: EvidenceActor, submissionId: number, recordDownload: boolean) {
  const row = await queryOne<RowDataPacket>('SELECT s.*, e.company_name, e.employer_code FROM evidence_submissions s JOIN employers e ON e.id = s.employer_id WHERE s.id = ?', [submissionId]);
  if (!row) fail('Submission not found', 'NOT_FOUND');
  await checkEmployer(actor, n(row!.employer_id), false);
  const snapshot = JSON.parse(String(row!.snapshot)) as Snapshot;
  const allowed = await allowedSectionIds(actor);
  if (allowed && !allowed.length) fail('No document sections have been given to you for this audit. Ask the administrator.', 'FORBIDDEN');
  const sections = allowed ? snapshot.sections.filter((s) => allowed.includes(s.id)) : snapshot.sections;
  if (actor.role === 'auditor' && recordDownload) {
    await execute('INSERT INTO evidence_pack_downloads (submission_id, auditor_id, user_id) VALUES (?, ?, ?)', [submissionId, n(actor.user.auditorId), actor.user.id]);
  }
  return {
    submission: { id: n(row!.id), employer_id: n(row!.employer_id), company_name: String(row!.company_name), employer_code: row!.employer_code ?? null, submitted_at: stamp(row!.submitted_at)!, submitted_by_name: row!.submitted_by_name ?? null, note: row!.note ?? null },
    sections,
  };
}

/* ───────────────────────────── the auditor's view ───────────────────────────── */

export async function auditorEmployers(actor: EvidenceActor) {
  if (actor.role === 'employer') fail('Not available for your role', 'FORBIDDEN');
  const allowed = await allowedSectionIds(actor);
  const rows = await query<RowDataPacket>(
    `SELECT e.id, e.company_name, e.employer_code, e.city,
            (SELECT s.id FROM evidence_submissions s WHERE s.employer_id = e.id ORDER BY s.submitted_at DESC, s.id DESC LIMIT 1) AS sub_id
       FROM employers e WHERE e.deleted_at IS NULL AND e.status = 'active' ORDER BY e.company_name`);
  const out = [];
  for (const r of rows) {
    const latest = r.sub_id ? await latestSubmission(n(r.id)) : null;
    let downloaded: string | null = null;
    if (actor.role === 'auditor' && latest) {
      const d = await queryOne<RowDataPacket>('SELECT MAX(downloaded_at) AS at FROM evidence_pack_downloads WHERE auditor_id = ? AND submission_id = ?', [n(actor.user.auditorId), latest.id]);
      downloaded = stamp(d?.at);
    }
    out.push({ id: n(r.id), company_name: String(r.company_name), employer_code: r.employer_code ?? null, city: r.city ?? null, latest, downloaded_at: downloaded });
  }
  return { employers: out, sections_granted: allowed ? allowed.length : null };
}

/**
 * Called before an auditor starts a CAPAR for an employer. An auditor who has been given document sections must have downloaded
 * the employer's latest submitted pack. An auditor with no sections has nothing to download; an administrator is never held up.
 */
export async function assertPackDownloaded(user: AuthUser, employerId: number) {
  if (evidenceRoleOf(user) !== 'auditor') return;
  const actor: EvidenceActor = { user, role: 'auditor' };
  const allowed = await allowedSectionIds(actor);
  if (!allowed || !allowed.length) return;
  const latest = await latestSubmission(employerId);
  if (!latest) fail('This company has not submitted its document pack yet. Ask the employer to submit it from the employer portal before you start the audit.', 'PACK_REQUIRED');
  const done = await queryOne<RowDataPacket>('SELECT id FROM evidence_pack_downloads WHERE auditor_id = ? AND submission_id = ? LIMIT 1', [n(user.auditorId), latest!.id]);
  if (!done) fail('Download the employer\'s submitted document pack (Audit documents) before you start the audit.', 'PACK_REQUIRED');
}

export type { PoolConnection };
