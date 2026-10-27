// Clicks through the admin sidebar in a real browser and times each page transition: node scripts/time-navigation.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const BASE = process.env.AUDIT_BASE ?? 'http://127.0.0.1:3001';
const browser = await chromium.launch({ executablePath: process.env.AUDIT_CHROME });
const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const page = await context.newPage();
await page.goto(`${BASE}/login`);
const csrf = (await context.cookies()).find((c) => c.name === 'cos_csrf')?.value ?? '';
await context.request.post(`${BASE}/api/auth/login`, { data: { identifier: 'demo.admin@complianceos.local', password: 'Admin@2026' }, headers: { 'x-csrf-token': csrf } });
let t = Date.now();
await page.goto(`${BASE}/admin/dashboard`, { waitUntil: 'load' });
console.log(`full load  /admin/dashboard   ${Date.now() - t} ms`);
for (const [label, href] of [['Dashboard', '/admin/dashboard'], ['Employers', null], ['Files', '/admin/files'], ['Reports', '/admin/reports'], ['Dashboard', '/admin/dashboard']]) {
  const link = href ? page.locator(`aside a[href="${href}"]`).first() : page.locator('aside button:has-text("Employers")').first();
  if (!href) { await link.click(); await page.waitForTimeout(300); const sub = page.locator('aside a[href="/admin/employers"]').first(); t = Date.now(); await sub.click(); await page.waitForURL('**/admin/employers'); }
  else { t = Date.now(); await link.click(); await page.waitForURL(`**${href}`); }
  await page.waitForLoadState('networkidle').catch(() => {});
  console.log(`click      ${label.padEnd(12)} ${Date.now() - t} ms`);
}
await browser.close();
