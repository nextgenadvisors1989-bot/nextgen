/**
 * CMS data access — parameterised SQL only.
 *
 * Four registers: pages, their sections, the media library and the downloadable
 * resources. Publishing state lives on the page row (`status`, `published_at`,
 * `scheduled_at`), so the public read path is a single indexed query and the
 * authoring screens never have to reconcile a second table.
 */
import { execute, query, queryOne, queryScalar, type RowDataPacket } from '@/lib/db/mysql';
import { eqFilter, paginatedQuery, type ListQuery, type SqlValue } from '@/lib/db/query-helpers';

/** `eqFilter` returns a fragment that starts with ` AND `; in a WHERE array that
 *  prefix would double up, so it is trimmed here. */
/** Field maps are typed `unknown`; this narrows them to what the driver accepts. */
function asSqlValue(value: unknown): SqlValue {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number' || typeof value === 'string') return value;
  if (value instanceof Date) return value;
  if (Buffer.isBuffer(value)) return value.toString('base64');
  return String(value);
}

function eq(column: string, value: unknown, params: SqlValue[]): string {
  return eqFilter(column, value as SqlValue, params).replace(/^ AND /, '');
}

/* ──────────────────────────────── pages ───────────────────────────────── */

const PAGE_COLUMNS = `p.id, p.uuid, p.slug, p.title, p.subtitle, p.meta_title, p.meta_description, p.meta_keywords,
  p.hero_image, p.content_html, p.page_type, p.template, p.parent_page_id, p.sort_order, p.show_in_menu,
  p.menu_label, p.status, p.is_homepage, p.published_at, p.scheduled_at, p.view_count, p.created_at, p.updated_at,
  p.created_by, p.updated_by`;

export interface CmsPageFilters extends ListQuery {
  status?: string | null;
  pageType?: string | null;
  template?: string | null;
  menu?: string | null;
  fromDate?: string | null;
  toDate?: string | null;
}

export function cmsPageList(filters: CmsPageFilters) {
  const where = ['p.deleted_at IS NULL'];
  const params: SqlValue[] = [];

  const status = eq('p.status', filters.status === 'all' ? '' : filters.status, params);
  if (status) where.push(status);
  const type = eq('p.page_type', filters.pageType === 'all' ? '' : filters.pageType, params);
  if (type) where.push(type);
  const template = eq('p.template', filters.template === 'all' ? '' : filters.template, params);
  if (template) where.push(template);
  if (filters.menu === 'shown') where.push('p.show_in_menu = 1');
  if (filters.menu === 'hidden') where.push('p.show_in_menu = 0');
  if (filters.fromDate) {
    where.push('DATE(p.created_at) >= ?');
    params.push(filters.fromDate);
  }
  if (filters.toDate) {
    where.push('DATE(p.created_at) <= ?');
    params.push(filters.toDate);
  }
  if (filters.search) {
    where.push('(p.title LIKE ? OR p.slug LIKE ? OR p.subtitle LIKE ? OR p.menu_label LIKE ?)');
    const term = `%${filters.search}%`;
    params.push(term, term, term, term);
  }

  const whereSql = where.join(' AND ');
  const base = `SELECT ${PAGE_COLUMNS},
      (SELECT COUNT(*) FROM cms_page_sections s WHERE s.page_id = p.id AND s.deleted_at IS NULL) AS section_count,
      (SELECT setting_value FROM settings WHERE setting_group = 'company' AND setting_key = 'company_name' LIMIT 1) AS company_name,
      u.first_name AS updated_by_first, u.last_name AS updated_by_last
    FROM cms_pages p
    LEFT JOIN users u ON u.id = p.updated_by
   WHERE ${whereSql}`;
  const count = `SELECT COUNT(*) FROM cms_pages p WHERE ${whereSql}`;

  return paginatedQuery<RowDataPacket>(base, count, params, {
    ...filters,
    searchColumns: ['title', 'slug', 'subtitle', 'menu_label'],
    allowedSortColumns: ['id', 'title', 'slug', 'status', 'page_type', 'sort_order', 'published_at', 'updated_at', 'view_count'],
    defaultSort: 'updated_at',
  });
}

