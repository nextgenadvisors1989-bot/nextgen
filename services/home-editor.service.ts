/**
 * The Home page editor: what the client's staff change on the public home page without a developer.
 *
 * Every block of the home page is one row of `cms_page_sections` on the page flagged "homepage", matched by its
 * `section_key` (the catalogue is lib/public/home-blocks.ts). A block that was never saved shows the bundled default
 * (lib/public/home-defaults.json); saving writes the row; "Back to the standard text" deletes the row again.
 * Everything that comes in is checked here, because it ends up in links and images on a public page:
 *   • links may only be pages of this site, web addresses, mailto: and tel: (never javascript:);
 *   • the photo must be an image already stored by this platform (a /… path) or an https address;
 *   • text is stored as plain text and shown escaped, so a pasted <script> is just words.
 */
import { randomUUID } from 'node:crypto';
import { execute, insert, query, queryOne, type RowDataPacket } from '@/lib/db/mysql';
import { writeActivityLog } from '@/lib/logger/activity-log';
import { saveUploads } from '@/lib/files/file-service';
import { HOME_BLOCKS, HOME_BLOCK_BY_KEY, ICON_NAMES, isSafeLink, type ItemField } from '@/lib/public/home-blocks';
import { getHomeBlocks, type SiteBlock, type SiteItem } from '@/services/site.service';
import defaults from '@/lib/public/home-defaults.json';
import type { ActorContext } from '@/services/cms.service';

type ServiceError = Error & { code: string; issues?: { field: string; message: string }[] };
const fail = (code: string, message: string, issues?: { field: string; message: string }[]): ServiceError =>
  Object.assign(new Error(message), { code, issues });

const actorFields = (actor: ActorContext) => ({
  userId: actor.user.id,
  userName: actor.user.fullName,
  userRole: actor.user.primaryRole,
  ipAddress: actor.ip ?? undefined,
  userAgent: actor.userAgent ?? undefined,
});

const SECTION_TYPE: Record<string, string> = Object.fromEntries(
  (defaults.sections as { key: string; type: string }[]).map((section) => [section.key, section.type])
);

/** The Home page row of the CMS, created when a fresh database has none yet. */
export async function ensureHomePage(): Promise<number> {
  const found = await queryOne<RowDataPacket>('SELECT id FROM cms_pages WHERE is_homepage = 1 AND deleted_at IS NULL LIMIT 1');
  if (found) return Number(found.id);
  const bySlug = await queryOne<RowDataPacket>("SELECT id FROM cms_pages WHERE slug = 'home' LIMIT 1");
  if (bySlug) {
    await execute("UPDATE cms_pages SET is_homepage = 1, status = 'published', deleted_at = NULL, page_type = 'landing' WHERE id = ?", [bySlug.id]);
    return Number(bySlug.id);
  }
  return insert(
    `INSERT INTO cms_pages (uuid, slug, title, subtitle, meta_title, page_type, template, status, is_homepage, published_at, show_in_menu, menu_label, sort_order)
     VALUES (?, 'home', 'Home', 'The public home page', 'One Legal Culture - Compliance | Safety | Sustainability', 'landing', 'default', 'published', 1, NOW(), 0, 'Home', 0)`,
    [randomUUID()]
  );
}

export interface HomeEditorBlock extends SiteBlock {
  /** The standard text, for "see what it was". */
  standard: { heading: string; subheading: string; html: string; items: SiteItem[] };
}

export async function getHomeEditorState() {
  const [pageId, blocks] = await Promise.all([ensureHomePage(), getHomeBlocks()]);
  const standard = Object.fromEntries(
    (defaults.sections as unknown as { key: string; heading?: string; subheading?: string; content_html?: string; items?: SiteItem[] }[]).map((section) => [
      section.key,
      { heading: section.heading ?? '', subheading: section.subheading ?? '', html: section.content_html ?? '', items: section.items ?? [] },
    ])
  );
  const list: HomeEditorBlock[] = HOME_BLOCKS.map((meta) => ({ ...blocks[meta.key], standard: standard[meta.key] }));
  return { pageId, blocks: list };
}

const clean = (value: unknown, max: number) => (typeof value === 'string' ? value.replace(/\s+\n/g, '\n').trim().slice(0, max) : '');

