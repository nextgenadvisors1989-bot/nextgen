/**
 * CMS services.
 *
 * The content system's rules live here:
 *
 *   • **Slugs** are unique across pages and resources, never collide with a
 *     fixed public route (`/about`, `/login`, …), and are generated from the
 *     title when the editor does not supply one.
 *   • **Publishing** is a state machine. Draft → published stamps `published_at`
 *     once and keeps it; scheduled → published happens on time (the job, or the
 *     public read path if the cron has not run); unpublishing keeps the old
 *     publication date as history rather than erasing it.
 *   • **The homepage slot is singular** — marking a page as the homepage clears
 *     the flag on whichever page held it before.
 *   • **Deleting a page with children is refused**, naming the children, because
 *     a live menu tree is not something to delete by accident.
 *   • **Media** is uploaded through the document vault, so it is checksummed,
 *     versioned and access-controlled like every other byte the platform stores;
 *     the CMS row points at the vault file rather than duplicating it.
 */
import { randomUUID } from 'node:crypto';
import { queryOne, type RowDataPacket } from '@/lib/db/mysql';
import * as repo from '@/repositories/cms.repository';
import {
  cmsPageCreateSchema,
  cmsPageUpdateSchema,
  cmsSectionCreateSchema,
  cmsMediaUpdateSchema,
  cmsResourceSchema,
  slugify,
  uniqueSlug,
  RESERVED_SLUGS,
  LIST_SECTION_TYPES,
} from '@/lib/validations/cms.validation';
import { writeActivityLog } from '@/lib/logger/activity-log';
import { saveUploads, type UploadInput } from '@/lib/files/file-service';
import type { AuthUser } from '@/types/user';

export interface ActorContext {
  user: AuthUser;
  ip?: string | null;
  userAgent?: string | null;
}

type ServiceError = Error & { code: string; issues?: { field: string; message: string }[] };

const notFound = (resource: string): ServiceError =>
  Object.assign(new Error(`${resource} not found`), { code: 'NOT_FOUND' });
const conflict = (code: string, message: string, issues?: { field: string; message: string }[]): ServiceError =>
  Object.assign(new Error(message), { code, issues });
const validationFailed = (issues: { field: string; message: string }[]): ServiceError =>
  Object.assign(new Error('Please correct the highlighted fields'), { code: 'VALIDATION_FAILED', issues });

function actorFields(actor: ActorContext) {
  return {
    userId: actor.user.id,
    userName: actor.user.fullName,
    userRole: actor.user.primaryRole,
    ipAddress: actor.ip ?? undefined,
    userAgent: actor.userAgent ?? undefined,
  };
}

/* ══════════════════════════════════ pages ═════════════════════════════════ */

export async function listPages(filters: repo.CmsPageFilters) {
  const [result, stats] = await Promise.all([repo.cmsPageList(filters), repo.cmsPageStats()]);
  return { ...result, stats };
}

/** Slug catalogue used by the create form and the SEO warnings on the editor. */
export async function slugCatalog(excludeId?: number | null) {
  const [pages, resources] = await Promise.all([
    repo.cmsPageSlugs(excludeId),
    repo.cmsResourceList({ page: 1, limit: 200 }),
  ]);
  return {
    pages: pages.map((row) => ({ id: Number(row.id), slug: String(row.slug) })),
    resources: resources.data.map((row) => ({ id: Number(row.id), slug: String(row.slug) })),
    reserved: [...RESERVED_SLUGS],
  };
}

/** Page list for the parent picker — an existing page may not be made its own ancestor. */
export async function pageOptions(excludeId?: number | null) {
  const rows = await repo.cmsPageOptions();
  const descendants = new Set<number>();
  if (excludeId) {
    const under = (parentId: number) => {
      for (const row of rows) {
        if (Number(row.parent_page_id) === parentId && !descendants.has(Number(row.id))) {
          descendants.add(Number(row.id));
          under(Number(row.id));
        }
      }
    };
    under(excludeId);
  }
  return rows
    .filter((row) => Number(row.id) !== excludeId && !descendants.has(Number(row.id)))
    .map((row) => ({ id: Number(row.id), title: String(row.title), slug: String(row.slug) }));
}

export async function getPageDetail(pageId: number) {
  const page = await repo.cmsPageById(pageId);
  if (!page) throw notFound('Page');

  const [sections, children, parent] = await Promise.all([
    repo.sectionsForPage(pageId),
    repo.childPages(pageId),
    page.parent_page_id ? repo.cmsPageById(Number(page.parent_page_id)) : Promise.resolve(null),
  ]);

  return { page, sections, children, parent: parent ?? null };
}

/**
 * Resolves the slug a page is saved under.
 *
 * A slug typed by a human is a promise about an address, so a collision is
 * refused outright. A slug derived from the title is a convenience, so a
 * collision is quietly made unique instead of blocking the save.
 */
async function resolvePageSlug(rawSlug: string | undefined, title: string, excludeId?: number | null) {
  const explicit = Boolean(rawSlug && rawSlug.trim());
  const base = slugify(explicit ? rawSlug! : title);
  if (!base) throw validationFailed([{ field: 'slug', message: 'That title produces an empty slug — set one explicitly' }]);
  if ((RESERVED_SLUGS as readonly string[]).includes(base)) {
    throw conflict('DUPLICATE', `“${base}” is a reserved platform route — choose another slug`, [
      { field: 'slug', message: `“${base}” is reserved by the public site` },
    ]);
  }
  const taken = new Set((await repo.cmsPageSlugs(excludeId)).map((row) => String(row.slug)));
  if (taken.has(base)) {
    if (explicit) {
      throw conflict('DUPLICATE', `“${base}” is already used by another page — choose another slug`, [
        { field: 'slug', message: `“${base}” is already taken` },
      ]);
    }
    return uniqueSlug(base, taken);
  }
  return base;
}