export function cmsPageById(id: number) {
  return queryOne<RowDataPacket>(
    `SELECT p.*, u.first_name AS updated_by_first, u.last_name AS updated_by_last
       FROM cms_pages p
       LEFT JOIN users u ON u.id = p.updated_by
      WHERE p.id = ? AND p.deleted_at IS NULL
      LIMIT 1`,
    [id]
  );
}

export function cmsPageBySlug(slug: string) {
  return queryOne<RowDataPacket>(
    `SELECT * FROM cms_pages WHERE slug = ? AND deleted_at IS NULL LIMIT 1`,
    [slug]
  );
}

/** Every live slug — used to keep slugs unique while an editor types one. */
export function cmsPageSlugs(excludeId?: number | null) {
  return query<RowDataPacket>(
    `SELECT id, slug FROM cms_pages WHERE deleted_at IS NULL${excludeId ? ' AND id <> ?' : ''}`,
    excludeId ? [excludeId] : []
  );
}

export async function cmsPageStats() {
  const [counts] = await query<RowDataPacket>(
    `SELECT
       COUNT(*) AS total,
       SUM(status = 'published') AS published,
       SUM(status = 'draft') AS draft,
       SUM(status = 'scheduled') AS scheduled,
       SUM(status = 'archived') AS archived,
       SUM(show_in_menu = 1) AS in_menu,
       SUM(status = 'scheduled' AND scheduled_at IS NOT NULL AND scheduled_at <= NOW()) AS scheduled_due,
       SUM(is_homepage = 1) AS homepage,
       COALESCE(SUM(view_count), 0) AS views,
       MAX(published_at) AS last_published
     FROM cms_pages WHERE deleted_at IS NULL`
  );

  const byType = await query<RowDataPacket>(
    `SELECT page_type, COUNT(*) AS total FROM cms_pages WHERE deleted_at IS NULL GROUP BY page_type ORDER BY total DESC`
  );

  const sections = await queryScalar<number>(
    `SELECT COUNT(*) FROM cms_page_sections WHERE deleted_at IS NULL`
  );

  return {
    total: Number(counts?.total ?? 0),
    published: Number(counts?.published ?? 0),
    draft: Number(counts?.draft ?? 0),
    scheduled: Number(counts?.scheduled ?? 0),
    archived: Number(counts?.archived ?? 0),
    inMenu: Number(counts?.in_menu ?? 0),
    scheduledDue: Number(counts?.scheduled_due ?? 0),
    homepage: Number(counts?.homepage ?? 0),
    views: Number(counts?.views ?? 0),
    lastPublished: (counts?.last_published as string | null) ?? null,
    sections: Number(sections ?? 0),
    byType: byType.map((row) => ({ page_type: String(row.page_type), total: Number(row.total) })),
  };
}

export function menuPages() {
  return query<RowDataPacket>(
    `SELECT id, slug, title, menu_label, page_type, sort_order, parent_page_id
       FROM cms_pages
      WHERE deleted_at IS NULL AND status = 'published' AND show_in_menu = 1
      ORDER BY sort_order ASC, title ASC`
  );
}

/** Every page as a selectable option, used by the parent picker on the editor. */
export function cmsPageOptions() {
  return query<RowDataPacket>(
    `SELECT id, title, slug, page_type, status, parent_page_id
       FROM cms_pages WHERE deleted_at IS NULL
      ORDER BY COALESCE(parent_page_id, 0) ASC, sort_order ASC, title ASC`
  );
}

export function childPages(parentId: number) {
  return query<RowDataPacket>(
    `SELECT id, slug, title, status, sort_order FROM cms_pages
      WHERE parent_page_id = ? AND deleted_at IS NULL ORDER BY sort_order ASC, title ASC`,
    [parentId]
  );
}

