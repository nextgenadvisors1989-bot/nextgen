/**
 * Document-vault queries for the admin library.
 *
 * `files` stores one row per stored blob; a document is the *root* row and its
 * later revisions are children pointing at it through `parent_file_id` while
 * `is_current_version` marks the newest. Every read here therefore lists roots
 * only and resolves the current revision, its byte size and its name inline, so
 * the library table shows one line per document rather than one per upload.
 */
import { execute, query, queryOne, type RowDataPacket } from '@/lib/db/mysql';
import { buildSearch, eqFilter, paginatedQuery, type ListQuery, type SqlValue } from '@/lib/db/query-helpers';
import type { FileListFilters } from '@/lib/validations/file.validation';

export const FILE_COLUMNS =
  `f.id, f.uuid, f.original_name, f.stored_name, f.storage_driver, f.storage_path, f.mime_type, f.extension,
   f.size_bytes, f.checksum_sha256, f.entity_type, f.entity_id, f.category, f.version, f.parent_file_id,
   f.is_current_version, f.access_level, f.description, f.tags, f.is_archived, f.expires_at, f.uploaded_by,
   f.created_at, f.updated_at`;

/**
 * Entity label resolution. Each entity type lives in its own table, so the
 * library joins them through a CASE rather than fifteen LEFT JOINs.
 */
export const ENTITY_LABEL_SQL = `CASE f.entity_type
    WHEN 'EMPLOYER' THEN (SELECT e.company_name FROM employers e WHERE e.id = f.entity_id)
    WHEN 'EMPLOYEE' THEN (SELECT emp.name FROM employees emp WHERE emp.id = f.entity_id)
    WHEN 'AUDITOR' THEN (SELECT a.name FROM auditors a WHERE a.id = f.entity_id)
    WHEN 'AUDIT_ASSIGNMENT' THEN (SELECT CONCAT(assign.assignment_number, ' — ', assign.audit_title) FROM audit_assignments assign WHERE assign.id = f.entity_id)
    WHEN 'AUDIT_REPORT' THEN (SELECT CONCAT(r.report_number, ' — ', r.audit_title) FROM audit_reports r WHERE r.id = f.entity_id)
    WHEN 'SUBMISSION' THEN (SELECT CONCAT(s.submission_number, ' — ', COALESCE(s.title, 'Submission')) FROM dynamic_form_submissions s WHERE s.id = f.entity_id)
    WHEN 'PAYSLIP' THEN (SELECT p.payslip_number FROM payslips p WHERE p.id = f.entity_id)
    WHEN 'PAYROLL_RUN' THEN (SELECT pr.run_number FROM payroll_runs pr WHERE pr.id = f.entity_id)
    WHEN 'COMPLIANCE_DOCUMENT' THEN (SELECT d.document_name FROM compliance_documents d WHERE d.id = f.entity_id)
    WHEN 'WORK_PERMIT' THEN (SELECT CONCAT(wp.permit_number, ' — ', COALESCE(wp.permit_type, 'Permit')) FROM work_permits wp WHERE wp.id = f.entity_id)
    WHEN 'CMS_MEDIA' THEN (SELECT m.title FROM cms_media m WHERE m.id = f.entity_id)
    WHEN 'STUDY' THEN (SELECT st.title FROM study_reports st WHERE st.id = f.entity_id)
    WHEN 'RISK' THEN (SELECT rr.title FROM risk_reports rr WHERE rr.id = f.entity_id)
    WHEN 'ASSESSMENT' THEN (SELECT ar.title FROM assessment_reports ar WHERE ar.id = f.entity_id)
    WHEN 'USER' THEN (SELECT CONCAT(u.first_name, ' ', COALESCE(u.last_name, '')) FROM users u WHERE u.id = f.entity_id)
    ELSE NULL
  END`;

/**
 * The newest revision of a document (falls back to the root when it is current).
 * Deliberately blind to `deleted_at`: a chain is archived as a whole, and the
 * document detail page still resolves its revisions while archived.
 */
