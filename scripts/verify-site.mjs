/**
 * Browser check of the public menu pages, the three tools and the header at four widths.
 *
 *   node scripts/verify-site.mjs      (server on http://127.0.0.1:3001; AUDIT_CHROME and NODE_PATH as for the other Playwright scripts)
 *
 * Checks: every menu page answers 200 with one h1 and no console errors, the header never scrolls sideways, each desktop and drawer menu link
 * leads to a real page, the calculators recalculate, and the quotation request reaches the Contact Enquiries inbox (the test row is removed).
 * Exit code 1 when anything fails.
 */
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const BASE = process.env.AUDIT_BASE ?? 'http://127.0.0.1:3001';
const MYSQL = 'C:/xampp/mysql/bin/mysql.exe';

const pass = [], fail = [];
const check = (name, ok, detail = '') => { (ok ? pass : fail).push(name); console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${ok ? '' : `  -> ${detail}`}`); };
const sql = (statement) => execFileSync(MYSQL, ['-uroot', 'compliance_platform', '-N', '-e', statement], { encoding: 'utf8' }).trim();

const MENU_PAGES = ['/payroll-compliance-ir', '/social-security-compliance', '/health-safety-compliance', '/environmental-compliance', '/service-global-certification', '/training-capacity-building', '/audit-structure',
  '/calculators', '/quotation', '/bill-generation', '/compliance-calendar-guide', '/acts-compliance', '/resources', '/reports', '/services', '/about', '/contact', '/'];

const browser = await chromium.launch({ executablePath: process.env.AUDIT_CHROME || undefined });

console.log('== pages');
const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
for (const path of MENU_PAGES) {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  const response = await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 90000 });
  const h1 = await page.locator('h1').count();
  check(`${path} answers 200 with a heading`, response.status() === 200 && h1 >= 1, `${response.status()} h1=${h1}`);
  check(`${path} has no console errors`, errors.length === 0, errors.join(' | ').slice(0, 200));
  await page.close();
}
const missing = await context.newPage();
check('an unknown page is a 404', (await missing.goto(`${BASE}/not-a-real-page`)).status() === 404);
await missing.close();

console.log('== header at four widths');
for (const width of [390, 768, 1280, 1366, 1440, 1920]) {
  const page = await (await browser.newContext({ viewport: { width, height: 900 } })).newPage();
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const headerOverflow = await page.evaluate(() => { const h = document.querySelector('header'); return h ? h.scrollWidth - h.clientWidth : 0; });
  check(`${width}px: page does not scroll sideways`, overflow <= 1, `${overflow}px`);
  check(`${width}px: header does not overflow`, headerOverflow <= 1, `${headerOverflow}px`);
  if (width >= 1280) {
    const nav = page.locator('header nav').first();
    const box = await nav.boundingBox();
    const items = await nav.locator('> *').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().right));
    check(`${width}px: the menu fits before the login button`, !!box && Math.max(...items) <= box.x + box.width + 1, `nav right ${box && box.x + box.width}, last ${Math.max(...items)}`);
    await nav.getByText('COMPLIANCE', { exact: true }).first().hover();
    const mega = page.getByText('Social Security', { exact: true }).first();
    check(`${width}px: the Compliance menu opens with the four areas`, await mega.isVisible().catch(() => false));
    for (const label of ['Payroll, Compliance & IR', 'Health & Safety', 'Environmental']) {
      check(`${width}px: Compliance menu lists ${label}`, await page.getByText(label, { exact: true }).first().isVisible().catch(() => false));
    }
    const icons = await page.locator('header').first().evaluate(() => 0).catch(() => 0);
    const socialVisible = await page.locator('a[aria-label="facebook"]').first().isVisible().catch(() => false);
    check(`${width}px: the social icons are visible in the top bar`, socialVisible);
    const bar = await page.locator('nav[aria-label="Tools"] a').allInnerTexts();
    check(`${width}px: the three tools are in the top bar`, width < 1024 || (bar.length === 3 && bar[0].includes('Calculation') && bar[1].includes('Quotation') && bar[2].includes('Bill')), JSON.stringify(bar));
  }
  await page.context().close();
}

console.log('== every menu link goes somewhere real');
{
  const page = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  const hrefs = [...new Set(await page.locator('header a[href^="/"], footer a[href^="/"], nav[aria-label="Tools"] a').evaluateAll((els) => els.map((e) => e.getAttribute('href'))))].filter((h) => !h.startsWith('/login'));
  for (const href of hrefs) {
    const status = (await page.request.get(`${BASE}${href}`)).status();
    check(`link ${href} is not dead`, status === 200, String(status));
  }
}

console.log('== drawer (phone)');
{
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Open navigation menu' }).click();
  const order = await page.locator('div:has(> a[href="/payroll-compliance-ir"])').first().locator('a').allInnerTexts().catch(() => []);
  const text = await page.locator('body').innerText();
  const wanted = ['HOME', 'ABOUT US', 'PAYROLL, COMPLIANCE & IR MANAGEMENT', 'SOCIAL SECURITY COMPLIANCE MANAGEMENT', 'HEALTH & SAFETY COMPLIANCE MANAGEMENT', 'ENVIRONMENTAL COMPLIANCE MANAGEMENT', 'ACTS & COMPLIANCE', 'AUDIT STRUCTURE', 'SERVICE & GLOBAL CERTIFICATION', 'RESOURCES', 'REPORTS', 'TRAINING & CAPACITY BUILDING', 'CONTACT US'];
  let last = -1, inOrder = true;
  for (const item of wanted) { const at = text.indexOf(item); if (at < 0 || at < last) inOrder = false; last = at; }
  check('the drawer lists the client\'s menu in the client\'s order', inOrder);
  for (const label of ['Safety & Environmental Calculation', 'Quotation Generation', 'Bill Generation']) check(`the drawer has the ${label} tool`, text.includes(label));
  check('the drawer does not scroll sideways', await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 1);
}

console.log('== calculators');
{
  const page = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
  await page.goto(`${BASE}/calculators`, { waitUntil: 'networkidle' });
  const body = () => page.locator('main, body').first().innerText();
  check('frequency rate for the sample is 8.33', (await body()).includes('8.33'));
  await page.getByLabel('Lost-time injuries').fill('6');
  check('changing the injuries recalculates the frequency rate (16.67)', (await body()).includes('16.67'));
  await page.getByRole('button', { name: 'Gratuity', exact: true }).click();
  check('gratuity for 30,000 over 10 years is 1,73,077', (await body()).includes('1,73,077'));
  await page.getByRole('button', { name: 'ESI', exact: true }).click();
  await page.getByLabel('Monthly gross wages').fill('25000');
  check('ESI above the ceiling says it is not covered', (await body()).includes('outside ESI coverage'));
  await page.goto(`${BASE}/calculators?tool=emissions`, { waitUntil: 'networkidle' });
  check('?tool= opens that calculator', (await body()).includes('Emissions from energy'));
  await page.goto(`${BASE}/calculators?tool=nonsense`, { waitUntil: 'networkidle' });
  check('an unknown ?tool= falls back to the first calculator', (await body()).includes('Frequency, severity and incidence rate'));
}

console.log('== quotation request');
{
  sql("DELETE FROM contact_enquiries WHERE company_name = 'ZZ TEST QUOTE CO'");
  const page = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
  await page.goto(`${BASE}/quotation`, { waitUntil: 'networkidle' });
  check('the service catalogue is listed', (await page.locator('input[type=checkbox]').count()) >= 10);
  check('no fee is shown on the public page', !/\u20B9\s?\d|Rs\.?\s?\d/.test(await page.locator('main, body').first().innerText()));
  await page.getByLabel('Company / factory name *').fill('ZZ TEST QUOTE CO');
  await page.getByLabel('Contact person *').fill('Test Person');
  await page.getByLabel('Email *').fill('zz.test@example.com');
  await page.getByLabel('Phone *').fill('+91 98765 43210');
  await page.getByRole('button', { name: /Request quotation/ }).click();
  check('submitting with no service chosen is refused', await page.getByText('Choose at least one service').isVisible());
  await page.locator('input[type=checkbox]').nth(0).check();
  await page.locator('input[type=checkbox]').nth(3).check();
  await page.getByRole('button', { name: /Request quotation \(2 selected\)/ }).click();
  await page.getByText('Request received').waitFor({ timeout: 20000 }).catch(() => {});
  check('the request is accepted', await page.getByText('Request received').isVisible());
  const stored = sql("SELECT subject FROM contact_enquiries WHERE company_name = 'ZZ TEST QUOTE CO' ORDER BY id DESC LIMIT 1");
  check('it lands in the Contact Enquiries inbox with the services listed', stored.startsWith('Quotation request - 2 services'), stored);
  const message = sql("SELECT message FROM contact_enquiries WHERE company_name = 'ZZ TEST QUOTE CO' ORDER BY id DESC LIMIT 1");
  check('the message names the chosen services', message.includes('1.') && message.includes('2.'), message.slice(0, 120));
  sql("DELETE FROM contact_enquiries WHERE company_name = 'ZZ TEST QUOTE CO'");
}

console.log('== public API');
{
  const response = await fetch(`${BASE}/api/public/billing-services`);
  const body = await response.json();
  check('the services endpoint answers without a login', response.status === 200 && Array.isArray(body.data) && body.data.length >= 10);
  check('it never returns a fee', body.data.every((row) => !('default_fee' in row) && !('fee' in row)));
}

await browser.close();
console.log(`\n${pass.length} passed, ${fail.length} failed`);
process.exit(fail.length ? 1 : 0);