export async function insertCmsPage(input: {
  uuid: string;
  slug: string;
  title: string;
  subtitle: string | null;
  pageType: string;
  template: string;
  metaTitle: string | null;
  metaDescription: string | null;
  metaKeywords: string | null;
  heroImage: string | null;
  contentHtml: string | null;
  parentPageId: number | null;
  sortOrder: number;
  showInMenu: boolean;
  menuLabel: string | null;
  isHomepage: boolean;
  status: string;
  scheduledAt: string | null;
  userId: number;
}) {
  const result = await execute(
    `INSERT INTO cms_pages (uuid, slug, title, subtitle, page_type, template, meta_title, meta_description,
                            meta_keywords, hero_image, content_html, parent_page_id, sort_order, show_in_menu,
                            menu_label, is_homepage, status, scheduled_at, published_at, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.uuid, input.slug, input.title, input.subtitle, input.pageType, input.template, input.metaTitle,
      input.metaDescription, input.metaKeywords, input.heroImage, input.contentHtml, input.parentPageId,
      input.sortOrder, input.showInMenu ? 1 : 0, input.menuLabel, input.isHomepage ? 1 : 0, input.status,
      input.scheduledAt,
      input.status === 'published' ? new Date() : null,
      input.userId, input.userId,
    ]
  );
  return Number(result.insertId);
}

/** Column map so an update can never be tricked into writing another column. */
const PAGE_UPDATE_COLUMNS: Record<string, string> = {
  slug: 'slug',
  title: 'title',
  subtitle: 'subtitle',
  page_type: 'page_type',
  template: 'template',
  meta_title: 'meta_title',
  meta_description: 'meta_description',
  meta_keywords: 'meta_keywords',
  hero_image: 'hero_image',
  content_html: 'content_html',
  parent_page_id: 'parent_page_id',
  sort_order: 'sort_order',
  show_in_menu: 'show_in_menu',
  menu_label: 'menu_label',
  is_homepage: 'is_homepage',
  status: 'status',
  scheduled_at: 'scheduled_at',
};

export async function updateCmsPage(
  id: number,
  fields: Record<string, unknown>,
  userId: number,
  extra: { publishedAt?: string | Date | null | undefined } = {}
) {
  const sets: string[] = [];
  const params: SqlValue[] = [];

  for (const [key, value] of Object.entries(fields)) {
    const column = PAGE_UPDATE_COLUMNS[key];
    if (!column) continue;
    sets.push(`${column} = ?`);
    params.push(asSqlValue(value));
  }

  if (extra.publishedAt !== undefined) {
    sets.push('published_at = ?');
    params.push(extra.publishedAt);
  }

  if (!sets.length) return 0;
  sets.push('updated_by = ?');
  params.push(userId, id);

  const result = await execute(`UPDATE cms_pages SET ${sets.join(', ')} WHERE id = ? AND deleted_at IS NULL`, params);
  return Number(result.affectedRows ?? 0);
}

export async function setCmsPageStatus(
  id: number,
  input: { status: string; scheduledAt?: string | null; publishedAt?: string | Date | null },
  userId: number
) {
  const sets = ['status = ?', 'updated_by = ?'];
  const params: unknown[] = [input.status, userId];
  if (input.scheduledAt !== undefined) {
    sets.push('scheduled_at = ?');
    params.push(input.scheduledAt);
  }
  if (input.publishedAt !== undefined) {
    sets.push('published_at = ?');
    params.push(input.publishedAt);
  }
  params.push(id);
  const result = await execute(`UPDATE cms_pages SET ${sets.join(', ')} WHERE id = ? AND deleted_at IS NULL`, params);
  return Number(result.affectedRows ?? 0);
}

/** A slug lives on one page at a time while a page is live. */
export async function countPagesAtSlug(slug: string, excludeId?: number | null) {
  return Number(
    (await queryScalar<number>(
      `SELECT COUNT(*) FROM cms_pages WHERE slug = ? AND deleted_at IS NULL${excludeId ? ' AND id <> ?' : ''}`,
      excludeId ? [slug, excludeId] : [slug]
    )) ?? 0
  );
}

export async function softDeleteCmsPage(id: number, userId: number) {
  const result = await execute(
    `UPDATE cms_pages SET deleted_at = NOW(), status = 'archived', updated_by = ? WHERE id = ? AND deleted_at IS NULL`,
    [userId, id]
  );
  return Number(result.affectedRows ?? 0);
}

export async function restoreCmsPage(id: number, userId: number) {
  const result = await execute(
    `UPDATE cms_pages SET deleted_at = NULL, status = 'draft', updated_by = ? WHERE id = ? AND deleted_at IS NOT NULL`,
    [userId, id]
  );
  return Number(result.affectedRows ?? 0);
}

/**
 * Promotes every page whose scheduled moment has passed. Called by the
 * scheduled-publishing job and, harmlessly, before the public site lists pages —
 * so a page never sits `scheduled` after its time has come.
 */
export async function promoteDueScheduledPages() {
  const result = await execute(
    `UPDATE cms_pages
        SET status = 'published',
            published_at = COALESCE(scheduled_at, NOW()),
            updated_at = NOW()
      WHERE deleted_at IS NULL AND status = 'scheduled' AND scheduled_at IS NOT NULL AND scheduled_at <= NOW()`
  );
  return Number(result.affectedRows ?? 0);
}

export function incrementCmsPageViews(id: number) {
  return execute('UPDATE cms_pages SET view_count = view_count + 1 WHERE id = ?', [id]);
}

/* ─────────────────────────────── sections ─────────────────────────────── */

export function sectionsForPage(pageId: number) {
  return query<RowDataPacket>(
    `SELECT s.*, u.first_name AS created_by_first, u.last_name AS created_by_last
       FROM cms_page_sections s
       LEFT JOIN users u ON u.id = s.created_by
      WHERE s.page_id = ? AND s.deleted_at IS NULL
      ORDER BY s.sort_order ASC, s.id ASC`,
    [pageId]
  );
}

export function cmsSectionById(id: number) {
  return queryOne<RowDataPacket>(
    `SELECT * FROM cms_page_sections WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
    [id]
  );
}

