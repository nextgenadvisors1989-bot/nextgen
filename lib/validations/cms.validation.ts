/**
 * CMS contracts.
 *
 * The content system has three registers and one workflow:
 *
 *   * **pages** (`cms_pages`) — the page itself: slug, title, SEO fields, hero,
 *     free-form HTML body, menu placement and its publishing state;
 *   * **sections** (`cms_page_sections`) — the ordered blocks a page renders:
 *     hero, features, stats, CTA, accordion, tabs, FAQ, gallery … each with its
 *     own heading and a structured JSON payload the public renderer understands;
 *   * **media** (`cms_media`) — the asset library, every file backed by the
 *     document vault (`files`) so uploads are checksummed, versioned and swept
 *     like everything else the platform stores;
 *   * **resources** (`cms_resources`) — the downloadable library (guides,
 *     checklists, formats, circulars) attached to an act or an uploaded file.
 *
 * Publishing is a state machine rather than a flag:
 *   draft → published (immediately, stamping `published_at`)
 *   draft/published → scheduled (with a future `scheduled_at`)
 *   scheduled → published (by the scheduled-publishing job, or by a manual run)
 *   published → draft (unpublish keeps the old `published_at`)
 *   any → archived, and archived → draft to bring it back.
 */
import { z } from 'zod';

const asTuple = <T extends string>(values: readonly T[]): [T, ...T[]] => [...values] as [T, ...T[]];

/**
 * Optional text. An empty string is stored as NULL, a *missing* key stays
 * missing — a partial update must never blank the fields it did not mention.
 */
const optionalString = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((value) => (value === undefined ? undefined : value === '' ? null : value));

const optionalText = (max: number) =>
  z
    .union([z.string().max(max), z.literal('')])
    .optional()
    .nullable()
    .transform((value) => (value === undefined ? undefined : value === '' ? null : value));

const optionalId = z.coerce.number().int().positive().optional().nullable();

const booleanish = z
  .union([z.boolean(), z.literal(0), z.literal(1), z.literal('0'), z.literal('1'), z.literal('true'), z.literal('false')])
  .transform((value) => value === true || value === 1 || value === '1' || value === 'true');

/** A local ISO-ish datetime from `datetime-local`, or a full ISO string. */
const optionalDateTime = z
  .union([
    z.string().trim().regex(/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?)?$/, 'Use a valid date and time'),
    z.literal(''),
  ])
  .optional()
  .nullable()
  .transform((value) => (value === undefined ? undefined : value === '' ? null : value ? value.replace('T', ' ') : null));

/* ───────────────────────────── catalogues ──────────────────────────────── */

export const CMS_PAGE_TYPES = ['page', 'blog', 'faq', 'legal', 'landing', 'resource', 'report'] as const;
export const CMS_PAGE_TYPE_LABELS: Record<string, string> = {
  page: 'Page',
  blog: 'Blog post',
  faq: 'FAQ',
  legal: 'Legal',
  landing: 'Landing page',
  resource: 'Resource article',
  report: 'Published report',
};

export const CMS_STATUSES = ['draft', 'published', 'scheduled', 'archived'] as const;
export const CMS_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  published: 'Published',
  scheduled: 'Scheduled',
  archived: 'Archived',
};

/** Public-site routes that already exist — a slug may not reuse one of them. */
export const RESERVED_SLUGS = [
  'about', 'contact', 'services', 'acts-compliance', 'resources', 'reports',
  'terms-conditions', 'privacy-policy', 'login', 'forgot-password', 'reset-password',
  'change-password', 'activate-account', 'admin', 'auditor', 'employer', 'employee',
  'verifier', 'api', 'storage', 'media',
] as const;

export const CMS_TEMPLATES = ['default', 'wide', 'narrow', 'landing', 'sidebar'] as const;

export const CMS_SECTION_TYPES = [
  'hero', 'text', 'richtext', 'features', 'stats', 'cta', 'accordion', 'tabs', 'table',
  'image', 'gallery', 'team', 'testimonials', 'pricing', 'contact_form', 'faq', 'services', 'custom',
] as const;

export const CMS_SECTION_TYPE_LABELS: Record<string, string> = {
  hero: 'Hero banner',
  text: 'Text block',
  richtext: 'Rich text',
  features: 'Feature grid',
  stats: 'Statistic strip',
  cta: 'Call to action',
  accordion: 'Accordion',
  tabs: 'Tabbed panels',
  table: 'Comparison table',
  image: 'Image with caption',
  gallery: 'Image gallery',
  team: 'Team members',
  testimonials: 'Testimonials',
  pricing: 'Pricing plans',
  contact_form: 'Contact form',
  faq: 'FAQ list',
  services: 'Service cards',
  custom: 'Custom block',
};