async function clearHomepageFlag(exceptId?: number | null) {
  const current = await queryOne<RowDataPacket>(
    `SELECT id, title FROM cms_pages WHERE is_homepage = 1 AND deleted_at IS NULL${exceptId ? ' AND id <> ?' : ''} LIMIT 1`,
    exceptId ? [exceptId] : []
  );
  if (current) {
    await repo.updateCmsPage(Number(current.id), { is_homepage: false }, 0);
    return { id: Number(current.id), title: String(current.title) };
  }
  return null;
}

export async function createPage(payload: unknown, actor: ActorContext) {
  const input = cmsPageCreateSchema.parse(payload);
  const slug = await resolvePageSlug(input.slug, input.title);

  let replacedHomepage: { id: number; title: string } | null = null;
  if (input.is_homepage) replacedHomepage = await clearHomepageFlag();

  let status = input.status;
  let scheduledAt = input.scheduled_at ?? null;

  // "Publish" with a future date is scheduling, not publishing.
  if (status === 'published' && scheduledAt && new Date(scheduledAt.replace(' ', 'T')) > new Date()) {
    status = 'scheduled';
  }
  if (status === 'scheduled' && !scheduledAt) {
    throw validationFailed([{ field: 'scheduled_at', message: 'Choose when the page should go live' }]);
  }
  if (status !== 'scheduled') scheduledAt = null;

  const pageId = await repo.insertCmsPage({
    uuid: randomUUID(),
    slug,
    title: input.title,
    subtitle: input.subtitle ?? null,
    pageType: input.page_type,
    template: input.template,
    metaTitle: input.meta_title ?? null,
    metaDescription: input.meta_description ?? null,
    metaKeywords: input.meta_keywords ?? null,
    heroImage: input.hero_image ?? null,
    contentHtml: input.content_html ?? null,
    parentPageId: input.parent_page_id ?? null,
    sortOrder: input.sort_order ?? 0,
    showInMenu: Boolean(input.show_in_menu),
    menuLabel: input.menu_label ?? null,
    isHomepage: Boolean(input.is_homepage),
    status,
    scheduledAt,
    userId: actor.user.id,
  });

  await writeActivityLog({
    ...actorFields(actor),
    action: 'created',
    module: 'cms_page',
    entityType: 'cms_page',
    entityId: pageId,
    entityLabel: input.title,
    description: `CMS page “${input.title}” created as ${status} (${input.page_type})`,
    newValues: { slug, page_type: input.page_type, status, template: input.template },
  });

  if (replacedHomepage) {
    await writeActivityLog({
      ...actorFields(actor),
      action: 'updated',
      module: 'cms_page',
      entityType: 'cms_page',
      entityId: replacedHomepage.id,
      entityLabel: replacedHomepage.title,
      description: `Homepage flag moved from “${replacedHomepage.title}” to “${input.title}”`,
      oldValues: { is_homepage: true },
      newValues: { is_homepage: false },
    });
  }

  return { id: pageId, slug, status, scheduledAt, replacedHomepage };
}

