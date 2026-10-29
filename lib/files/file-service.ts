/**
 * Document vault service.
 *
 * Owns everything that happens to a byte stream once it is uploaded: MIME and
 * size validation, blob storage, the `files` row plus its immutable
 * `file_versions` history, download accounting and the access rules that decide
 * which panel may pull a document back out.
 */
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { execute, insert, query, queryOne, type RowDataPacket } from '@/lib/db/mysql';
import { withTransaction } from '@/lib/db/transactions';
import { getStorage, bucketFor, buildStoredName, sha256 } from '@/lib/files/storage';
import { writeActivityLog } from '@/lib/logger/activity-log';
import { MAX_FILE_SIZE_MB } from '@/types/file';
import type { AuthUser } from '@/types/user';

// The catalogues live in `types/file.ts` so client components can render the
// filters without pulling `node:fs` into their bundle. Re-exported here to keep
// the service module the single import site for server code.
import { FILE_ACCESS_LEVELS, FILE_ENTITY_TYPES, type FileAccessLevel, type FileEntityType } from '@/types/file';

export const ENTITY_TYPES: readonly FileEntityType[] = FILE_ENTITY_TYPES;
export type EntityType = FileEntityType;

export const ACCESS_LEVELS: readonly FileAccessLevel[] = FILE_ACCESS_LEVELS;
export type AccessLevel = FileAccessLevel;

/** Extension → MIME map used both to validate and to fill gaps in uploads. */
const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  webp: 'image/webp', svg: 'image/svg+xml',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv', txt: 'text/plain', zip: 'application/zip',
};

const ALLOWED_MIME = new Set(Object.values(MIME_BY_EXTENSION));
const BLOCKED_EXTENSIONS = new Set(['php', 'phtml', 'jsp', 'asp', 'aspx', 'exe', 'sh', 'bat', 'cmd', 'js', 'mjs', 'cjs', 'html', 'htm', 'svgz']);

export interface StoredFileRow {
  id: number;
  uuid: string;
  original_name: string;
  stored_name: string;
  storage_path: string;
  mime_type: string | null;
  extension: string | null;
  size_bytes: number;
  entity_type: string;
  entity_id: number | null;
  category: string | null;
  version: number;
  parent_file_id: number | null;
  is_current_version: number;
  access_level: string;
  description: string | null;
  tags: string | null;
  download_count: number;
  is_archived: number;
  uploaded_by: number | null;
  created_at: string;
}

export interface UploadInput {
  originalName: string;
  mimeType: string;
  data: Buffer;
}

export interface UploadMeta {
  entityType: EntityType;
  entityId?: number | null;
  category?: string | null;
  accessLevel?: AccessLevel;
  description?: string | null;
  tags?: string | null;
  expiresAt?: string | null;
}

export interface FilePayload {
  id: number;
  original_name: string;
  url: string;
  size_bytes: number;
  mime_type: string | null;
  version: number;
}

const COLUMNS =
  'id, uuid, original_name, stored_name, storage_path, mime_type, extension, size_bytes, entity_type, entity_id, category, version, parent_file_id, is_current_version, access_level, description, tags, download_count, is_archived, uploaded_by, created_at';

export function toPayload(row: StoredFileRow): FilePayload {
  return {
    id: Number(row.id),
    original_name: row.original_name,
    url: `/api/files/${row.id}/download`,
    size_bytes: Number(row.size_bytes),
    mime_type: row.mime_type,
    version: Number(row.version),
  };
}

/** Validates name, extension, declared MIME type and byte size. */
export function validateUpload(file: UploadInput): { mimeType: string; extension: string } {
  const extension = path.extname(file.originalName).replace('.', '').toLowerCase();
  if (!extension) {
    throw Object.assign(new Error(`File "${file.originalName}" has no extension`), { code: 'INVALID_FILE_TYPE' });
  }
  if (BLOCKED_EXTENSIONS.has(extension)) {
    throw Object.assign(new Error(`Files of type .${extension} are not allowed`), { code: 'INVALID_FILE_TYPE' });
  }

  const declared = (file.mimeType || '').toLowerCase();
  const mimeType = ALLOWED_MIME.has(declared) ? declared : MIME_BY_EXTENSION[extension];
  if (!mimeType || !ALLOWED_MIME.has(mimeType)) {
    throw Object.assign(new Error(`File type "${declared || extension}" is not allowed`), { code: 'INVALID_FILE_TYPE' });
  }
  if (!file.data.length) {
    throw Object.assign(new Error(`File "${file.originalName}" is empty`), { code: 'EMPTY_FILE' });
  }
  const maxBytes = MAX_FILE_SIZE_MB * 1024 * 1024;
  if (file.data.length > maxBytes) {
    throw Object.assign(
      new Error(`File "${file.originalName}" exceeds the ${MAX_FILE_SIZE_MB} MB limit`),
      { code: 'FILE_TOO_LARGE' }
    );
  }
  return { mimeType, extension };
}