export async function maxSectionOrder(pageId: number) {
  return Number(
    (await queryScalar<number>(
      `SELECT COALESCE(MAX(sort_order), -1) FROM cms_page_sections WHERE page_id = ? AND deleted_at IS NULL`,
      [pageId]
    )) ?? -1
  );
}

export async function insertCmsSection(input: {
  pageId: number;
  sectionKey: string | null;
  sectionType: string;
  heading: string | null;
  subheading: string | null;
  contentHtml: string | null;
  contentJson: string | null;
  imageUrl: string | null;
  backgroundColor: string | null;
  sortOrder: number;
  status: string;
  userId: number;
}) {
  const result = await execute(
    `INSERT INTO cms_page_sections (page_id, section_key, section_type, heading, subheading, content_html,
                                    content_json, image_url, background_color, sort_order, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.pageId, input.sectionKey, input.sectionType, input.heading, input.subheading, input.contentHtml,
      input.contentJson, input.imageUrl, input.backgroundColor, input.sortOrder, input.status, input.userId,
    ]
  );
  return Number(result.insertId);
}

const SECTION_UPDATE_COLUMNS: Record<string, string> = {
  section_key: 'section_key',
  section_type: 'section_type',
  heading: 'heading',
  subheading: 'subheading',
  content_html: 'content_html',
  content_json: 'content_json',
  image_url: 'image_url',
  background_color: 'background_color',
  sort_order: 'sort_order',
  status: 'status',
};

export async function updateCmsSection(id: number, fields: Record<string, unknown>) {
  const sets: string[] = [];
  const params: SqlValue[] = [];
  for (const [key, value] of Object.entries(fields)) {
    const column = SECTION_UPDATE_COLUMNS[key];
    if (!column) continue;
    sets.push(`${column} = ?`);
    params.push(asSqlValue(value));
  }
  if (!sets.length) return 0;
  params.push(id);
  const result = await execute(`UPDATE cms_page_sections SET ${sets.join(', ')} WHERE id = ? AND deleted_at IS NULL`, params);
  return Number(result.affectedRows ?? 0);
}

export async function deleteCmsSection(id: number) {
  const result = await execute('UPDATE cms_page_sections SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL', [id]);
  return Number(result.affectedRows ?? 0);
}

/** Rewrites `sort_order` for a whole page in one statement per section. */
export async function reorderCmsSections(pageId: number, orderedIds: number[]) {
  let updated = 0;
  for (const [index, sectionId] of orderedIds.entries()) {
    const result = await execute(
      'UPDATE cms_page_sections SET sort_order = ? WHERE id = ? AND page_id = ? AND deleted_at IS NULL',
      [index, sectionId, pageId]
    );
    updated += Number(result.affectedRows ?? 0);
  }
  return updated;
}

/* ──────────────────────────────── media ───────────────────────────────── */

export interface CmsMediaFilters extends ListQuery {
  mediaType?: string | null;
  folder?: string | null;
  fromDate?: string | null;
  toDate?: string | null;
}

export function cmsMediaList(filters: CmsMediaFilters) {
  const where = ['m.deleted_at IS NULL'];
  const params: SqlValue[] = [];

  const type = eq('m.media_type', filters.mediaType === 'all' ? '' : filters.mediaType, params);
  if (type) where.push(type);
  const folder = eq('m.folder', filters.folder === 'all' ? '' : filters.folder, params);
  if (folder) where.push(folder);
  if (filters.fromDate) {
    where.push('DATE(m.created_at) >= ?');
    params.push(filters.fromDate);
  }
  if (filters.toDate) {
    where.push('DATE(m.created_at) <= ?');
    params.push(filters.toDate);
  }
  if (filters.search) {
    where.push('(m.title LIKE ? OR m.file_name LIKE ? OR m.alt_text LIKE ? OR m.caption LIKE ? OR m.tags LIKE ?)');
    const term = `%${filters.search}%`;
    params.push(term, term, term, term, term);
  }

  const whereSql = where.join(' AND ');
  const base = `SELECT m.*, u.first_name AS uploaded_by_first, u.last_name AS uploaded_by_last
    FROM cms_media m
    LEFT JOIN users u ON u.id = m.uploaded_by
   WHERE ${whereSql}`;
  const count = `SELECT COUNT(*) FROM cms_media m WHERE ${whereSql}`;

  return paginatedQuery<RowDataPacket>(base, count, params, {
    ...filters,
    searchColumns: ['title', 'file_name', 'folder'],
    allowedSortColumns: ['id', 'title', 'file_name', 'media_type', 'size_bytes', 'folder', 'created_at'],
    defaultSort: 'created_at',
  });
}

export function cmsMediaById(id: number) {
  return queryOne<RowDataPacket>(
    `SELECT * FROM cms_media WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
    [id]
  );
}

