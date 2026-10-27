/**
 * What the public website's chrome and home page are made of.
 *
 * Contact details, working hours and social links come from Company Settings; every block of the home page comes
 * from the published CMS page flagged "homepage" (one section per block, matched by its section key). Anything the
 * editor has not provided falls back to the bundled defaults, so the site never renders empty.
 */
import { query, type RowDataPacket } from '@/lib/db/mysql';
import defaults from '@/lib/public/home-defaults.json';

export interface SiteItem {
  title?: string | null;
  subtitle?: string | null;
  text?: string | null;
  value?: string | null;
  label?: string | null;
  icon?: string | null;
  link?: string | null;
  linkLabel?: string | null;
}

export interface SiteBlock {
  key: string;
  heading: string;
  subheading: string;
  html: string;
  items: SiteItem[];
}

export interface SiteInfo {
  name: string;
  phone: string;
  email: string;
  timing: string;
  address: string;
  website: string;
  tagline: string;
  social: { facebook: string; linkedin: string; twitter: string; instagram: string; youtube: string };
}

const SETTING_KEYS = Object.keys(defaults.settings) as (keyof typeof defaults.settings)[];
const EXTRA_KEYS = ['social_youtube'];

export async function getSiteInfo(): Promise<SiteInfo> {
  const keys = [...SETTING_KEYS, ...EXTRA_KEYS];
  const rows = await query<RowDataPacket>(
    `SELECT setting_key, setting_value FROM settings WHERE setting_group = 'company' AND setting_key IN (${keys.map(() => '?').join(', ')})`,
    keys
  ).catch(() => [] as RowDataPacket[]);
  const stored = Object.fromEntries(rows.map((row) => [String(row.setting_key), String(row.setting_value ?? '').trim()]));
  const pick = (key: string) => {
    // A saved-but-blank social link means "hide it"; every other blank falls back to the default.
    if (key.startsWith('social_')) return key in stored ? stored[key] : ((defaults.settings as Record<string, string>)[key] ?? '');
    return stored[key] || (defaults.settings as Record<string, string>)[key] || '';
  };
  return {
    name: pick('company_name'),
    phone: pick('company_phone'),
    email: pick('company_email'),
    timing: pick('company_timing'),
    address: pick('company_address'),
    website: pick('company_website'),
    tagline: pick('company_tagline'),
    social: {
      facebook: pick('social_facebook'),
      linkedin: pick('social_linkedin'),
      twitter: pick('social_twitter'),
      instagram: pick('social_instagram'),
      youtube: pick('social_youtube'),
    },
  };
}

function parseItems(raw: unknown): SiteItem[] {
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (Array.isArray(parsed)) return parsed as SiteItem[];
  if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { items?: unknown[] }).items)) {
    return (parsed as { items: SiteItem[] }).items;
  }
  return [];
}

/** Every home-page block, keyed by section key, with the editor's content laid over the defaults. */
export async function getHomeBlocks(): Promise<Record<string, SiteBlock>> {
  const blocks: Record<string, SiteBlock> = {};
  for (const section of defaults.sections as unknown as (Partial<SiteBlock> & { key: string; content_html?: string; items?: SiteItem[] })[]) {
    blocks[section.key] = {
      key: section.key,
      heading: section.heading ?? '',
      subheading: section.subheading ?? '',
      html: section.content_html ?? '',
      items: section.items ?? [],
    };
  }

  const rows = await query<RowDataPacket>(
    `SELECT s.section_key, s.heading, s.subheading, s.content_html, s.content_json
       FROM cms_page_sections s
       JOIN cms_pages p ON p.id = s.page_id
      WHERE p.is_homepage = 1 AND p.status = 'published' AND p.deleted_at IS NULL
        AND s.status = 'active' AND s.deleted_at IS NULL AND s.section_key IS NOT NULL
      ORDER BY s.sort_order, s.id`
  ).catch(() => [] as RowDataPacket[]);

  for (const row of rows) {
    const key = String(row.section_key);
    const base = blocks[key];
    if (!base) continue;
    const items = parseItems(row.content_json);
    blocks[key] = {
      key,
      heading: String(row.heading ?? '').trim() || base.heading,
      subheading: String(row.subheading ?? '').trim() || base.subheading,
      html: String(row.content_html ?? '').trim() || base.html,
      items: items.length ? items : base.items,
    };
  }
  return blocks;
}