export async function updatePage(pageId: number, payload: unknown, actor: ActorContext) {
  const page = await repo.cmsPageById(pageId);
  if (!page) throw notFound('Page');

  const input = cmsPageUpdateSchema.parse(payload);
  const fields: Record<string, unknown> = {};
  const changed: Record<string, { from: unknown; to: unknown }> = {};

  const assign = <K extends keyof typeof input>(key: K, column: string, transform?: (value: unknown) => unknown) => {
    if (input[key] === undefined) return;
    const next = transform ? transform(input[key]) : (input[key] as unknown);
    const current = page[column];
    if (next === current || (next ?? null) === (current ?? null)) return;
    fields[column] = next;
    changed[column] = { from: current ?? null, to: next ?? null };
  };

  assign('title', 'title');
  assign('subtitle', 'subtitle');
  assign('page_type', 'page_type');
  assign('template', 'template');
  assign('meta_title', 'meta_title');
  assign('meta_description', 'meta_description');
  assign('meta_keywords', 'meta_keywords');
  assign('hero_image', 'hero_image');
  assign('content_html', 'content_html');
  assign('parent_page_id', 'parent_page_id');
  assign('sort_order', 'sort_order');
  assign('menu_label', 'menu_label');
  assign('show_in_menu', 'show_in_menu', (value) => (value ? 1 : 0));
  assign('is_homepage', 'is_homepage', (value) => (value ? 1 : 0));

  let status = input.status;
  let scheduledAt: string | null | undefined = input.scheduled_at;
  if (status === 'published' && scheduledAt && new Date(scheduledAt.replace(' ', 'T')) > new Date()) status = 'scheduled';
  if (status && status !== 'scheduled' && input.scheduled_at) scheduledAt = null;

  let slug: string | undefined;
  if (input.slug !== undefined && input.slug !== null) {
    slug = await resolvePageSlug(input.slug, String(fields.title ?? page.title), pageId);
    if (slug !== String(page.slug)) {
      fields.slug = slug;
      changed.slug = { from: page.slug, to: slug };
    }
    // A published page that changes address must keep resolving to its content,
    // so the old slug is recorded on the activity log the redirect page reads.
    if (slug !== String(page.slug) && String(page.status) === 'published') {
      await writeActivityLog({
        ...actorFields(actor),
        action: 'updated',
        module: 'cms_page',
        entityType: 'cms_page',
        entityId: pageId,
        entityLabel: String(page.title),
        description: `Published page “${page.title}” moved from /${page.slug} to /${slug} — the old address now redirects`,
        oldValues: { slug: page.slug },
        newValues: { slug },
      });
    }
  }

  if (status && status !== page.status) {
    changed.status = { from: page.status, to: status };
    fields.status = status;
  }
  if (scheduledAt !== undefined && scheduledAt !== page.scheduled_at) {
    changed.scheduled_at = { from: page.scheduled_at, to: scheduledAt };
    fields.scheduled_at = scheduledAt;
  }

  if (!Object.keys(fields).length) {
    throw conflict('NO_CHANGE', 'Nothing about this page has changed');
  }

  // Parent cannot be the page itself, and cannot be one of its own children.
  if (fields.parent_page_id) {
    const parentId = Number(fields.parent_page_id);
    if (parentId === pageId) throw validationFailed([{ field: 'parent_page_id', message: 'A page cannot be its own parent' }]);
    const children = await repo.childPages(pageId);
    if (children.some((child) => Number(child.id) === parentId)) {
      throw validationFailed([{ field: 'parent_page_id', message: 'A page cannot sit under one of its own children' }]);
    }
  }

  let replacedHomepage: { id: number; title: string } | null = null;
  if (fields.is_homepage === 1) replacedHomepage = await clearHomepageFlag(pageId);

  const publishingNow = status === 'published' && page.status !== 'published';
  await repo.updateCmsPage(pageId, fields, actor.user.id, {
    publishedAt: publishingNow ? new Date() : undefined,
  });

  await writeActivityLog({
    ...actorFields(actor),
    action: 'updated',
    module: 'cms_page',
    entityType: 'cms_page',
    entityId: pageId,
    entityLabel: String(fields.title ?? page.title),
    description: `CMS page “${fields.title ?? page.title}” updated${
      input.change_note ? ` — ${input.change_note}` : ''
    } (${Object.keys(changed).join(', ')})`,
    oldValues: Object.fromEntries(Object.entries(changed).map(([key, value]) => [key, value.from])),
    newValues: Object.fromEntries(Object.entries(changed).map(([key, value]) => [key, value.to])),
  });

  if (replacedHomepage) {
    await writeActivityLog({
      ...actorFields(actor),
      action: 'updated',
      module: 'cms_page',
      entityType: 'cms_page',
      entityId: replacedHomepage.id,
      entityLabel: replacedHomepage.title,
      description: `Homepage flag moved from “${replacedHomepage.title}” to “${fields.title ?? page.title}”`,
      oldValues: { is_homepage: true },
      newValues: { is_homepage: false },
    });
  }

  return { id: pageId, slug: slug ?? String(page.slug), status: status ?? String(page.status), changed: Object.keys(changed) };
}

/** publish / unpublish / schedule / archive / restore. */
export async function setPageStatus(
  pageId: number,
  payload: unknown,
  actor: ActorContext
) {
  const page = await repo.cmsPageById(pageId);
  if (!page) throw notFound('Page');

  const input = payload as { action: string; scheduled_at?: string | null; note?: string | null };
  const status = page.status as string;

  switch (input.action) {
    case 'publish': {
      if (status === 'published') throw conflict('INVALID_STATE', 'That page is already published');
      if (status === 'archived') {
        throw conflict('INVALID_STATE', 'That page is archived — restore it as a draft before publishing it again');
      }
      const sections = await repo.sectionsForPage(pageId);
      if (!sections.length && !String(page.content_html ?? '').trim()) {
        throw conflict('INVALID_STATE', 'A page needs content or sections before it can be published');
      }
      await repo.setCmsPageStatus(
        pageId,
        { status: 'published', scheduledAt: null, publishedAt: page.published_at ? undefined : new Date() },
        actor.user.id
      );
      break;
    }
    case 'schedule': {
      if (!input.scheduled_at) throw validationFailed([{ field: 'scheduled_at', message: 'Choose when the page should go live' }]);
      const when = new Date(input.scheduled_at.replace(' ', 'T'));
      if (Number.isNaN(when.getTime())) throw validationFailed([{ field: 'scheduled_at', message: 'That date could not be read' }]);
      if (when <= new Date()) throw validationFailed([{ field: 'scheduled_at', message: 'Choose a moment in the future' }]);
      await repo.setCmsPageStatus(pageId, { status: 'scheduled', scheduledAt: input.scheduled_at }, actor.user.id);
      break;
    }
    case 'unpublish': {
      if (status !== 'published') throw conflict('INVALID_STATE', 'Only a published page can be unpublished');
      // `published_at` is deliberately kept: it is the page's publication history.
      await repo.setCmsPageStatus(pageId, { status: 'draft', scheduledAt: null }, actor.user.id);
      break;
    }
    case 'archive': {
      if (status === 'archived') throw conflict('INVALID_STATE', 'That page is already archived');
      await repo.setCmsPageStatus(pageId, { status: 'archived', scheduledAt: null }, actor.user.id);
      break;
    }
    case 'restore': {
      await restorePage(pageId, actor);
      return { id: pageId, action: 'restore' };
    }
    default:
      throw validationFailed([{ field: 'action', message: 'Unknown publishing action' }]);
  }

  const label = String(page.title);
  await writeActivityLog({
    ...actorFields(actor),
    action: input.action === 'publish' ? 'published' : input.action === 'archive' ? 'archived' : 'updated',
    module: 'cms_page',
    entityType: 'cms_page',
    entityId: pageId,
    entityLabel: label,
    description: `CMS page “${label}” ${input.action}${
      input.action === 'schedule' ? ` for ${input.scheduled_at}` : ''
    }${input.note ? ` — ${input.note}` : ''}`,
    oldValues: { status },
    newValues: { status: input.action === 'publish' ? 'published' : input.action },
  });

  return { id: pageId, action: input.action };
}