const CURRENT_ID_SQL = `COALESCE((SELECT c.id FROM files c
    WHERE c.is_current_version = 1 AND (c.id = f.id OR c.parent_file_id = f.id)
    ORDER BY c.version DESC LIMIT 1), f.id)`;

const LATEST_VERSION_SQL = `(SELECT COALESCE(MAX(v.version), f.version) FROM file_versions v WHERE v.file_id = f.id)`;

/** Size of the newest revision — the number the library table shows. */
const CURRENT_SIZE_SQL = `(SELECT c.size_bytes FROM files c WHERE c.id = ${CURRENT_ID_SQL})`;

const VERSION_COUNT_SQL = `(SELECT COUNT(*) FROM file_versions v WHERE v.file_id = f.id)`;

const DOWNLOAD_COUNT_SQL = `(SELECT COALESCE(SUM(dc.download_count), 0) FROM files dc WHERE dc.id = f.id OR dc.parent_file_id = f.id)`;

/**
 * Sort keys → ORDER BY expressions. The list helper matches the requested key
 * against `allowedSortColumns`, so the caller's key is translated first and the
 * expressions themselves become the allowed set. `current_size_bytes` and
 * `download_count` are SELECT aliases, which MySQL resolves in ORDER BY.
 */
const SORTABLE: Record<string, string> = {
  original_name: 'f.original_name',
  size_bytes: CURRENT_SIZE_SQL,
  version: 'f.version',
  created_at: 'f.created_at',
  updated_at: 'f.updated_at',
  download_count: DOWNLOAD_COUNT_SQL,
  entity_type: 'f.entity_type',
  access_level: 'f.access_level',
  category: 'f.category',
  expires_at: 'f.expires_at',
};

export async function findFiles(filters: FileListFilters) {
  const params: SqlValue[] = [];
  // Roots only: one row per document, later revisions resolve through CURRENT_ID_SQL.
  let where = ' WHERE f.parent_file_id IS NULL';

  where += buildSearch(filters.search ?? null, ['f.original_name', 'f.description', 'f.tags', 'f.category'], params);

  // Archiving is a soft delete (`deleted_at` + `is_archived`), so the archived
  // segment is exactly the rows the active listing hides.
  const status = filters.status ?? 'current';
  if (status === 'current') where += ' AND f.deleted_at IS NULL AND f.is_archived = 0';
  if (status === 'archived') where += ' AND f.deleted_at IS NOT NULL';

  if (filters.entity_type && filters.entity_type !== 'all') where += eqFilter('f.entity_type', filters.entity_type, params);
  if (filters.entity_id) where += eqFilter('f.entity_id', Number(filters.entity_id), params);
  if (filters.access_level && filters.access_level !== 'all') where += eqFilter('f.access_level', filters.access_level, params);
  if (filters.category && filters.category !== 'all') where += eqFilter('f.category', filters.category, params);
  if (filters.extension && filters.extension !== 'all') where += eqFilter('f.extension', String(filters.extension).toLowerCase(), params);
  if (filters.uploaded_by) where += eqFilter('f.uploaded_by', Number(filters.uploaded_by), params);
  if (filters.from_date) {
    where += ' AND f.created_at >= ?';
    params.push(`${filters.from_date} 00:00:00`);
  }
  if (filters.to_date) {
    where += ' AND f.created_at <= ?';
    params.push(`${filters.to_date} 23:59:59`);
  }

  if (filters.kind) {
    const kindSql: Record<string, string> = {
      pdf: `f.mime_type LIKE '%pdf%'`,
      image: `f.mime_type LIKE 'image/%'`,
      sheet: `(f.mime_type LIKE '%sheet%' OR f.mime_type LIKE '%excel%' OR f.mime_type LIKE '%csv%')`,
      doc: `(f.mime_type LIKE '%word%' OR f.mime_type LIKE '%document%')`,
      archive: `f.mime_type LIKE '%zip%'`,
      other: `f.mime_type IS NOT NULL AND f.mime_type NOT LIKE '%pdf%' AND f.mime_type NOT LIKE 'image/%'
              AND f.mime_type NOT LIKE '%sheet%' AND f.mime_type NOT LIKE '%excel%' AND f.mime_type NOT LIKE '%csv%'
              AND f.mime_type NOT LIKE '%word%' AND f.mime_type NOT LIKE '%document%' AND f.mime_type NOT LIKE '%zip%'`,
    };
    where += ` AND (${kindSql[filters.kind]})`;
  }

  const baseSql = `SELECT ${FILE_COLUMNS},
      ${CURRENT_ID_SQL} AS current_file_id,
      ${CURRENT_SIZE_SQL} AS current_size_bytes,
      (SELECT c.mime_type FROM files c WHERE c.id = ${CURRENT_ID_SQL}) AS current_mime_type,
      (SELECT c.original_name FROM files c WHERE c.id = ${CURRENT_ID_SQL}) AS current_file_name,
      ${LATEST_VERSION_SQL} AS latest_version,
      ${VERSION_COUNT_SQL} AS version_count,
      ${DOWNLOAD_COUNT_SQL} AS download_count,
      (${ENTITY_LABEL_SQL}) AS entity_label,
      CONCAT(COALESCE(u.first_name, 'System'), ' ', COALESCE(u.last_name, '')) AS uploaded_by_name,
      COALESCE(u.email, '') AS uploaded_by_email
    FROM files f
    LEFT JOIN users u ON u.id = f.uploaded_by${where}`;

  const countSql = `SELECT COUNT(*) FROM files f${where}`;

  const sortExpression = filters.sortBy ? SORTABLE[filters.sortBy] ?? null : null;

  return paginatedQuery<RowDataPacket>(baseSql, countSql, params, {
    ...(filters as unknown as ListQuery),
    sortBy: sortExpression,
    allowedSortColumns: Object.values(SORTABLE),
    defaultSort: 'f.created_at',
  });
}

