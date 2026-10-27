/**
 * Document vault service — the admin library's use cases.
 *
 * The byte-level work (storage drivers, MIME validation, version rows, download
 * accounting) lives in `lib/files/file-service.ts`; this layer owns the
 * platform-level behaviour: listing with filters and breakdowns, reading a
 * document with its version history, editing metadata across the whole chain,
 * uploading a new revision, and archiving/restoring with an activity trail.
 */
import { execute, query, queryOne, type RowDataPacket } from '@/lib/db/mysql';
import { writeActivityLog } from '@/lib/logger/activity-log';
import {
  addVersion, findFile, listVersions, saveUploads,
  type AccessLevel, type EntityType, type FilePayload, type UploadActor, type UploadInput,
} from '@/lib/files/file-service';
import {
  fileCategoryOptions, fileEntityBreakdown, fileExtensionBreakdown, fileStats,
  fileUploaderOptions, findFileDocument, findFiles, resolveRootId, updateFileMetadata,
} from '@/repositories/file.repository';
import { FILE_ENTITY_LABELS } from '@/types/file';
import type { FileListFilters } from '@/lib/validations/file.validation';
import type { AuthUser } from '@/types/user';

type ServiceError = Error & { code: string; details?: Record<string, unknown> };

function fail(code: string, message: string, details?: Record<string, unknown>): never {
  throw Object.assign(new Error(message), { code, details }) as ServiceError;
}

function actorOf(user: AuthUser, ip?: string | null): UploadActor {
  return { user, ip: ip ?? null };
}

/** Shape returned to uploaders and download buttons. */
function buildPayload(
  id: number, originalName: string, sizeBytes: number, mimeType: string | null, version: number
): FilePayload {
  return { id, original_name: originalName, url: `/api/files/${id}/download`, size_bytes: sizeBytes, mime_type: mimeType, version };
}

/* ─────────────────────────────── reading ─────────────────────────────────── */

export async function listFiles(filters: FileListFilters) {
  const [result, stats, extensions, entities, categories, uploaders] = await Promise.all([
    findFiles(filters),
    fileStats(),
    fileExtensionBreakdown(),
    fileEntityBreakdown(),
    fileCategoryOptions(),
    fileUploaderOptions(),
  ]);

  return {
    ...result,
    stats,
    extensions: extensions.map((row) => ({
      extension: String(row.extension),
      total: Number(row.total),
      bytes: Number(row.bytes),
    })),
    entityBreakdown: entities.map((row) => ({
      entity_type: String(row.entity_type),
      label: FILE_ENTITY_LABELS[String(row.entity_type)] ?? String(row.entity_type),
      total: Number(row.total),
      bytes: Number(row.bytes),
    })),
    categories: (categories as RowDataPacket[]).map((row) => String(row.category)),
    uploaders: (uploaders as RowDataPacket[]).map((row) => ({
      id: Number(row.id),
      name: String(row.name).trim(),
      total: Number(row.total),
    })),
  };
}

export async function getFileDetail(fileId: number) {
  const rootId = await resolveRootId(fileId, true);
  if (!rootId) fail('NOT_FOUND', 'That document is not in the vault');

  const document = await findFileDocument(rootId);
  if (!document) fail('NOT_FOUND', 'That document is not in the vault');

  const versions = await listVersions(rootId);
  const accessLogs = await queryOne<RowDataPacket>(
    'SELECT COUNT(*) AS total FROM file_access_logs WHERE file_id = ? AND action = ?',
    [rootId, 'download']
  );

  return {
    document,
    // The current revision is what the download button opens; older entries stay listed.
    current: buildPayload(
      Number(document.current_file_id ?? rootId),
      String(document.current_file_name ?? document.original_name),
      Number(document.current_size_bytes ?? document.size_bytes),
      (document.current_mime_type ?? document.mime_type) as string | null,
      Number(document.current_version ?? document.version)
    ),
    versions,
    downloadCount: Number(accessLogs?.total ?? document.download_count ?? 0),
  };
}

/* ─────────────────────────────── writing ─────────────────────────────────── */

export async function uploadFiles(
  files: UploadInput[],
  meta: {
    entityType: EntityType;
    entityId?: number | null;
    category?: string | null;
    accessLevel?: AccessLevel;
    description?: string | null;
    tags?: string | null;
    expiresAt?: string | null;
  },
  actor: { user: AuthUser; ip?: string | null }
): Promise<FilePayload[]> {
  if (!files.length) fail('VALIDATION_FAILED', 'Choose at least one file to upload');

  const saved = await saveUploads(files, {
    entityType: meta.entityType,
    entityId: meta.entityId ?? null,
    category: meta.category?.slice(0, 100) ?? null,
    accessLevel: meta.accessLevel ?? 'private',
    description: meta.description ?? null,
    tags: meta.tags ?? null,
    expiresAt: meta.expiresAt ?? null,
  }, actorOf(actor.user, actor.ip));

  return saved;
}