export async function bulkPageAction(payload: unknown, actor: ActorContext) {
  const input = payload as { ids: number[]; action: string; note?: string | null };
  const results: { id: number; title: string; status: 'ok' | 'error'; message: string }[] = [];

  for (const id of input.ids) {
    const page = await repo.cmsPageById(Number(id));
    if (!page) {
      results.push({ id: Number(id), title: '—', status: 'error', message: 'Page not found' });
      continue;
    }
    try {
      await setPageStatus(Number(id), { action: input.action, note: input.note ?? null }, actor);
      results.push({ id: Number(id), title: String(page.title), status: 'ok', message: `Page ${input.action}d` });
    } catch (error) {
      results.push({
        id: Number(id),
        title: String(page.title),
        status: 'error',
        message: (error as Error).message,
      });
    }
  }

  const succeeded = results.filter((row) => row.status === 'ok').length;
  return { results, succeeded, failed: results.length - succeeded };
}

export async function deletePage(pageId: number, payload: { confirm?: boolean }, actor: ActorContext) {
  const page = await repo.cmsPageById(pageId);
  if (!page) throw notFound('Page');

  const children = await repo.childPages(pageId);
  const liveChildren = children.filter((child) => child.status !== 'archived');
  if (liveChildren.length) {
    throw conflict(
      'IN_USE',
      `“${page.title}” still has ${liveChildren.length} child page(s): ${liveChildren.map((child) => child.title).join(', ')}. Move or delete them first.`
    );
  }

  const usage = await queryOne<RowDataPacket>(
    `SELECT COUNT(*) AS total FROM cms_page_sections WHERE page_id = ? AND deleted_at IS NULL`,
    [pageId]
  );
  if (Number(usage?.total ?? 0) > 0 && !payload?.confirm) {
    throw conflict('IN_USE', `That page still carries ${usage?.total} section(s) — confirm to delete it and them together`);
  }

  await repo.softDeleteCmsPage(pageId, actor.user.id);
  await writeActivityLog({
    ...actorFields(actor),
    action: 'deleted',
    module: 'cms_page',
    entityType: 'cms_page',
    entityId: pageId,
    entityLabel: String(page.title),
    description: `CMS page “${page.title}” (/${page.slug}) moved to the archive with its ${Number(usage?.total ?? 0)} section(s)`,
    oldValues: { status: page.status, slug: page.slug },
    newValues: { deleted_at: new Date().toISOString() },
  });

  return { id: pageId, sections: Number(usage?.total ?? 0) };
}

/**
 * Brings an archived page back as a draft.
 *
 * There are two archives in this platform and both must be restorable: a page
 * whose status was set to `archived` (still in the register, hidden from the
 * public site) and a page removed from the register altogether (soft-deleted).
 */
export async function restorePage(pageId: number, actor: ActorContext) {
  const live = await repo.cmsPageById(pageId);
  if (live) {
    if (String(live.status) !== 'archived') {
      throw conflict('INVALID_STATE', 'Only an archived page can be restored');
    }
    await repo.setCmsPageStatus(pageId, { status: 'draft', scheduledAt: null }, actor.user.id);
  } else {
    const restored = await repo.restoreCmsPage(pageId, actor.user.id);
    if (!restored) throw notFound('Archived page');
  }
  const page = await repo.cmsPageById(pageId);
  await writeActivityLog({
    ...actorFields(actor),
    action: 'restored',
    module: 'cms_page',
    entityType: 'cms_page',
    entityId: pageId,
    entityLabel: page ? String(page.title) : `Page ${pageId}`,
    description: `CMS page “${page ? page.title : pageId}” restored as a draft`,
    newValues: { status: 'draft' },
  });
  return { id: pageId, status: 'draft' };
}

/* ═════════════════════════════════ sections ═══════════════════════════════ */

/** Turns `items[]` into the stored `content_json`, keeping any raw JSON given. */
function composeSectionJson(
  items: unknown,
  rawJson: string | null | undefined,
  sectionType: string
): string | null {
  if (Array.isArray(items) && items.length) {
    return JSON.stringify({
      items: items.map((item) => {
        const record = item as Record<string, unknown>;
        const cleaned: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(record)) {
          if (value === null || value === undefined || value === '') continue;
          if (Array.isArray(value) && value.length === 0) continue;
          cleaned[key] = value;
        }
        return cleaned;
      }),
    });
  }
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson) as unknown;
      if (parsed && typeof parsed === 'object') return JSON.stringify(parsed);
      throw new Error('not an object');
    } catch {
      throw validationFailed([{ field: 'content_json', message: 'The section payload must be valid JSON' }]);
    }
  }
  if (LIST_SECTION_TYPES.includes(sectionType)) return JSON.stringify({ items: [] });
  return null;
}