export async function fileStats() {
  const row = await queryOne<RowDataPacket>(
    `SELECT
       SUM(f.deleted_at IS NULL AND f.is_archived = 0) AS total,
       SUM(f.deleted_at IS NOT NULL OR f.is_archived = 1) AS archived,
       COALESCE(SUM(CASE WHEN f.deleted_at IS NULL AND f.is_archived = 0 THEN f.size_bytes ELSE 0 END), 0) AS totalBytes,
       SUM(f.deleted_at IS NULL AND f.is_archived = 0 AND f.mime_type LIKE '%pdf%') AS pdfs,
       SUM(f.deleted_at IS NULL AND f.is_archived = 0 AND f.mime_type LIKE 'image/%') AS images,
       SUM(f.deleted_at IS NULL AND f.is_archived = 0 AND f.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)) AS addedLast30,
       SUM(f.deleted_at IS NULL AND f.is_archived = 0 AND f.expires_at IS NOT NULL
           AND f.expires_at <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)) AS expiringSoon,
       COUNT(*) AS allDocuments,
       (SELECT COUNT(*) FROM file_versions v) AS versions
     FROM files f
     WHERE f.parent_file_id IS NULL`
  );
  return {
    total: Number(row?.total ?? 0),
    active: Number(row?.total ?? 0),
    allDocuments: Number(row?.allDocuments ?? 0),
    archived: Number(row?.archived ?? 0),
    totalBytes: Number(row?.totalBytes ?? 0),
    pdfs: Number(row?.pdfs ?? 0),
    images: Number(row?.images ?? 0),
    addedLast30: Number(row?.addedLast30 ?? 0),
    expiringSoon: Number(row?.expiringSoon ?? 0),
    versions: Number(row?.versions ?? 0),
  };
}

export function fileExtensionBreakdown() {
  return query<RowDataPacket>(
    `SELECT COALESCE(NULLIF(LOWER(f.extension), ''), 'other') AS extension,
            COUNT(*) AS total,
            COALESCE(SUM(f.size_bytes), 0) AS bytes
       FROM files f
      WHERE f.deleted_at IS NULL AND f.is_archived = 0 AND f.parent_file_id IS NULL
      GROUP BY COALESCE(NULLIF(LOWER(f.extension), ''), 'other')
      ORDER BY total DESC, extension ASC
      LIMIT 12`
  );
}