function cleanItems(key: string, raw: unknown): SiteItem[] {
  const meta = HOME_BLOCK_BY_KEY[key];
  if (!meta.itemFields) return [];
  if (!Array.isArray(raw)) return [];
  if (raw.length > (meta.maxItems ?? 20)) {
    throw fail('VALIDATION_FAILED', `At most ${meta.maxItems ?? 20} ${meta.itemName ?? 'row'}s fit here`, [
      { field: 'items', message: `At most ${meta.maxItems ?? 20} rows` },
    ]);
  }
  const issues: { field: string; message: string }[] = [];
  const items: SiteItem[] = [];
  raw.forEach((entry, index) => {
    const source = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>;
    const item: Record<string, string> = {};
    for (const field of meta.itemFields as ItemField[]) {
      let value = clean(source[field.key], field.kind === 'textarea' ? 600 : 300);
      if (field.kind === 'link' && !isSafeLink(value)) {
        issues.push({ field: `items.${index}.${field.key}`, message: `Row ${index + 1}: “${value.slice(0, 40)}” is not a page of this site or a web address` });
        value = '';
      }
      if (field.kind === 'icon' && value && !(ICON_NAMES as readonly string[]).includes(value)) value = '';
      if (value) item[field.key] = value;
    }
    // Carry the icon of a row that has no icon field in the editor, so a re-save does not lose it.
    if (!meta.itemFields!.some((field) => field.key === 'icon') && typeof source.icon === 'string' && (ICON_NAMES as readonly string[]).includes(source.icon)) item.icon = source.icon;
    if (Object.keys(item).some((k) => k !== 'icon')) items.push(item as SiteItem);
  });
  if (issues.length) throw fail('VALIDATION_FAILED', 'Please correct the highlighted links', issues);
  return items;
}

export interface HomeBlockInput {
  heading?: unknown;
  subheading?: unknown;
  html?: unknown;
  imageUrl?: unknown;
  items?: unknown;
  hidden?: unknown;
}