export async function addSection(pageId: number, payload: unknown, actor: ActorContext) {
  const page = await repo.cmsPageById(pageId);
  if (!page) throw notFound('Page');

  const input = cmsSectionCreateSchema.parse(payload);
  const order = input.sort_order ?? (await repo.maxSectionOrder(pageId)) + 1;
  const items = (input.items ?? []).filter(Boolean);

  const sectionId = await repo.insertCmsSection({
    pageId,
    sectionKey: input.section_key ?? null,
    sectionType: input.section_type,
    heading: input.heading ?? null,
    subheading: input.subheading ?? null,
    contentHtml: input.content_html ?? null,
    contentJson: composeSectionJson(items, input.content_json ?? null, input.section_type),
    imageUrl: input.image_url ?? null,
    backgroundColor: input.background_color ?? null,
    sortOrder: order,
    status: input.status ?? 'active',
    userId: actor.user.id,
  });

  await writeActivityLog({
    ...actorFields(actor),
    action: 'created',
    module: 'cms_page',
    entityType: 'cms_page',
    entityId: pageId,
    entityLabel: String(page.title),
    description: `Section “${input.heading ?? input.section_type}” (${input.section_type}) added to page “${page.title}”`,
    newValues: { section_type: input.section_type, sort_order: order, items: items.length },
  });

  return { id: sectionId, sortOrder: order, items: items.length };
}

export async function updateSection(sectionId: number, payload: unknown, actor: ActorContext) {
  const section = await repo.cmsSectionById(sectionId);
  if (!section) throw notFound('Section');
  const page = await repo.cmsPageById(Number(section.page_id));

  const input = cmsSectionCreateSchema.parse({
    ...(payload as Record<string, unknown>),
    // An edit may leave the payload untouched, and the schema needs *something*.
    section_type: (payload as Record<string, unknown>).section_type ?? section.section_type,
  });

  const items = (input.items ?? []).filter(Boolean);
  const fields: Record<string, unknown> = {
    section_key: input.section_key ?? null,
    section_type: input.section_type,
    heading: input.heading ?? null,
    subheading: input.subheading ?? null,
    content_html: input.content_html ?? null,
    image_url: input.image_url ?? null,
    background_color: input.background_color ?? null,
    status: input.status ?? 'active',
  };
  if (input.sort_order !== undefined) fields.sort_order = input.sort_order;

  const json = composeSectionJson(items, input.content_json ?? null, input.section_type);
  if (json !== null || Array.isArray(input.items) || input.content_json !== undefined) fields.content_json = json;

  await repo.updateCmsSection(sectionId, fields);

  await writeActivityLog({
    ...actorFields(actor),
    action: 'updated',
    module: 'cms_page',
    entityType: 'cms_page',
    entityId: Number(section.page_id),
    entityLabel: page ? String(page.title) : `Page ${section.page_id}`,
    description: `Section “${input.heading ?? input.section_type}” updated on page “${page ? page.title : section.page_id}”`,
    oldValues: { heading: section.heading, section_type: section.section_type, sort_order: section.sort_order },
    newValues: { heading: input.heading ?? null, section_type: input.section_type, sort_order: fields.sort_order ?? section.sort_order },
  });

  return { id: sectionId, items: items.length };
}

export async function removeSection(sectionId: number, actor: ActorContext) {
  const section = await repo.cmsSectionById(sectionId);
  if (!section) throw notFound('Section');
  const page = await repo.cmsPageById(Number(section.page_id));

  await repo.deleteCmsSection(sectionId);
  await writeActivityLog({
    ...actorFields(actor),
    action: 'deleted',
    module: 'cms_page',
    entityType: 'cms_page',
    entityId: Number(section.page_id),
    entityLabel: page ? String(page.title) : `Page ${section.page_id}`,
    description: `Section “${section.heading ?? section.section_type}” removed from page “${page ? page.title : section.page_id}”`,
    oldValues: { heading: section.heading, section_type: section.section_type },
  });
  return { id: sectionId };
}

export async function reorderSections(pageId: number, orderedIds: number[], actor: ActorContext) {
  const page = await repo.cmsPageById(pageId);
  if (!page) throw notFound('Page');
  const current = await repo.sectionsForPage(pageId);
  const currentIds = current.map((row) => Number(row.id));
  const unknown = orderedIds.filter((id) => !currentIds.includes(id));
  if (unknown.length) {
    throw validationFailed([{ field: 'order', message: `Section ${unknown[0]} does not belong to this page` }]);
  }
  if (orderedIds.length !== currentIds.length) {
    throw conflict('VALIDATION_FAILED', 'Send every section of the page in its new order');
  }

  const updated = await repo.reorderCmsSections(pageId, orderedIds);
  await writeActivityLog({
    ...actorFields(actor),
    action: 'updated',
    module: 'cms_page',
    entityType: 'cms_page',
    entityId: pageId,
    entityLabel: String(page.title),
    description: `Section order changed on page “${page.title}” (${orderedIds.length} sections)`,
    newValues: { order: orderedIds },
  });
  return { updated, order: orderedIds };
}

/* ══════════════════════════════════ media ═════════════════════════════════ */

export async function listMedia(filters: repo.CmsMediaFilters) {
  const [result, stats] = await Promise.all([repo.cmsMediaList(filters), repo.cmsMediaStats()]);
  return { ...result, stats };
}