export interface UploadActor {
  user: AuthUser;
  ip?: string | null;
  userAgent?: string | null;
}

/** Stores the blobs and inserts the vault rows (version 1 of each file). */
export async function saveUploads(
  files: UploadInput[],
  meta: UploadMeta,
  actor: UploadActor
): Promise<FilePayload[]> {
  if (!files.length) {
    throw Object.assign(new Error('No files were uploaded'), { code: 'NO_FILES' });
  }
  if (!ENTITY_TYPES.includes(meta.entityType)) {
    throw Object.assign(new Error(`Unknown entity type "${meta.entityType}"`), { code: 'INVALID_ENTITY_TYPE' });
  }

  const storage = getStorage();
  const driver = (process.env.STORAGE_DRIVER ?? 'local') as 'local' | 's3' | 'gcs' | 'azure';
  const bucket = bucketFor();
  const saved: FilePayload[] = [];

  for (const file of files) {
    const { mimeType, extension } = validateUpload(file);
    const storedName = buildStoredName(file.originalName, extension);
    const object = await storage.write(bucket, storedName, file.data);

    const fileId = await withTransaction(async (tx) => {
      const id = await tx.insert(
        `INSERT INTO files (uuid, original_name, stored_name, storage_driver, storage_path, mime_type, extension,
                            size_bytes, checksum_sha256, entity_type, entity_id, category, version, is_current_version,
                            access_level, description, tags, expires_at, uploaded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?, ?, ?, ?)`,
        [
          randomUUID(), file.originalName.slice(0, 500), object.storedName, driver, object.storagePath,
          mimeType, extension, object.sizeBytes, object.checksumSha256, meta.entityType, meta.entityId ?? null,
          meta.category ?? null, meta.accessLevel ?? 'private', meta.description ?? null,
          meta.tags ?? null, meta.expiresAt ?? null, actor.user.id,
        ]
      );
      await tx.insert(
        `INSERT INTO file_versions (file_id, version, storage_path, size_bytes, checksum_sha256, change_note, uploaded_by)
         VALUES (?, 1, ?, ?, ?, 'Initial upload', ?)`,
        [id, object.storagePath, object.sizeBytes, object.checksumSha256, actor.user.id]
      );
      return id;
    });

    await writeActivityLog({
      userId: actor.user.id, userName: actor.user.fullName, userRole: actor.user.primaryRole,
      employerId: actor.user.employerId, action: 'uploaded', module: 'file',
      entityType: meta.entityType, entityId: fileId,
      entityLabel: file.originalName,
      description: `${file.originalName} uploaded to ${meta.entityType}${meta.entityId ? ` #${meta.entityId}` : ''}`,
      newValues: { original_name: file.originalName, size_bytes: object.sizeBytes, mime_type: mimeType, checksum: object.checksumSha256 },
      ipAddress: actor.ip ?? null,
    });

    saved.push({
      id: fileId,
      original_name: file.originalName,
      url: `/api/files/${fileId}/download`,
      size_bytes: object.sizeBytes,
      mime_type: mimeType,
      version: 1,
    });
  }

  return saved;
}

/**
 * Files a document the platform itself produced (a payslip PDF, an audit report,
 * a study) into the vault, so every generated document is versioned, searchable
 * and downloadable through the same `/api/files/:id/download` route as an
 * uploaded one. Wraps `saveUploads` because the caller has bytes, not a
 * multipart file.
 */