export async function updateMetadata(
  fileId: number,
  input: {
    original_name?: string;
    category?: string | null;
    description?: string | null;
    tags?: string | null;
    access_level?: AccessLevel;
    expires_at?: string | null;
    is_archived?: boolean;
  },
  actor: { user: AuthUser; ip?: string | null }
) {
  const rootId = await resolveRootId(fileId, true);
  if (!rootId) fail('NOT_FOUND', 'That document is not in the vault');
  const existing = await findFileDocument(rootId);
  if (!existing) fail('NOT_FOUND', 'That document is not in the vault');

  const changes: Record<string, string | number | null> = {};
  const previous: Record<string, unknown> = {};
  const next: Record<string, unknown> = {};

  const set = (column: string, value: string | number | null) => {
    changes[column] = value;
    previous[column] = (existing as unknown as Record<string, unknown>)[column] ?? null;
    next[column] = value;
  };

  if (input.original_name !== undefined) set('original_name', input.original_name.slice(0, 500));
  if (input.category !== undefined) set('category', input.category);
  if (input.description !== undefined) set('description', input.description);
  if (input.tags !== undefined) set('tags', input.tags);
  if (input.access_level !== undefined) set('access_level', input.access_level);
  if (input.expires_at !== undefined) set('expires_at', input.expires_at);
  // Restoring an archived document puts it back in the library listing; a
  // document is archived only through the DELETE route, so `is_archived: true`
  // here is a no-op unless the row is already archived.
  const archived = existing.deleted_at !== null && existing.deleted_at !== undefined;
  const restoring = input.is_archived === false && (archived || Number(existing.is_archived) === 1);
  const archiving = input.is_archived === true && !restoring;
  if (input.is_archived !== undefined) set('is_archived', input.is_archived ? 1 : 0);

  if (!Object.keys(changes).length) fail('NO_CHANGE', 'Change at least one field before saving');

  await updateFileMetadata(rootId, changes);

  if (restoring) {
    // Clearing the soft delete is what makes the document (and its revisions)
    // visible to the library and downloadable again.
    await execute('UPDATE files SET is_archived = 0, deleted_at = NULL WHERE id = ? OR parent_file_id = ?', [rootId, rootId]);
  }

  await writeActivityLog({
    userId: actor.user.id,
    userName: actor.user.fullName,
    userRole: actor.user.primaryRole,
    employerId: actor.user.employerId,
    action: restoring ? 'restored' : archiving ? 'archived' : 'updated',
    module: 'file',
    entityType: existing.entity_type,
    entityId: rootId,
    entityLabel: String(changes.original_name ?? existing.original_name),
    description: restoring
      ? `${existing.original_name} restored to the document vault`
      : archiving
        ? `${existing.original_name} archived (soft delete; the file and its history are retained)`
        : `Metadata of ${existing.original_name} updated`,
    oldValues: previous,
    newValues: next,
    ipAddress: actor.ip ?? null,
  });

  return {
    fileId: rootId,
    name: String(changes.original_name ?? existing.original_name),
    restored: restoring,
    archived: archiving,
  };
}

/** Uploads the next revision of an existing document. */
export async function uploadNewVersion(
  fileId: number,
  file: UploadInput,
  changeNote: string | null,
  actor: { user: AuthUser; ip?: string | null }
) {
  const existing = await findFile(fileId);
  if (!existing) fail('NOT_FOUND', 'That document is not in the vault');

  const result = await addVersion(fileId, file, changeNote, actorOf(actor.user, actor.ip));
  if (!result) fail('NOT_FOUND', 'That document is not in the vault');

  const rootId = Number(existing.parent_file_id ?? existing.id);
  return { ...result, rootId };
}

/**
 * Archives a document: the soft delete covers the root row and every revision,
 * so the whole history leaves the active listing together and one restore
 * brings it back intact. The bytes stay in storage.
 */
export async function removeFile(fileId: number, actor: { user: AuthUser; ip?: string | null }) {
  const rootId = await resolveRootId(fileId, true);
  if (!rootId) fail('NOT_FOUND', 'That document is not in the vault');
  const existing = await findFileDocument(rootId);
  if (!existing) fail('NOT_FOUND', 'That document is not in the vault');
  if (existing.deleted_at !== null && existing.deleted_at !== undefined) {
    fail('INVALID_STATE', 'That document is already archived');
  }

  await execute('UPDATE files SET is_archived = 1, deleted_at = NOW() WHERE id = ? OR parent_file_id = ?', [rootId, rootId]);

  await writeActivityLog({
    userId: actor.user.id,
    userName: actor.user.fullName,
    userRole: actor.user.primaryRole,
    employerId: actor.user.employerId,
    action: 'archived',
    module: 'file',
    entityType: existing.entity_type,
    entityId: rootId,
    entityLabel: existing.original_name,
    description: `${existing.original_name} archived (soft delete; the file and its ${Number(existing.version_count ?? 1)} version(s) are retained)`,
    oldValues: { original_name: existing.original_name, version_count: Number(existing.version_count ?? 1) },
    ipAddress: actor.ip ?? null,
  });

  return { fileId: rootId, name: existing.original_name, archived: true };
}

/* ─────────────────────────── attachment helper ───────────────────────────── */

/**
 * Files attached to a record (employee, audit report, compliance document …).
 * Used by detail pages that render the `FileList` component.
 */
export async function filesForEntity(entityType: EntityType, entityId: number) {
  return query<RowDataPacket>(
    `SELECT f.id, f.original_name, f.mime_type, f.size_bytes, f.version, f.category, f.description,
            f.is_current_version, f.created_at, f.is_archived,
            CONCAT(COALESCE(u.first_name, 'System'), ' ', COALESCE(u.last_name, '')) AS uploaded_by_name,
            (SELECT COUNT(*) FROM file_versions v WHERE v.file_id = f.id) AS version_count
       FROM files f
       LEFT JOIN users u ON u.id = f.uploaded_by
      WHERE f.entity_type = ? AND f.entity_id = ? AND f.deleted_at IS NULL AND f.parent_file_id IS NULL
      ORDER BY f.created_at DESC`,
    [entityType, entityId]
  );
}

/** Re-exported so route handlers do not reach into the low-level module. */
export { findFile, listVersions };