function mediaTypeFor(mimeType: string | null, fileName: string): string {
  const mime = (mimeType ?? '').toLowerCase();
  const extension = fileName.split('.').pop()?.toLowerCase() ?? '';
  if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'avif'].includes(extension)) return 'image';
  if (mime.startsWith('video/') || ['mp4', 'webm', 'mov'].includes(extension)) return 'video';
  if (mime.startsWith('audio/') || ['mp3', 'wav', 'ogg'].includes(extension)) return 'audio';
  if (mime.includes('pdf') || ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'csv', 'txt'].includes(extension)) return 'document';
  return 'other';
}

export async function uploadMedia(
  files: { originalName: string; mimeType: string | null; data: Buffer }[],
  meta: { title?: string | null; folder?: string | null; alt_text?: string | null; caption?: string | null; tags?: string | null },
  actor: ActorContext
) {
  if (!files.length) throw validationFailed([{ field: 'files', message: 'Choose at least one file' }]);

  const uploads: UploadInput[] = files.map((file) => ({
    originalName: file.originalName,
    mimeType: file.mimeType ?? 'application/octet-stream',
    data: file.data,
  }));

  // The vault does the checking, storing and checksumming; the CMS row points at it.
  const stored = await saveUploads(
    uploads,
    {
      entityType: 'CMS_MEDIA',
      entityId: null,
      category: meta.folder ?? 'General',
      accessLevel: 'public',
      description: meta.caption ?? null,
      tags: meta.tags ?? null,
    },
    { user: actor.user, ip: actor.ip ?? undefined }
  );

  const created: number[] = [];
  for (const [index, payload] of stored.entries()) {
    const file = files[index];
    const mediaId = await repo.insertCmsMedia({
      uuid: randomUUID(),
      title: meta.title ?? file.originalName.replace(/\.[^.]+$/, '').slice(0, 255),
      fileName: file.originalName,
      filePath: payload.url,
      mimeType: payload.mime_type,
      mediaType: mediaTypeFor(payload.mime_type, file.originalName),
      sizeBytes: payload.size_bytes,
      folder: meta.folder ?? 'General',
      tags: meta.tags ?? null,
      userId: actor.user.id,
    });
    await repo.linkCmsMediaFile(mediaId, {
      fileId: payload.id,
      publicUrl: payload.url,
      filePath: payload.url,
      mimeType: payload.mime_type,
      sizeBytes: payload.size_bytes,
    });
    created.push(mediaId);
  }

  await writeActivityLog({
    ...actorFields(actor),
    action: 'created',
    module: 'cms_media',
    entityType: 'cms_media',
    entityId: created[0] ?? null,
    entityLabel: meta.title ?? files[0].originalName,
    description: `${created.length} media asset(s) uploaded to the library (${meta.folder ?? 'General'})`,
    newValues: { files: files.map((file) => file.originalName), folder: meta.folder ?? 'General' },
  });

  return { created, count: created.length };
}

export async function getMediaDetail(mediaId: number) {
  const media = await repo.cmsMediaById(mediaId);
  if (!media) throw notFound('Media asset');
  const usage = await repo.cmsMediaUsage(String(media.public_url ?? media.file_path ?? ''));
  return { media, usage };
}

export async function updateMedia(mediaId: number, payload: unknown, actor: ActorContext) {
  const media = await repo.cmsMediaById(mediaId);
  if (!media) throw notFound('Media asset');
  const input = cmsMediaUpdateSchema.parse(payload);

  const fields: Record<string, unknown> = {};
  const changed: Record<string, { from: unknown; to: unknown }> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if ((media[key] ?? null) === (value ?? null)) continue;
    fields[key] = value;
    changed[key] = { from: media[key] ?? null, to: value ?? null };
  }
  if (!Object.keys(fields).length) throw conflict('NO_CHANGE', 'Nothing about this asset has changed');

  await repo.updateCmsMedia(mediaId, fields);
  await writeActivityLog({
    ...actorFields(actor),
    action: 'updated',
    module: 'cms_media',
    entityType: 'cms_media',
    entityId: mediaId,
    entityLabel: String(media.title ?? media.file_name),
    description: `Media asset “${media.title ?? media.file_name}” details updated (${Object.keys(changed).join(', ')})`,
    oldValues: Object.fromEntries(Object.entries(changed).map(([key, value]) => [key, value.from])),
    newValues: Object.fromEntries(Object.entries(changed).map(([key, value]) => [key, value.to])),
  });
  return { id: mediaId, changed: Object.keys(changed) };
}

export async function deleteMedia(mediaId: number, actor: ActorContext) {
  const media = await repo.cmsMediaById(mediaId);
  if (!media) throw notFound('Media asset');

  const usage = await repo.cmsMediaUsage(String(media.public_url ?? media.file_path ?? ''));
  const live = usage.filter((row) => row.status !== 'archived');
  if (live.length) {
    throw conflict(
      'IN_USE',
      `That asset is still used by ${live.length} page(s): ${live.map((row) => row.title).join(', ')}. Replace it there first.`
    );
  }

  await repo.deleteCmsMedia(mediaId);
  await writeActivityLog({
    ...actorFields(actor),
    action: 'deleted',
    module: 'cms_media',
    entityType: 'cms_media',
    entityId: mediaId,
    entityLabel: String(media.title ?? media.file_name),
    description: `Media asset “${media.title ?? media.file_name}” removed from the library (the vault file is kept)`,
    oldValues: { file_name: media.file_name, folder: media.folder },
  });
  return { id: mediaId };
}