/** Every media row whose public URL appears anywhere in a page — "used by". */
export function cmsMediaUsage(publicUrl: string) {
  return query<RowDataPacket>(
    `SELECT p.id, p.title, p.slug, p.status
       FROM cms_pages p
      WHERE p.deleted_at IS NULL
        AND (p.hero_image = ? OR p.content_html LIKE ?)
      LIMIT 20`,
    [publicUrl, `%${publicUrl}%`]
  );
}

export async function cmsMediaStats() {
  const [counts] = await query<RowDataPacket>(
    `SELECT COUNT(*) AS total,
            SUM(media_type = 'image') AS images,
            COALESCE(SUM(size_bytes), 0) AS bytes,
            COUNT(DISTINCT folder) AS folders
       FROM cms_media WHERE deleted_at IS NULL`
  );
  const byType = await query<RowDataPacket>(
    `SELECT media_type, COUNT(*) AS total, COALESCE(SUM(size_bytes), 0) AS bytes
       FROM cms_media WHERE deleted_at IS NULL GROUP BY media_type ORDER BY total DESC`
  );
  const folders = await query<RowDataPacket>(
    `SELECT COALESCE(folder, 'Unfiled') AS folder, COUNT(*) AS total
       FROM cms_media WHERE deleted_at IS NULL GROUP BY COALESCE(folder, 'Unfiled') ORDER BY folder ASC`
  );
  return {
    total: Number(counts?.total ?? 0),
    images: Number(counts?.images ?? 0),
    bytes: Number(counts?.bytes ?? 0),
    folders: Number(counts?.folders ?? 0),
    byType: byType.map((row) => ({ media_type: String(row.media_type), total: Number(row.total), bytes: Number(row.bytes) })),
    folderList: folders.map((row) => ({ folder: String(row.folder), total: Number(row.total) })),
  };
}