export async function saveHomeBlock(key: string, input: HomeBlockInput, actor: ActorContext) {
  const meta = HOME_BLOCK_BY_KEY[key];
  if (!meta) throw fail('NOT_FOUND', 'That block does not exist');
  const pageId = await ensureHomePage();

  const heading = meta.headingLabel ? clean(input.heading, 255) : '';
  const subheading = meta.subheadingLabel ? clean(input.subheading, 500) : '';
  const html = meta.textLabel ? clean(input.html, 2000) : '';
  const imageUrl = meta.photo ? clean(input.imageUrl, 500) : '';
  if (imageUrl && !/^(\/(?!\/)[^\s]+|https:\/\/[^\s]+)$/i.test(imageUrl)) {
    throw fail('VALIDATION_FAILED', 'That photo address is not allowed', [{ field: 'imageUrl', message: 'Use the Upload photo button' }]);
  }
  const items = cleanItems(key, input.items);
  const hidden = meta.alwaysVisible ? false : input.hidden === true || input.hidden === 'true';
  if (key === 'spotlight' && !heading) {
    throw fail('VALIDATION_FAILED', 'Write the name that goes under the photo', [{ field: 'heading', message: 'The name is needed' }]);
  }
  if (meta.headingLabel && key !== 'spotlight' && !heading && !meta.subheadingLabel) {
    throw fail('VALIDATION_FAILED', 'Write the section title', [{ field: 'heading', message: 'The title is needed' }]);
  }

  const existing = await queryOne<RowDataPacket>(
    'SELECT id, heading, status FROM cms_page_sections WHERE page_id = ? AND section_key = ? AND deleted_at IS NULL ORDER BY id LIMIT 1',
    [pageId, key]
  );
  const json = meta.itemFields ? JSON.stringify({ items }) : null;
  const status = hidden ? 'inactive' : 'active';
  if (existing) {
    await execute(
      `UPDATE cms_page_sections SET heading = ?, subheading = ?, content_html = ?, content_json = ?, image_url = ?, status = ? WHERE id = ?`,
      [heading || null, subheading || null, html || null, json, imageUrl || null, status, existing.id]
    );
  } else {
    const order = HOME_BLOCKS.findIndex((block) => block.key === key) * 10 + 10;
    await insert(
      `INSERT INTO cms_page_sections (page_id, section_key, section_type, heading, subheading, content_html, content_json, image_url, sort_order, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [pageId, key, SECTION_TYPE[key] ?? 'features', heading || null, subheading || null, html || null, json, imageUrl || null, order, status, actor.user.id]
    );
  }

  await writeActivityLog({
    ...actorFields(actor),
    action: 'updated',
    module: 'cms_page',
    entityType: 'cms_page',
    entityId: pageId,
    entityLabel: 'Home page',
    description: `Home page block “${meta.name}” ${hidden ? 'hidden' : 'saved'}`,
    newValues: { block: key, hidden, items: items.length },
  });
  return { key, hidden, items: items.length };
}

/** Put a block back to the standard text: the saved row is removed, the bundled default shows again. */
export async function resetHomeBlock(key: string, actor: ActorContext) {
  const meta = HOME_BLOCK_BY_KEY[key];
  if (!meta) throw fail('NOT_FOUND', 'That block does not exist');
  const pageId = await ensureHomePage();
  await execute('DELETE FROM cms_page_sections WHERE page_id = ? AND section_key = ?', [pageId, key]);
  await writeActivityLog({
    ...actorFields(actor),
    action: 'updated',
    module: 'cms_page',
    entityType: 'cms_page',
    entityId: pageId,
    entityLabel: 'Home page',
    description: `Home page block “${meta.name}” put back to the standard text`,
    newValues: { block: key, reset: true },
  });
  return { key };
}

const PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** The portrait: stored through the document vault like every other CMS media file, listed in the media library. */
export async function uploadHomePhoto(file: { originalName: string; mimeType: string | null; data: Buffer }, actor: ActorContext) {
  if (!file.mimeType || !PHOTO_TYPES.has(file.mimeType)) {
    throw fail('VALIDATION_FAILED', 'Choose a JPG, PNG or WebP photo', [{ field: 'file', message: 'Only JPG, PNG or WebP' }]);
  }
  if (file.data.length > 5 * 1024 * 1024) {
    throw fail('VALIDATION_FAILED', 'The photo is larger than 5 MB — please use a smaller one', [{ field: 'file', message: 'Up to 5 MB' }]);
  }
  const [stored] = await saveUploads(
    [{ originalName: file.originalName, mimeType: file.mimeType, data: file.data }],
    { entityType: 'CMS_MEDIA', entityId: null, category: 'Team', accessLevel: 'public', description: 'Home page photo', tags: 'home,principal' },
    { user: actor.user, ip: actor.ip ?? undefined }
  );
  // The vault's own download address needs a sign-in; visitors get the image from the public media route.
  const publicUrl = `/api/public/media/${stored.id}`;
  const mediaId = await insert(
    `INSERT INTO cms_media (uuid, title, file_name, file_path, mime_type, media_type, size_bytes, folder, tags, uploaded_by)
     VALUES (?, ?, ?, ?, ?, 'image', ?, 'Team', 'home,principal', ?)`,
    [randomUUID(), 'Home page photo', file.originalName.slice(0, 255), publicUrl, stored.mime_type, stored.size_bytes, actor.user.id]
  );
  await execute('UPDATE cms_media SET file_id = ?, public_url = ?, file_path = ? WHERE id = ?', [stored.id, publicUrl, publicUrl, mediaId]);
  await writeActivityLog({
    ...actorFields(actor),
    action: 'created',
    module: 'cms_media',
    entityType: 'cms_media',
    entityId: mediaId,
    entityLabel: 'Home page photo',
    description: 'Photo uploaded for the home page',
  });
  return { url: publicUrl, mediaId };
}

export async function homeBlockSummary() {
  const rows = await query<RowDataPacket>(
    `SELECT s.section_key, s.status FROM cms_page_sections s JOIN cms_pages p ON p.id = s.page_id
      WHERE p.is_homepage = 1 AND s.deleted_at IS NULL AND s.section_key IS NOT NULL`
  ).catch(() => [] as RowDataPacket[]);
  return { saved: rows.length, hidden: rows.filter((row) => String(row.status) !== 'active').length };
}