/* ════════════════════════════════ resources ═══════════════════════════════ */

export async function listResources(filters: repo.CmsResourceFilters) {
  const [result, stats] = await Promise.all([repo.cmsResourceList(filters), repo.cmsResourceStats()]);
  return { ...result, stats };
}

export async function getResourceDetail(resourceId: number) {
  const resource = await repo.cmsResourceById(resourceId);
  if (!resource) throw notFound('Resource');
  return { resource };
}

async function resolveResourceSlug(rawSlug: string | undefined, title: string, excludeId?: number | null) {
  const base = slugify(rawSlug && rawSlug.trim() ? rawSlug : title);
  if (!base) throw validationFailed([{ field: 'slug', message: 'That title produces an empty slug — set one explicitly' }]);
  const taken = new Set([
    ...(await repo.cmsResourceList({ page: 1, limit: 200 })).data.map((row) => String(row.slug)),
    ...(await repo.cmsPageSlugs()).map((row) => String(row.slug)),
  ]);
  if (excludeId) {
    const current = await repo.cmsResourceById(excludeId);
    if (current) taken.delete(String(current.slug));
  }
  if ((RESERVED_SLUGS as readonly string[]).includes(base)) {
    throw conflict('DUPLICATE', `“${base}” is a reserved platform route — choose another slug`, [
      { field: 'slug', message: `“${base}” is reserved by the public site` },
    ]);
  }
  if (taken.has(base) && rawSlug && rawSlug.trim()) {
    throw conflict('DUPLICATE', `“${base}” is already used by another page or resource — choose another slug`, [
      { field: 'slug', message: `“${base}” is already taken` },
    ]);
  }
  return uniqueSlug(base, taken);
}

export async function createResource(payload: unknown, actor: ActorContext) {
  const input = cmsResourceSchema.parse(payload);
  if (!input.file_id && !input.external_url) {
    throw validationFailed([{ field: 'file_id', message: 'Attach an uploaded file or give an external URL' }]);
  }
  const slug = await resolveResourceSlug(input.slug, input.title);

  const resourceId = await repo.insertCmsResource({
    uuid: randomUUID(),
    title: input.title,
    slug,
    description: input.description ?? null,
    resourceType: input.resource_type,
    category: input.category ?? null,
    actId: input.act_id ?? null,
    fileId: input.file_id ?? null,
    externalUrl: input.external_url ?? null,
    thumbnail: input.thumbnail ?? null,
    requiresLogin: Boolean(input.requires_login),
    sortOrder: input.sort_order ?? 0,
    status: input.status,
    userId: actor.user.id,
  });

  await writeActivityLog({
    ...actorFields(actor),
    action: 'created',
    module: 'cms_resource',
    entityType: 'cms_resource',
    entityId: resourceId,
    entityLabel: input.title,
    description: `Resource “${input.title}” (${input.resource_type}) added to the library as ${input.status}`,
    newValues: { slug, resource_type: input.resource_type, status: input.status, requires_login: Boolean(input.requires_login) },
  });

  return { id: resourceId, slug, status: input.status };
}

export async function updateResource(resourceId: number, payload: unknown, actor: ActorContext) {
  const resource = await repo.cmsResourceById(resourceId);
  if (!resource) throw notFound('Resource');
  const input = cmsResourceSchema.partial().parse(payload);

  const fields: Record<string, unknown> = {};
  const changed: Record<string, { from: unknown; to: unknown }> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || key === 'slug') continue;
    const current = resource[key];
    const next = typeof value === 'boolean' ? (value ? 1 : 0) : value;
    if ((current ?? null) === (next ?? null)) continue;
    fields[key] = next;
    changed[key] = { from: current ?? null, to: next ?? null };
  }

  if (input.slug !== undefined && input.slug !== null) {
    const slug = await resolveResourceSlug(input.slug, String(fields.title ?? resource.title), resourceId);
    if (slug !== String(resource.slug)) {
      fields.slug = slug;
      changed.slug = { from: resource.slug, to: slug };
    }
  }

  const nextFileId = fields.file_id !== undefined ? fields.file_id : resource.file_id;
  const nextUrl = fields.external_url !== undefined ? fields.external_url : resource.external_url;
  if (!nextFileId && !nextUrl) {
    throw validationFailed([{ field: 'file_id', message: 'A resource needs either an uploaded file or an external URL' }]);
  }

  if (!Object.keys(fields).length) throw conflict('NO_CHANGE', 'Nothing about this resource has changed');

  const publishing = fields.status === 'published' && resource.status !== 'published';
  await repo.updateCmsResource(resourceId, fields, actor.user.id, {
    publishedAt: publishing ? new Date() : undefined,
  });

  await writeActivityLog({
    ...actorFields(actor),
    action: 'updated',
    module: 'cms_resource',
    entityType: 'cms_resource',
    entityId: resourceId,
    entityLabel: String(fields.title ?? resource.title),
    description: `Resource “${fields.title ?? resource.title}” updated (${Object.keys(changed).join(', ')})`,
    oldValues: Object.fromEntries(Object.entries(changed).map(([key, value]) => [key, value.from])),
    newValues: Object.fromEntries(Object.entries(changed).map(([key, value]) => [key, value.to])),
  });

  return { id: resourceId, changed: Object.keys(changed) };
}