export async function insertCmsMedia(input: {
  uuid: string;
  title: string | null;
  fileName: string;
  filePath: string;
  mimeType: string | null;
  mediaType: string;
  sizeBytes: number;
  folder: string | null;
  tags: string | null;
  userId: number;
}) {
  const result = await execute(
    `INSERT INTO cms_media (uuid, title, file_name, file_path, mime_type, media_type, size_bytes, folder, tags, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [input.uuid, input.title, input.fileName, input.filePath, input.mimeType, input.mediaType, input.sizeBytes,
     input.folder, input.tags, input.userId]
  );
  return Number(result.insertId);
}

/** Links the vault file to the media row once the upload has been stored. */
export async function linkCmsMediaFile(id: number, input: { fileId: number; publicUrl: string; filePath: string; mimeType: string | null; sizeBytes: number }) {
  const result = await execute(
    `UPDATE cms_media SET file_id = ?, public_url = ?, file_path = ?, mime_type = ?, size_bytes = ? WHERE id = ?`,
    [input.fileId, input.publicUrl, input.filePath, input.mimeType, input.sizeBytes, id]
  );
  return Number(result.affectedRows ?? 0);
}

export async function updateCmsMedia(id: number, fields: Record<string, unknown>) {
  const allowed: Record<string, string> = {
    title: 'title',
    alt_text: 'alt_text',
    caption: 'caption',
    folder: 'folder',
    tags: 'tags',
    media_type: 'media_type',
  };
  const sets: string[] = [];
  const params: SqlValue[] = [];
  for (const [key, value] of Object.entries(fields)) {
    const column = allowed[key];
    if (!column) continue;
    sets.push(`${column} = ?`);
    params.push(asSqlValue(value));
  }
  if (!sets.length) return 0;
  params.push(id);
  const result = await execute(`UPDATE cms_media SET ${sets.join(', ')} WHERE id = ? AND deleted_at IS NULL`, params);
  return Number(result.affectedRows ?? 0);
}

export async function deleteCmsMedia(id: number) {
  const result = await execute('UPDATE cms_media SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL', [id]);
  return Number(result.affectedRows ?? 0);
}

/* ────────────────────────────── resources ─────────────────────────────── */

export interface CmsResourceFilters extends ListQuery {
  status?: string | null;
  resourceType?: string | null;
  requiresLogin?: string | null;
}

export function cmsResourceList(filters: CmsResourceFilters) {
  const where = ['r.deleted_at IS NULL'];
  const params: SqlValue[] = [];

  const status = eq('r.status', filters.status === 'all' ? '' : filters.status, params);
  if (status) where.push(status);
  const type = eq('r.resource_type', filters.resourceType === 'all' ? '' : filters.resourceType, params);
  if (type) where.push(type);
  if (filters.requiresLogin === 'yes') where.push('r.requires_login = 1');
  if (filters.requiresLogin === 'no') where.push('r.requires_login = 0');
  if (filters.search) {
    where.push('(r.title LIKE ? OR r.slug LIKE ? OR r.description LIKE ? OR r.category LIKE ?)');
    const term = `%${filters.search}%`;
    params.push(term, term, term, term);
  }

  const whereSql = where.join(' AND ');
  const base = `SELECT r.*, a.act_name, f.original_name AS file_name, f.mime_type AS file_mime
    FROM cms_resources r
    LEFT JOIN compliance_acts a ON a.id = r.act_id
    LEFT JOIN files f ON f.id = r.file_id
   WHERE ${whereSql}`;
  const count = `SELECT COUNT(*) FROM cms_resources r WHERE ${whereSql}`;

  return paginatedQuery<RowDataPacket>(base, count, params, {
    ...filters,
    searchColumns: ['title', 'slug', 'category'],
    allowedSortColumns: ['id', 'title', 'slug', 'status', 'resource_type', 'download_count', 'sort_order', 'published_at', 'created_at'],
    defaultSort: 'created_at',
  });
}

export function cmsResourceById(id: number) {
  return queryOne<RowDataPacket>(
    `SELECT r.*, a.act_name, f.original_name AS file_name, f.mime_type AS file_mime, f.size_bytes AS file_size
       FROM cms_resources r
       LEFT JOIN compliance_acts a ON a.id = r.act_id
       LEFT JOIN files f ON f.id = r.file_id
      WHERE r.id = ? AND r.deleted_at IS NULL LIMIT 1`,
    [id]
  );
}

export function cmsResourceBySlug(slug: string) {
  return queryOne<RowDataPacket>(
    `SELECT r.*, a.act_name, f.original_name AS file_name, f.mime_type AS file_mime
       FROM cms_resources r
       LEFT JOIN compliance_acts a ON a.id = r.act_id
       LEFT JOIN files f ON f.id = r.file_id
      WHERE r.slug = ? AND r.deleted_at IS NULL LIMIT 1`,
    [slug]
  );
}

export function publishedCmsResources(limit = 60) {
  return query<RowDataPacket>(
    `SELECT r.id, r.uuid, r.title, r.slug, r.description, r.resource_type, r.category, r.external_url,
            r.thumbnail, r.requires_login, r.download_count, r.published_at, r.file_id,
            a.act_name, f.original_name AS file_name, f.mime_type AS file_mime
       FROM cms_resources r
       LEFT JOIN compliance_acts a ON a.id = r.act_id
       LEFT JOIN files f ON f.id = r.file_id
      WHERE r.status = 'published' AND r.deleted_at IS NULL
      ORDER BY r.sort_order ASC, r.published_at DESC
      LIMIT ${Math.min(limit, 200)}`
  );
}

export async function cmsResourceStats() {
  const [counts] = await query<RowDataPacket>(
    `SELECT COUNT(*) AS total,
            SUM(status = 'published') AS published,
            SUM(status = 'draft') AS draft,
            SUM(status = 'archived') AS archived,
            SUM(requires_login = 1) AS gated,
            SUM(external_url IS NOT NULL) AS external,
            SUM(file_id IS NOT NULL) AS uploaded,
            COALESCE(SUM(download_count), 0) AS downloads
       FROM cms_resources WHERE deleted_at IS NULL`
  );
  const byType = await query<RowDataPacket>(
    `SELECT resource_type, COUNT(*) AS total FROM cms_resources WHERE deleted_at IS NULL GROUP BY resource_type ORDER BY total DESC`
  );
  return {
    total: Number(counts?.total ?? 0),
    published: Number(counts?.published ?? 0),
    draft: Number(counts?.draft ?? 0),
    archived: Number(counts?.archived ?? 0),
    gated: Number(counts?.gated ?? 0),
    external: Number(counts?.external ?? 0),
    uploaded: Number(counts?.uploaded ?? 0),
    downloads: Number(counts?.downloads ?? 0),
    byType: byType.map((row) => ({ resource_type: String(row.resource_type), total: Number(row.total) })),
  };
}

export async function insertCmsResource(input: {
  uuid: string;
  title: string;
  slug: string;
  description: string | null;
  resourceType: string;
  category: string | null;
  actId: number | null;
  fileId: number | null;
  externalUrl: string | null;
  thumbnail: string | null;
  requiresLogin: boolean;
  sortOrder: number;
  status: string;
  userId: number;
}) {
  const result = await execute(
    `INSERT INTO cms_resources (uuid, title, slug, description, resource_type, category, act_id, file_id,
                                external_url, thumbnail, requires_login, sort_order, status, published_at,
                                created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.uuid, input.title, input.slug, input.description, input.resourceType, input.category, input.actId,
      input.fileId, input.externalUrl, input.thumbnail, input.requiresLogin ? 1 : 0, input.sortOrder,
      input.status, input.status === 'published' ? new Date() : null, input.userId, input.userId,
    ]
  );
  return Number(result.insertId);
}