export function fileEntityBreakdown() {
  return query<RowDataPacket>(
    `SELECT f.entity_type, COUNT(*) AS total, COALESCE(SUM(f.size_bytes), 0) AS bytes
       FROM files f
      WHERE f.deleted_at IS NULL AND f.is_archived = 0 AND f.parent_file_id IS NULL
      GROUP BY f.entity_type
      ORDER BY total DESC`
  );
}

export function fileCategoryOptions() {
  return query<RowDataPacket>(
    `SELECT DISTINCT f.category FROM files f
      WHERE f.deleted_at IS NULL AND f.is_archived = 0 AND f.category IS NOT NULL AND f.category <> ''
      ORDER BY f.category ASC
      LIMIT 60`
  );
}

export function fileUploaderOptions() {
  return query<RowDataPacket>(
    `SELECT u.id, CONCAT(u.first_name, ' ', COALESCE(u.last_name, '')) AS name, COUNT(*) AS total
       FROM files f
       JOIN users u ON u.id = f.uploaded_by
      WHERE f.deleted_at IS NULL AND f.is_archived = 0 AND f.parent_file_id IS NULL
      GROUP BY u.id, name
      ORDER BY total DESC, name ASC
      LIMIT 50`
  );
}

/** Detail row with the resolved current revision, label and uploader. */
export async function findFileDocument(rootId: number) {
  return queryOne<RowDataPacket>(
    `SELECT ${FILE_COLUMNS},
        ${CURRENT_ID_SQL} AS current_file_id,
        (SELECT c.version FROM files c WHERE c.id = ${CURRENT_ID_SQL}) AS current_version,
        ${CURRENT_SIZE_SQL} AS current_size_bytes,
        (SELECT c.mime_type FROM files c WHERE c.id = ${CURRENT_ID_SQL}) AS current_mime_type,
        (SELECT c.original_name FROM files c WHERE c.id = ${CURRENT_ID_SQL}) AS current_file_name,
        (SELECT c.checksum_sha256 FROM files c WHERE c.id = ${CURRENT_ID_SQL}) AS current_checksum,
        (SELECT c.created_at FROM files c WHERE c.id = ${CURRENT_ID_SQL}) AS current_uploaded_at,
        ${LATEST_VERSION_SQL} AS latest_version,
        ${VERSION_COUNT_SQL} AS version_count,
        ${DOWNLOAD_COUNT_SQL} AS download_count,
        (${ENTITY_LABEL_SQL}) AS entity_label,
        CONCAT(COALESCE(u.first_name, 'System'), ' ', COALESCE(u.last_name, '')) AS uploaded_by_name,
        COALESCE(u.email, '') AS uploaded_by_email
      FROM files f
      LEFT JOIN users u ON u.id = f.uploaded_by
     WHERE f.id = ?
     LIMIT 1`,
    [rootId]
  );
}

/** Walks a revision back to the document it belongs to. */
export async function resolveRootId(fileId: number, includeArchived = false) {
  const row = await queryOne<RowDataPacket>(
    `SELECT id, parent_file_id FROM files WHERE id = ?${includeArchived ? '' : ' AND deleted_at IS NULL'} LIMIT 1`,
    [fileId]
  );
  if (!row) return null;
  const parentId = row.parent_file_id === null || row.parent_file_id === undefined ? null : Number(row.parent_file_id);
  return parentId ?? Number(row.id);
}

/**
 * Metadata lives on the document, not on a single revision, so an edit writes
 * every row in the chain and a rename keeps the whole history consistent.
 */
export async function updateFileMetadata(rootId: number, changes: Record<string, SqlValue>) {
  const columns = Object.keys(changes);
  if (!columns.length) return 0;
  const assignments = columns.map((column) => `${column} = ?`).join(', ');
  const result = await execute(
    `UPDATE files SET ${assignments} WHERE id = ? OR parent_file_id = ?`,
    [...columns.map((column) => changes[column]), rootId, rootId]
  );
  return Number(result.affectedRows ?? 0);
}