export async function deleteResource(resourceId: number, actor: ActorContext) {
  const resource = await repo.cmsResourceById(resourceId);
  if (!resource) throw notFound('Resource');

  await repo.deleteCmsResource(resourceId, actor.user.id);
  await writeActivityLog({
    ...actorFields(actor),
    action: 'deleted',
    module: 'cms_resource',
    entityType: 'cms_resource',
    entityId: resourceId,
    entityLabel: String(resource.title),
    description: `Resource “${resource.title}” archived out of the public library`,
    oldValues: { status: resource.status, slug: resource.slug },
  });
  return { id: resourceId };
}

/* ═══════════════════════════ public read path ═════════════════════════════ */

/**
 * Promotes anything whose scheduled moment has passed, then answers the page.
 * The scheduled-publishing job does this on its own clock; doing it here as well
 * means a launch date holds even on a deployment whose cron is not wired up yet.
 */
export async function publishedPage(slug: string) {
  await repo.promoteDueScheduledPages();
  const page = await queryOne<RowDataPacket>(
    `SELECT p.*, u.first_name AS author_first, u.last_name AS author_last
       FROM cms_pages p LEFT JOIN users u ON u.id = p.updated_by
      WHERE p.slug = ? AND p.status = 'published' AND p.deleted_at IS NULL
        AND (p.scheduled_at IS NULL OR p.scheduled_at <= NOW())
      LIMIT 1`,
    [slug]
  );
  if (!page) throw notFound('Page');

  const sections = await repo.sectionsForPage(Number(page.id));
  // A public read is a view. Counting it is the only "analytics" the platform
  // keeps on content, and it is deliberately fire-and-forget.
  void repo.incrementCmsPageViews(Number(page.id)).catch(() => undefined);

  return {
    page,
    sections: sections.filter((section) => section.status === 'active'),
  };
}

/** Anything a published page's address used to be — used by the redirect route. */
export async function findRedirectSource(slug: string) {
  const row = await queryOne<RowDataPacket>(
    `SELECT entity_id, new_values_json, created_at FROM activity_logs
      WHERE module = 'cms_page' AND entity_type = 'cms_page'
        AND description LIKE '%now redirects%'
        AND JSON_EXTRACT(new_values_json, '$.slug') = ?
      ORDER BY id DESC LIMIT 1`,
    [slug]
  );
  if (!row) return null;
  const page = await repo.cmsPageById(Number(row.entity_id));
  if (!page || page.status !== 'published') return null;
  return { slug: String(page.slug), title: String(page.title) };
}

/** The public resource library: published rows, with their file and act. */
export async function publishedResources() {
  const rows = await repo.publishedCmsResources(120);
  return rows.map((row) => ({
    id: Number(row.id),
    title: String(row.title),
    slug: String(row.slug),
    description: row.description ? String(row.description) : null,
    resource_type: String(row.resource_type),
    category: row.category ? String(row.category) : null,
    act_name: row.act_name ? String(row.act_name) : null,
    external_url: row.external_url ? String(row.external_url) : null,
    thumbnail: row.thumbnail ? String(row.thumbnail) : null,
    requires_login: Boolean(Number(row.requires_login)),
    download_count: Number(row.download_count ?? 0),
    published_at: (row.published_at as string | null) ?? null,
    has_file: Boolean(row.file_id),
    file_name: row.file_name ? String(row.file_name) : null,
    file_mime: row.file_mime ? String(row.file_mime) : null,
  }));
}

/** One published resource, or nothing — an unlisted slug must not leak. */
export async function publishedResource(slug: string) {
  const row = await repo.cmsResourceBySlug(slug);
  if (!row || row.status !== 'published') return null;
  return {
    id: Number(row.id),
    title: String(row.title),
    slug: String(row.slug),
    description: row.description ? String(row.description) : null,
    resource_type: String(row.resource_type),
    category: row.category ? String(row.category) : null,
    act_name: row.act_name ? String(row.act_name) : null,
    external_url: row.external_url ? String(row.external_url) : null,
    thumbnail: row.thumbnail ? String(row.thumbnail) : null,
    requires_login: Boolean(Number(row.requires_login)),
    download_count: Number(row.download_count ?? 0),
    published_at: (row.published_at as string | null) ?? null,
    has_file: Boolean(row.file_id),
    file_id: row.file_id ? Number(row.file_id) : null,
    file_name: row.file_name ? String(row.file_name) : null,
    file_mime: row.file_mime ? String(row.file_mime) : null,
  };
}

/** Counts a public download of a file-backed resource. */
export async function registerResourceDownload(resourceId: number) {
  await repo.incrementResourceDownloads(resourceId);
}

export async function cmsOverview() {
  const [pages, media, resources, recent, due] = await Promise.all([
    repo.cmsPageStats(),
    repo.cmsMediaStats(),
    repo.cmsResourceStats(),
    repo.recentCmsPages(),
    repo.dueScheduledPages(),
  ]);
  return { pages, media, resources, recent, due };
}

/** The scheduled-publishing job body. */
export async function runScheduledPublishing(actor?: ActorContext) {
  const promoted = await repo.promoteDueScheduledPages();
  if (promoted && actor) {
    await writeActivityLog({
      ...actorFields(actor),
      action: 'published',
      module: 'cms_page',
      entityType: 'cms_page',
      entityId: null,
      entityLabel: 'Scheduled publishing',
      description: `${promoted} scheduled CMS page(s) published automatically`,
      newValues: { published: promoted },
    });
  }
  return { published: promoted, ranAt: new Date().toISOString() };
}