const RESOURCE_UPDATE_COLUMNS: Record<string, string> = {
  title: 'title',
  slug: 'slug',
  description: 'description',
  resource_type: 'resource_type',
  category: 'category',
  act_id: 'act_id',
  file_id: 'file_id',
  external_url: 'external_url',
  thumbnail: 'thumbnail',
  requires_login: 'requires_login',
  sort_order: 'sort_order',
  status: 'status',
};

export async function updateCmsResource(
  id: number,
  fields: Record<string, unknown>,
  userId: number,
  extra: { publishedAt?: string | Date | null | undefined } = {}
) {
  const sets: string[] = [];
  const params: SqlValue[] = [];
  for (const [key, value] of Object.entries(fields)) {
    const column = RESOURCE_UPDATE_COLUMNS[key];
    if (!column) continue;
    sets.push(`${column} = ?`);
    params.push(asSqlValue(value));
  }
  if (extra.publishedAt !== undefined) {
    sets.push('published_at = ?');
    params.push(extra.publishedAt);
  }
  if (!sets.length) return 0;
  sets.push('updated_by = ?');
  params.push(userId, id);
  const result = await execute(`UPDATE cms_resources SET ${sets.join(', ')} WHERE id = ? AND deleted_at IS NULL`, params);
  return Number(result.affectedRows ?? 0);
}