/** Section types whose payload is a list of items rather than prose. */
export const LIST_SECTION_TYPES: readonly string[] = [
  'features', 'stats', 'accordion', 'tabs', 'gallery', 'team', 'testimonials',
  'pricing', 'faq', 'services', 'table',
];

export const CMS_MEDIA_TYPES = ['image', 'video', 'audio', 'document', 'other'] as const;
export const CMS_MEDIA_FOLDERS = ['Branding', 'Heroes', 'Team', 'Services', 'Resources', 'Reports', 'Icons', 'General'] as const;

export const RESOURCE_TYPES = [
  'Guide', 'Checklist', 'Template', 'Circular', 'Act', 'Rule', 'Report', 'Whitepaper', 'Video', 'Other',
] as const;
export const RESOURCE_STATUSES = ['draft', 'published', 'archived'] as const;

/** The shape of one item inside a list-style section's `content_json`. */
export const sectionItemSchema = z.object({
  title: optionalString(255),
  subtitle: optionalString(500),
  text: optionalText(2000),
  value: optionalString(100),
  label: optionalString(255),
  icon: optionalString(1000),
  image: optionalString(1000),
  link: optionalString(1000),
  linkLabel: optionalString(120),
  question: optionalString(500),
  answer: optionalText(4000),
  price: optionalString(60),
  features: z.array(z.string().trim().max(300)).max(30).optional().nullable(),
});

export type SectionItem = z.infer<typeof sectionItemSchema>;

const sectionItems = z.array(sectionItemSchema).max(60).optional().nullable();

/* ──────────────────────────────── pages ───────────────────────────────── */

export const cmsPageCreateSchema = z.object({
  title: z.string().trim().min(3, 'Give the page a title').max(255),
  slug: z
    .string()
    .trim()
    .max(255)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens only')
    .optional(),
  subtitle: optionalString(500),
  page_type: z.enum(asTuple(CMS_PAGE_TYPES)).optional().default('page'),
  template: z.enum(asTuple(CMS_TEMPLATES)).optional().default('default'),
  meta_title: optionalString(255),
  meta_description: optionalString(500),
  meta_keywords: optionalString(500),
  hero_image: optionalString(1000),
  content_html: optionalText(400000),
  parent_page_id: optionalId,
  sort_order: z.coerce.number().int().min(0).max(9999).optional().default(0),
  show_in_menu: booleanish.optional().default(false),
  menu_label: optionalString(100),
  is_homepage: booleanish.optional().default(false),
  status: z.enum(['draft', 'published', 'scheduled']).optional().default('draft'),
  scheduled_at: optionalDateTime,
  change_note: optionalString(300),
});

export const cmsPageUpdateSchema = cmsPageCreateSchema.partial().extend({
  title: z.string().trim().min(3).max(255).optional(),
});

export type CmsPageCreateInput = z.infer<typeof cmsPageCreateSchema>;
export type CmsPageUpdateInput = z.infer<typeof cmsPageUpdateSchema>;

export const cmsPageListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(10),
  search: z.string().trim().max(200).optional(),
  status: z.union([z.enum(asTuple(CMS_STATUSES)), z.literal('all'), z.literal('')]).optional().default('all'),
  page_type: z.union([z.enum(asTuple(CMS_PAGE_TYPES)), z.literal('all'), z.literal('')]).optional().default('all'),
  template: z.union([z.enum(asTuple(CMS_TEMPLATES)), z.literal('all'), z.literal('')]).optional().default('all'),
  menu: z.enum(['all', 'shown', 'hidden']).optional().default('all'),
  from_date: z.union([z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal('')]).optional().default(''),
  to_date: z.union([z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal('')]).optional().default(''),
  sortBy: z.string().trim().max(40).optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
});

/** Publish / unpublish / schedule / archive / restore. */
export const cmsPageStatusSchema = z
  .object({
    action: z.enum(['publish', 'unpublish', 'schedule', 'archive', 'restore']),
    scheduled_at: optionalDateTime,
    note: optionalString(300),
  })
  .refine((value) => value.action !== 'schedule' || Boolean(value.scheduled_at), {
    message: 'Choose the date and time the page should go live',
    path: ['scheduled_at'],
  });

/** Bulk publish / archive from the register. */
export const cmsPageBulkSchema = z.object({
  ids: z.array(z.coerce.number().int().positive()).min(1, 'Select at least one page').max(100),
  action: z.enum(['publish', 'unpublish', 'archive', 'restore']),
  note: optionalString(300),
});

