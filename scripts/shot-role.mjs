// Usage: node scripts/shot-role.mjs <role> <path> <out.png> [width] [fullpage=1] [clickText]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const BASE = process.env.AUDIT_BASE ?? 'http://127.0.0.1:3001';
const LOGINS = {
  admin: ['demo.admin@complianceos.local', 'Admin@2026'],
  auditor: ['priya.auditor@demo.complianceos.local', 'Auditor@2026'],
  employee: ['employee.test@complianceos.local', 'Employee@2026'],
  env: ['auditor.test@complianceos.local', 'Auditor@2026'],
  auditor2: ['karthik.auditor@demo.complianceos.local', 'Auditor@2026'],
  verifier: ['verifier.test@complianceos.local', 'Verifier@2026'],
  employer: ['balaji.hr@demo.complianceos.local', 'Employer@2026'],
};
const [role, path, out, width = '1366', full = '0', clickText = ''] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.AUDIT_CHROME || undefined });
const context = await browser.newContext({ viewport: { width: Number(width), height: 900 } });
const page = await context.newPage();
await page.goto(`${BASE}/login`);
const csrf = (await context.cookies()).find((c) => c.name === 'cos_csrf')?.value ?? '';
await context.request.post(`${BASE}/api/auth/login`, { data: { identifier: LOGINS[role][0], password: LOGINS[role][1] }, headers: { 'x-csrf-token': csrf } });
await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 120000 });
await page.waitForFunction(() => !/Opening the report|Loading/.test(document.body.innerText), null, { timeout: 60000 }).catch(() => {});
await page.waitForTimeout(1200);
if (clickText) {
  const tab = page.getByRole('tab', { name: clickText });
  if (await tab.count()) await tab.first().click(); else await page.getByText(clickText, { exact: false }).first().click();
  await page.waitForTimeout(1500);
}
await page.screenshot({ path: out, fullPage: full === '1' });
await browser.close();