export async function countResourcesAtSlug(slug: string, excludeId?: number | null) {
  return Number(
    (await queryScalar<number>(
      `SELECT COUNT(*) FROM cms_resources WHERE slug = ? AND deleted_at IS NULL${excludeId ? ' AND id <> ?' : ''}`,
      excludeId ? [slug, excludeId] : [slug]
    )) ?? 0
  );
}

export async function deleteCmsResource(id: number, userId: number) {
  const result = await execute(
    `UPDATE cms_resources SET deleted_at = NOW(), status = 'archived', updated_by = ? WHERE id = ? AND deleted_at IS NULL`,
    [userId, id]
  );
  return Number(result.affectedRows ?? 0);
}

export function incrementResourceDownloads(id: number) {
  return execute('UPDATE cms_resources SET download_count = download_count + 1 WHERE id = ?', [id]);
}

/* ─────────────────────────────── overview ─────────────────────────────── */

export function recentCmsPages(limit = 6) {
  return query<RowDataPacket>(
    `SELECT p.id, p.title, p.slug, p.status, p.page_type, p.updated_at, p.view_count,
            u.first_name, u.last_name
       FROM cms_pages p
       LEFT JOIN users u ON u.id = p.updated_by
      WHERE p.deleted_at IS NULL
      ORDER BY p.updated_at DESC
      LIMIT ${Math.min(limit, 20)}`
  );
}

export function dueScheduledPages(limit = 10) {
  return query<RowDataPacket>(
    `SELECT id, title, slug, scheduled_at FROM cms_pages
      WHERE deleted_at IS NULL AND status = 'scheduled' AND scheduled_at IS NOT NULL
      ORDER BY scheduled_at ASC
      LIMIT ${Math.min(limit, 50)}`
  );
}
