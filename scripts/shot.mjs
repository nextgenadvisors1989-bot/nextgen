// Usage: node scripts/shot.mjs <role> <path> <out.png> [clickText]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const BASE = process.env.AUDIT_BASE ?? 'http://127.0.0.1:3001';
const LOGINS = {
  admin: ['demo.admin@complianceos.local', 'Admin@2026'],
  auditor: ['karthik.auditor@demo.complianceos.local', 'Auditor@2026'],
};
const [role, path, out, clickText] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.AUDIT_CHROME || undefined });
const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const page = await context.newPage();
await page.goto(`${BASE}/login`);
const csrf = (await context.cookies()).find((c) => c.name === 'cos_csrf')?.value ?? '';
await context.request.post(`${BASE}/api/auth/login`, { data: { identifier: LOGINS[role][0], password: LOGINS[role][1] }, headers: { 'x-csrf-token': csrf } });
await page.goto(`${BASE}${path}`, { waitUntil: 'load', timeout: 90000 });
await page.waitForTimeout(1500);
if (clickText) { await page.getByText(clickText, { exact: false }).first().click(); await page.waitForTimeout(1500); }
await page.screenshot({ path: out });
await browser.close();