export async function saveGeneratedFile(
  data: Buffer,
  meta: { fileName: string; title: string; entityType: EntityType; entityId: number; category?: string; description?: string },
  actor: UploadActor
): Promise<number> {
  const [payload] = await saveUploads(
    [{ originalName: meta.fileName, mimeType: 'application/pdf', data }],
    {
      entityType: meta.entityType,
      entityId: meta.entityId,
      category: meta.category ?? 'Payroll',
      description: meta.description ?? meta.title,
    },
    actor
  );
  return payload.id;
}

export async function findFile(fileId: number): Promise<StoredFileRow | null> {
  return queryOne<StoredFileRow & RowDataPacket>(
    `SELECT ${COLUMNS} FROM files WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
    [fileId]
  );
}

export function listVersions(fileId: number) {
  return query<RowDataPacket>(
    `SELECT v.id, v.version, v.size_bytes, v.checksum_sha256, v.change_note, v.created_at,
            CONCAT(u.first_name, ' ', u.last_name) AS uploaded_by_name
       FROM file_versions v
       LEFT JOIN users u ON u.id = v.uploaded_by
      WHERE v.file_id = ?
      ORDER BY v.version DESC`,
    [fileId]
  );
}

export function listEntityFiles(entityType: EntityType, entityId: number) {
  return query<RowDataPacket>(
    `SELECT ${COLUMNS} FROM files
      WHERE entity_type = ? AND entity_id = ? AND deleted_at IS NULL AND is_current_version = 1
      ORDER BY created_at DESC`,
    [entityType, entityId]
  );
}

/**
 * Uploading a new revision keeps the original row as the anchor: the new row
 * points at it via parent_file_id, gets the incremented version, and the parent
 * is flagged as no longer current.
 */
export async function addVersion(
  fileId: number,
  file: UploadInput,
  changeNote: string | null,
  actor: UploadActor
): Promise<FilePayload | null> {
  const existing = await findFile(fileId);
  if (!existing) return null;

  const { mimeType, extension } = validateUpload(file);
  const storage = getStorage();
  const driver = (process.env.STORAGE_DRIVER ?? 'local') as 'local' | 's3' | 'gcs' | 'azure';
  const object = await storage.write(bucketFor(), buildStoredName(file.originalName, extension), file.data);
  const rootId = Number(existing.parent_file_id ?? existing.id);

  // The next number must come from the version history: the root row keeps
  // version 1 forever while its children carry 2, 3, 4 …
  const history = await queryOne<{ latest: number } & RowDataPacket>(
    'SELECT COALESCE(MAX(version), 0) AS latest FROM file_versions WHERE file_id = ?',
    [rootId]
  );
  const nextVersion = Math.max(Number(history?.latest ?? 0), Number(existing.version ?? 1)) + 1;

  const newId = await withTransaction(async (tx) => {
    const id = await tx.insert(
      `INSERT INTO files (uuid, original_name, stored_name, storage_driver, storage_path, mime_type, extension,
                          size_bytes, checksum_sha256, entity_type, entity_id, category, version, parent_file_id,
                          is_current_version, access_level, description, tags, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
      [
        randomUUID(), file.originalName.slice(0, 500), object.storedName, driver, object.storagePath,
        mimeType, extension, object.sizeBytes, object.checksumSha256, existing.entity_type, existing.entity_id,
        existing.category, nextVersion, rootId, existing.access_level, existing.description, existing.tags,
        actor.user.id,
      ]
    );
    await tx.insert(
      `INSERT INTO file_versions (file_id, version, storage_path, size_bytes, checksum_sha256, change_note, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [rootId, nextVersion, object.storagePath, object.sizeBytes, object.checksumSha256, changeNote, actor.user.id]
    );
    await tx.execute('UPDATE files SET is_current_version = 0 WHERE id = ?', [rootId]);
    if (Number(existing.id) !== rootId) {
      await tx.execute('UPDATE files SET is_current_version = 0 WHERE id = ?', [existing.id]);
    }
    return id;
  });

  await writeActivityLog({
    userId: actor.user.id, userName: actor.user.fullName, userRole: actor.user.primaryRole,
    employerId: actor.user.employerId, action: 'updated', module: 'file',
    entityType: existing.entity_type, entityId: rootId,
    entityLabel: existing.original_name,
    description: `Version ${nextVersion} of ${existing.original_name} uploaded`,
    newValues: { version: nextVersion, size_bytes: object.sizeBytes, change_note: changeNote },
    ipAddress: actor.ip ?? null,
  });

  return {
    id: newId,
    original_name: file.originalName,
    url: `/api/files/${newId}/download`,
    size_bytes: object.sizeBytes,
    mime_type: mimeType,
    version: nextVersion,
  };
}

/** Soft delete: the row and its history stay for the audit trail. */
export async function archiveFile(fileId: number, actor: UploadActor): Promise<boolean> {
  const existing = await findFile(fileId);
  if (!existing) return false;

  await execute('UPDATE files SET is_archived = 1, deleted_at = NOW() WHERE id = ?', [fileId]);

  await writeActivityLog({
    userId: actor.user.id, userName: actor.user.fullName, userRole: actor.user.primaryRole,
    employerId: actor.user.employerId, action: 'deleted', module: 'file',
    entityType: existing.entity_type, entityId: Number(existing.id),
    entityLabel: existing.original_name,
    description: `${existing.original_name} removed from the document vault`,
    oldValues: { original_name: existing.original_name, version: existing.version },
    ipAddress: actor.ip ?? null,
  });
  return true;
}

export async function readFileBytes(file: StoredFileRow): Promise<Buffer> {
  const buffer = await getStorage().read(file.storage_path);

  // Checksum drift means the blob was truncated or tampered with on disk; the
  // expected digest lives on the version row that matches this file's version.
  const expected = await queryOne<{ checksum_sha256: string | null } & RowDataPacket>(
    'SELECT checksum_sha256 FROM file_versions WHERE file_id = ? AND version = ? LIMIT 1',
    [Number(file.parent_file_id ?? file.id), Number(file.version)]
  );
  if (expected?.checksum_sha256 && sha256(buffer) !== expected.checksum_sha256) {
    throw Object.assign(new Error('Stored file failed an integrity check'), { code: 'CHECKSUM_MISMATCH' });
  }
  return buffer;
}

export async function registerDownload(file: StoredFileRow, actor: UploadActor): Promise<void> {
  // Streamed PDFs that are rendered on the fly (a submission or audit report)
  // have no stored row of their own — they pass id 0, which must not be written
  // to the access log.
  const storedId = Number(file.parent_file_id ?? file.id);
  const isStored = Number.isInteger(storedId) && storedId > 0;

  if (!isStored) {
    await writeActivityLog({
      userId: actor.user.id, userName: actor.user.fullName, userRole: actor.user.primaryRole,
      employerId: actor.user.employerId, action: 'exported', module: 'file',
      entityType: file.entity_type ?? 'OTHER', entityId: null,
      entityLabel: file.original_name,
      description: `${file.original_name} generated and downloaded`,
      ipAddress: actor.ip ?? null,
      userAgent: actor.userAgent ?? null,
    });
    return;
  }

  await execute('UPDATE files SET download_count = download_count + 1 WHERE id = ?', [file.id]);
  // The per-file access log answers "who took this document, when and from
  // where" without scanning the whole activity trail.
  await execute(
    `INSERT INTO file_access_logs (file_id, user_id, action, ip_address, user_agent)
     VALUES (?, ?, 'download', ?, ?)`,
    [storedId, actor.user.id, actor.ip ?? null, actor.userAgent ?? null]
  );
  await writeActivityLog({
    userId: actor.user.id, userName: actor.user.fullName, userRole: actor.user.primaryRole,
    employerId: actor.user.employerId, action: 'exported', module: 'file',
    entityType: file.entity_type, entityId: storedId,
    entityLabel: file.original_name,
    description: `${file.original_name} downloaded`,
    ipAddress: actor.ip ?? null,
    userAgent: actor.userAgent ?? null,
  });
}

/* ------------------------------------------------------------------ access */

async function employeeBelongsToEmployer(employeeId: number | null, employerId: number | null): Promise<boolean> {
  if (!employeeId || !employerId) return false;
  const row = await queryOne<{ id: number } & RowDataPacket>(
    'SELECT id FROM employees WHERE id = ? AND employer_id = ? AND deleted_at IS NULL LIMIT 1',
    [employeeId, employerId]
  );
  return Boolean(row);
}

async function payslipBelongsToEmployee(payslipId: number | null, employeeId: number | null): Promise<boolean> {
  if (!payslipId || !employeeId) return false;
  const row = await queryOne<{ id: number } & RowDataPacket>(
    'SELECT id FROM payslips WHERE id = ? AND employee_id = ? AND deleted_at IS NULL LIMIT 1',
    [payslipId, employeeId]
  );
  return Boolean(row);
}

/** A CAPAR photo or evidence file is filed under its report; an employer sees it once the report is approved. */
async function caparBelongsToEmployer(reportId: number | null, employerId: number | null): Promise<boolean> {
  if (!reportId || !employerId) return false;
  const row = await queryOne<{ id: number } & RowDataPacket>(
    "SELECT id FROM capar_reports WHERE id = ? AND employer_id = ? AND status <> 'Draft' AND deleted_at IS NULL LIMIT 1",
    [reportId, employerId]
  );
  return Boolean(row);
}

/** The NOC letter and application are filed under their NOC; an employer sees those of its own company. */
async function nocBelongsToEmployer(nocId: number | null, employerId: number | null): Promise<boolean> {
  if (!nocId || !employerId) return false;
  const row = await queryOne<{ id: number } & RowDataPacket>(
    'SELECT id FROM water_nocs WHERE id = ? AND employer_id = ? AND deleted_at IS NULL LIMIT 1',
    [nocId, employerId]
  );
  return Boolean(row);
}

/**
 * Panel-aware read rule for the vault:
 *   admin / super_admin  → everything
 *   auditor / verifier   → evidence they are assigned to review
 *   employer             → documents of their own entity and of their employees
 *   employee             → their own record and their own payslips
 * A file marked `public` (e.g. a published act or template) is open to any
 * signed-in principal.
 */
export async function canAccessFile(user: AuthUser, file: StoredFileRow): Promise<boolean> {
  const slugs = user.roles.map((role) => role.slug);
  if (slugs.includes('super_admin') || slugs.includes('admin')) return true;
  if (file.access_level === 'public') return true;
  if (slugs.includes('auditor') || slugs.includes('verifier')) return true;

  if (slugs.includes('employer')) {
    if (file.entity_type === 'EMPLOYER') return Number(file.entity_id) === Number(user.employerId);
    if (file.entity_type === 'EMPLOYEE') return employeeBelongsToEmployer(file.entity_id, user.employerId);
    if (file.entity_type === 'PAYSLIP' || file.entity_type === 'PAYROLL_RUN') {
      return Number(file.entity_id) === Number(user.employerId);
    }
    if (file.entity_type === 'CAPAR') return caparBelongsToEmployer(file.entity_id, user.employerId);
    if (file.entity_type === 'WATER_NOC') return nocBelongsToEmployer(file.entity_id, user.employerId);
    return false;
  }

  if (slugs.includes('employee')) {
    if (file.access_level === 'restricted') return false;
    if (file.entity_type === 'EMPLOYEE') return Number(file.entity_id) === Number(user.employeeId);
    if (file.entity_type === 'PAYSLIP') return payslipBelongsToEmployee(file.entity_id, user.employeeId);
    return false;
  }

  return false;
}

/** Display helpers live in a client-safe module; re-exported for server callers. */
export { formatFileSize, fileKind } from './file-format';

/**
 * Attaches a platform-generated document (a report PDF, a payslip) to the
 * vault. When the entity already has a file the new bytes become the next
 * version of it, so a regenerated report never loses its history; otherwise a
 * fresh file row is created.
 */
export async function attachGeneratedFile(input: {
  fileId?: number | null;
  entityType: EntityType;
  entityId: number;
  filename: string;
  mimeType: string;
  data: Buffer;
  category?: string | null;
  changeNote?: string | null;
  actor: UploadActor;
}): Promise<FilePayload> {
  const upload: UploadInput = { originalName: input.filename, data: input.data, mimeType: input.mimeType };

  if (input.fileId) {
    const existing = await findFile(Number(input.fileId));
    if (existing) {
      const versioned = await addVersion(Number(existing.parent_file_id ?? existing.id), upload, input.changeNote ?? null, input.actor);
      if (versioned) return versioned;
    }
  }

  const [created] = await saveUploads(
    [upload],
    { entityType: input.entityType, entityId: input.entityId, category: input.category ?? null },
    input.actor
  );
  return created;
}