/* ─────────────────────────────── sections ─────────────────────────────── */

export const cmsSectionCreateSchema = z
  .object({
    section_key: z
      .string()
      .trim()
      .max(100)
      .regex(/^[a-z0-9-]*$/, 'Use lowercase letters, numbers and hyphens only')
      .optional()
      .nullable(),
    section_type: z.enum(asTuple(CMS_SECTION_TYPES)),
    heading: optionalString(255),
    subheading: optionalString(500),
    content_html: optionalText(200000),
    content_json: z.union([z.string().max(200000), z.literal('')]).optional().nullable(),
    items: sectionItems,
    image_url: optionalString(1000),
    background_color: z
      .union([z.string().trim().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Use a hex colour such as #1e293b'), z.literal(''), z.null()])
      .optional()
      .transform((value) => (value === '' ? null : value ?? null)),
    sort_order: z.coerce.number().int().min(0).max(9999).optional(),
    status: z.enum(['active', 'inactive']).optional().default('active'),
  })
  .refine(
    (value) => {
      // A block with nothing in it would render as an empty hole in the page.
      const hasProse = Boolean(value.content_html?.trim()) || Boolean(value.heading?.trim()) || Boolean(value.subheading?.trim());
      const isList = LIST_SECTION_TYPES.includes(value.section_type);
      const hasItems = Array.isArray(value.items) && value.items.length > 0;
      if (isList) return hasItems || hasProse || Boolean(value.image_url);
      return hasProse || hasItems || Boolean(value.image_url) || value.section_type === 'contact_form';
    },
    { message: 'A section needs a heading, content or at least one item', path: ['heading'] }
  );

export const cmsSectionUpdateSchema = cmsSectionCreateSchema;

export const cmsSectionReorderSchema = z.object({
  order: z.array(z.coerce.number().int().positive()).min(1, 'Send the new order'),
});

/* ──────────────────────────────── media ───────────────────────────────── */

export const cmsMediaUpdateSchema = z.object({
  title: optionalString(255),
  alt_text: optionalString(500),
  caption: optionalString(500),
  folder: optionalString(255),
  tags: optionalString(500),
  media_type: z.enum(asTuple(CMS_MEDIA_TYPES)).optional(),
});

export const cmsMediaListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(24),
  search: z.string().trim().max(200).optional(),
  media_type: z.union([z.enum(asTuple(CMS_MEDIA_TYPES)), z.literal('all'), z.literal('')]).optional().default('all'),
  folder: z.string().trim().max(100).optional().default('all'),
  from_date: z.union([z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal('')]).optional().default(''),
  to_date: z.union([z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal('')]).optional().default(''),
  sortBy: z.string().trim().max(40).optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
});

/* ────────────────────────────── resources ─────────────────────────────── */

export const cmsResourceSchema = z.object({
  title: z.string().trim().min(3, 'Give the resource a title').max(255),
  slug: z
    .string()
    .trim()
    .max(255)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens only')
    .optional(),
  description: optionalText(5000),
  resource_type: z.enum(asTuple(RESOURCE_TYPES)).optional().default('Guide'),
  category: optionalString(100),
  act_id: optionalId,
  file_id: optionalId,
  external_url: z
    .union([z.string().trim().url('Enter a full URL such as https://…'), z.literal(''), z.null()])
    .optional()
    .transform((value) => (value === '' ? null : value ?? null)),
  thumbnail: optionalString(1000),
  requires_login: booleanish.optional().default(false),
  sort_order: z.coerce.number().int().min(0).max(9999).optional().default(0),
  status: z.enum(asTuple(RESOURCE_STATUSES)).optional().default('draft'),
});

export const cmsResourceListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(10),
  search: z.string().trim().max(200).optional(),
  status: z.union([z.enum(asTuple(RESOURCE_STATUSES)), z.literal('all'), z.literal('')]).optional().default('all'),
  resource_type: z.union([z.enum(asTuple(RESOURCE_TYPES)), z.literal('all'), z.literal('')]).optional().default('all'),
  requires_login: z.enum(['all', 'yes', 'no']).optional().default('all'),
  sortBy: z.string().trim().max(40).optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
});

/* ──────────────────────────── slug utilities ──────────────────────────── */

/** `Sections & Guidelines 2026` → `sections-guidelines-2026`. */
export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 200);
}

/** Appends `-2`, `-3`, … until the slug is not in `taken`. */
export function uniqueSlug(base: string, taken: Set<string>): string {
  const root = base || 'page';
  if (!taken.has(root)) return root;
  for (let suffix = 2; suffix < 500; suffix += 1) {
    const candidate = `${root}-${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${root}-${Date.now()}`;
}
