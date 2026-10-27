/**
 * Seeds the public home page into the CMS: a published "Home" landing page (flagged homepage) with one section per
 * block, plus the contact / social details in Company Settings. Safe to re-run: sections are matched by key and a
 * setting that already has a value is left alone. Source of truth for the defaults: lib/public/home-defaults.json.
 *
 *   node scripts/seed-home.mjs
 */
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';

for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/)) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
}
const defaults = JSON.parse(readFileSync(new URL('../lib/public/home-defaults.json', import.meta.url), 'utf8'));

const db = await mysql.createConnection({
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
});

// 1. settings (company group) - only fill the blanks
const labels = { company_timing: 'Working hours', company_tagline: 'Tagline', social_facebook: 'Facebook page', social_linkedin: 'LinkedIn page', social_twitter: 'X / Twitter profile', social_instagram: 'Instagram profile' };
for (const [key, value] of Object.entries(defaults.settings)) {
  const [[row]] = await db.query("SELECT setting_value FROM settings WHERE setting_group = 'company' AND setting_key = ?", [key]);
  const isPublic = key !== 'company_pan' ? 1 : 0;
  if (!row) {
    await db.query(
      `INSERT INTO settings (setting_group, setting_key, setting_value, value_type, label, is_public, is_encrypted)
       VALUES ('company', ?, ?, 'string', ?, ?, 0)`,
      [key, value, labels[key] ?? key.replace(/_/g, ' '), isPublic]
    );
  } else if (!String(row.setting_value ?? '').trim()) {
    await db.query("UPDATE settings SET setting_value = ?, is_public = 1 WHERE setting_group = 'company' AND setting_key = ?", [value, key]);
  }
}

// 2. the Home page
let [[home]] = await db.query("SELECT id FROM cms_pages WHERE is_homepage = 1 AND deleted_at IS NULL LIMIT 1");
if (!home) {
  const [[existing]] = await db.query("SELECT id FROM cms_pages WHERE slug = 'home' LIMIT 1");
  if (existing) {
    await db.query("UPDATE cms_pages SET is_homepage = 1, status = 'published', deleted_at = NULL, page_type = 'landing' WHERE id = ?", [existing.id]);
    home = existing;
  } else {
    const [result] = await db.query(
      `INSERT INTO cms_pages (uuid, slug, title, subtitle, meta_title, page_type, template, status, is_homepage, published_at, show_in_menu, menu_label, sort_order)
       VALUES (?, 'home', 'Home', 'The public home page - edit each block below', 'One Legal Culture - Compliance | Safety | Sustainability', 'landing', 'default', 'published', 1, NOW(), 0, 'Home', 0)`,
      [randomUUID()]
    );
    home = { id: result.insertId };
  }
}

let order = 0;
for (const section of defaults.sections) {
  order += 10;
  const [[have]] = await db.query('SELECT id FROM cms_page_sections WHERE page_id = ? AND section_key = ? AND deleted_at IS NULL LIMIT 1', [home.id, section.key]);
  if (have) continue;
  await db.query(
    `INSERT INTO cms_page_sections (page_id, section_key, section_type, heading, subheading, content_html, content_json, sort_order, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
    [home.id, section.key, section.type, section.heading ?? null, section.subheading ?? null, section.content_html ?? null,
      section.items ? JSON.stringify({ items: section.items }) : null, order]
  );
}
console.log(`Home page ready (cms_pages.id = ${home.id}), ${defaults.sections.length} blocks.`);
await db.end();
