// Browser check of the quotation header icon, Designation Master, employee wizard picker and Factory Profile, at phone and desktop widths.
//   NODE_PATH=<playwright node_modules> AUDIT_CHROME=<chrome.exe> node scripts/audit-new-pages.mjs
const { chromium } = require('playwright');
const fs = require('node:fs');

const BASE = 'http://127.0.0.1:3001';
const OUT = process.env.AUDIT_OUT || 'audit-shots';
fs.mkdirSync(OUT, { recursive: true });
let browser;
const boot = async () => { browser = await chromium.launch({ executablePath: process.env.AUDIT_CHROME, headless: true }); };
const results = [];
const note = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${ok ? '' : '  -> ' + detail}`); };

async function session(email, password, width, height) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(page.url().replace(BASE, '') + ' ' + m.text().slice(0, 160)); });
  page.on('response', (r) => { if (r.status() === 404) errors.push('404 ' + r.url().replace(BASE, '')); });
  page.on('pageerror', (e) => errors.push(page.url().replace(BASE, '') + ' ' + String(e).slice(0, 160)));
  await page.goto(`${BASE}/login`);
  const csrf = (await ctx.cookies()).find((c) => c.name === 'cos_csrf')?.value ?? '';
  const res = await ctx.request.post(`${BASE}/api/auth/login`, { data: { identifier: email, password }, headers: { 'x-csrf-token': csrf } });
  if (!res.ok()) throw new Error(`login failed ${res.status()} for ${email}`);
  return { ctx, page, errors };
}
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);

(async () => {
await boot();
for (const [label, w, h] of [['desktop', 1366, 800], ['phone', 390, 800]]) {
  console.log(`== ${label}`);
  const a = await session('demo.admin@complianceos.local', 'Admin@2026', w, h);
  const p = a.page;

  await p.goto(`${BASE}/admin/designations`, { waitUntil: 'networkidle' });
  note(`${label}: Designation Master lists rows`, (await p.locator('table tbody tr, [data-row]').count()) > 3 || (await p.getByText(/Welder|Operator|Manager/).count()) > 0);
  note(`${label}: Designation Master no horizontal overflow`, !(await overflow(p)));
  await p.screenshot({ path: `${OUT}/${label}-designations.png` });
  const add = p.getByRole('button', { name: /add designation|new designation|add/i }).first();
  await add.click();
  await p.waitForTimeout(500);
  note(`${label}: add-designation modal opens`, (await p.locator('[role=dialog]').count()) > 0);
  await p.screenshot({ path: `${OUT}/${label}-designation-modal.png` });
  await p.keyboard.press('Escape');

  await p.goto(`${BASE}/admin/employers/2/factory-profile`, { waitUntil: 'networkidle' });
  note(`${label}: admin factory profile renders`, (await p.getByText(/Factory/i).count()) > 0);
  note(`${label}: admin factory profile no overflow`, !(await overflow(p)));
  await p.screenshot({ path: `${OUT}/${label}-admin-factory.png`, fullPage: true });

  await p.goto(`${BASE}/admin/dashboard`, { waitUntil: 'networkidle' });
  const q = p.getByRole('button', { name: /quotation/i }).first();
  note(`${label}: quotation icon is in the header`, (await q.count()) > 0);
  if (await q.count()) {
    await q.click();
    await p.waitForTimeout(800);
    note(`${label}: quotation modal opens`, (await p.locator('[role=dialog]').count()) > 0);
    note(`${label}: quotation modal no overflow`, !(await overflow(p)));
    await p.screenshot({ path: `${OUT}/${label}-quote-modal.png` });
    await p.keyboard.press('Escape');
  }
  note(`${label}: admin pages had no console errors`, a.errors.length === 0, a.errors.join(' | '));
  await a.ctx.close();

  const e = await session('balaji.hr@demo.complianceos.local', 'Employer@2026', w, h);
  const ep = e.page;
  await ep.goto(`${BASE}/employer/factory-profile`, { waitUntil: 'networkidle' });
  note(`${label}: employer factory profile renders`, (await ep.getByText(/Factory/i).count()) > 0);
  await ep.getByRole('button', { name: /^edit/i }).first().click().catch(() => {});
  await ep.waitForTimeout(400);
  note(`${label}: employer factory profile no overflow`, !(await overflow(ep)));
  await ep.screenshot({ path: `${OUT}/${label}-employer-factory.png`, fullPage: true });
  await ep.goto(`${BASE}/employer/designations`, { waitUntil: 'networkidle' });
  note(`${label}: employer designations no overflow`, !(await overflow(ep)));
  await ep.goto(`${BASE}/employer/employees/create`, { waitUntil: 'networkidle' });
  note(`${label}: employee wizard shows the designation picker`, (await ep.getByText(/Designation/i).count()) > 0);
  note(`${label}: employee wizard no overflow`, !(await overflow(ep)));
  await ep.screenshot({ path: `${OUT}/${label}-employee-wizard.png` });
  note(`${label}: employer pages had no console errors`, e.errors.length === 0, e.errors.join(' | '));
  await e.ctx.close();

  // CAPAR: Act library, document pack, item form
  {
    const a2 = await session('demo.admin@complianceos.local', 'Admin@2026', w, h);
    const q = a2.page;
    await q.goto(`${BASE}/admin/compliance/acts/1`, { waitUntil: 'networkidle' });
    const tab = q.getByRole('tab', { name: /Chapters/i }).first();
    note(`${label}: act page has the Chapters & sections tab`, (await tab.count()) > 0 || (await q.getByText(/Chapters & sections/).count()) > 0);
    await q.getByText(/Chapters & sections/).first().click().catch(() => {});
    await q.waitForTimeout(600);
    note(`${label}: act library tab renders`, (await q.getByText(/Add chapter/).count()) > 0);
    note(`${label}: act library no overflow`, !(await overflow(q)));
    await q.screenshot({ path: `${OUT}/${label}-act-library.png` });
    await q.goto(`${BASE}/admin/audit-documents`, { waitUntil: 'networkidle' });
    note(`${label}: admin audit documents checklist`, (await q.getByText(/Recruitment/).count()) > 0);
    note(`${label}: admin audit documents no overflow`, !(await overflow(q)));
    await q.screenshot({ path: `${OUT}/${label}-admin-audit-documents.png` });
    await q.getByText('Auditor access').first().click().catch(() => {});
    await q.waitForTimeout(500);
    note(`${label}: auditor access tab`, (await q.getByText(/Choose which document sections/).count()) > 0);
    await q.goto(`${BASE}/admin/employers/2/audit-documents`, { waitUntil: 'networkidle' });
    note(`${label}: admin sees an employer's documents`, (await q.getByText(/Documents/).count()) > 0);
    note(`${label}: admin employer documents no overflow`, !(await overflow(q)));
    note(`${label}: admin CAPAR pages had no console errors`, a2.errors.filter((e) => !/favicon/.test(e)).length === 0, a2.errors.join(' | '));
    await a2.ctx.close();

    const e2 = await session('balaji.hr@demo.complianceos.local', 'Employer@2026', w, h);
    const r = e2.page;
    await r.goto(`${BASE}/employer/audit-documents`, { waitUntil: 'networkidle' });
    note(`${label}: employer audit documents render`, (await r.getByText(/Submit pack/).count()) > 0);
    await r.locator('main button[aria-expanded]').first().click().catch(() => {});
    await r.waitForTimeout(400);
    note(`${label}: employer audit documents no overflow`, !(await overflow(r)));
    await r.screenshot({ path: `${OUT}/${label}-employer-audit-documents.png`, fullPage: true });
    note(`${label}: employer document pages had no console errors`, e2.errors.filter((e) => !/favicon/.test(e)).length === 0, e2.errors.join(' | '));
    await e2.ctx.close();

    const u = await session('priya.auditor@demo.complianceos.local', 'Auditor@2026', w, h);
    const t = u.page;
    await t.goto(`${BASE}/auditor/audit-documents`, { waitUntil: 'networkidle' });
    note(`${label}: auditor sees employer packs`, (await t.getByText(/Download pack/).count()) > 0 || (await t.getByText(/Not submitted yet/).count()) > 0);
    note(`${label}: auditor packs no overflow`, !(await overflow(t)));
    await t.screenshot({ path: `${OUT}/${label}-auditor-packs.png` });
    note(`${label}: auditor pages had no console errors`, u.errors.filter((e) => !/favicon/.test(e)).length === 0, u.errors.join(' | '));
    await u.ctx.close();
  }
}
await browser.close();
const bad = results.filter((r) => !r).length;
console.log(`\n${results.length - bad} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
})();
