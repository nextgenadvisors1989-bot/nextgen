/**
 * Alignment audit: signs in as each demo role, opens every sidebar destination at laptop and tablet widths and
 * reports the table / chip misalignments that responsive-audit.mjs does not see:
 *   - header cells of one table drawn in different sizes, weights or colours
 *   - a "#" (serial) column stretched wider than a serial number needs
 *   - a table wider than the box that holds it (a horizontal scrollbar on a laptop)
 *   - pill badges / chips that wrap their text onto two lines
 *
 *   NODE_PATH=<dir containing playwright> AUDIT_CHROME=<chrome.exe> node scripts/alignment-audit.mjs [panel ...]
 *   env: AUDIT_BASE (default http://127.0.0.1:3001), AUDIT_WIDTHS=1366,820
 */
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE = process.env.AUDIT_BASE ?? 'http://127.0.0.1:3001';
const WIDTHS = (process.env.AUDIT_WIDTHS ?? '1366,820').split(',').map(Number);
const OUT = resolve('scripts/.audit');
mkdirSync(OUT, { recursive: true });

const LOGINS = {
  admin: ['demo.admin@complianceos.local', 'Admin@2026'],
  employer: ['balaji.hr@demo.complianceos.local', 'Employer@2026'],
  auditor: ['priya.auditor@demo.complianceos.local', 'Auditor@2026'],
  verifier: ['verifier.test@complianceos.local', 'Verifier@2026'],
  employee: ['employee.test@complianceos.local', 'Employee@2026'],
};

const menuText = readFileSync('components/navigation/sidebar-menus.tsx', 'utf8');
const ONLY = (process.env.AUDIT_PATHS ?? '').split(',').filter(Boolean);
const pathsFor = (panel) => ONLY.length ? ONLY.filter((p) => p.startsWith(`/${panel}`)) : [...new Set([...menuText.matchAll(/href: '(\/[^']*)'/g)].map((m) => m[1]).filter((p) => p.startsWith(`/${panel}`)))];

const probe = () => {
  const problems = [];
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden';
  };

  for (const table of document.querySelectorAll('table')) {
    if (!visible(table)) continue;
    const label = (table.closest('[class*="card"]')?.querySelector('h2,h3')?.textContent || '').trim().slice(0, 30);
    const ths = [...table.querySelectorAll('thead th')].filter(visible);

    // 1. one table, one header style
    const styles = new Map();
    for (const th of ths) {
      const s = getComputedStyle(th);
      const key = `${s.fontSize}/${s.fontWeight}/${s.color}`;
      styles.set(key, [...(styles.get(key) ?? []), (th.textContent || '').trim().slice(0, 16)]);
    }
    if (styles.size > 1) problems.push(`header styles differ [${label}]: ${[...styles].map(([k, v]) => `${k} -> ${v.join(',')}`).join(' | ')}`);

    // 2. a stretched serial column
    const first = ths[0];
    if (first && (first.textContent || '').trim() === '#') {
      const w = Math.round(first.getBoundingClientRect().width);
      if (w > 90) problems.push(`serial "#" column is ${w}px wide [${label}]`);
    }

    // 3. the table spilling out of its container
    const box = table.parentElement;
    if (box && table.offsetWidth > box.clientWidth + 2) problems.push(`table ${table.offsetWidth}px in a ${box.clientWidth}px box [${label}]`);
  }

  // 4. pill badges / chips that wrap
  let wrapped = 0;
  const wrappedText = [];
  for (const el of document.querySelectorAll('span.rounded-full, a.rounded-full, div.rounded-full')) {
    if (!visible(el)) continue;
    const text = (el.textContent || '').trim();
    if (text.length < 2 || el.children.length > 2) continue;
    if (/(^|\s)(h|w|size)-\d/.test(String(el.className))) continue; // fixed-size avatar / icon circles
    const lh = parseFloat(getComputedStyle(el).lineHeight) || 16;
    const pad = parseFloat(getComputedStyle(el).paddingTop) + parseFloat(getComputedStyle(el).paddingBottom);
    if (el.getBoundingClientRect().height > lh * 1.6 + pad && el.getBoundingClientRect().width < 160) {
      wrapped += 1;
      if (wrappedText.length < 3) wrappedText.push(text.slice(0, 20));
    }
  }
  if (wrapped) problems.push(`${wrapped} chip(s) wrap onto two lines: ${wrappedText.join(', ')}`);
  return problems;
};

const panels = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(LOGINS);
const browser = await chromium.launch({ executablePath: process.env.AUDIT_CHROME || undefined });
const findings = [];
let visited = 0;

for (const panel of panels) {
  const context = await browser.newContext({ viewport: { width: WIDTHS[0], height: 800 } });
  const page = await context.newPage();
  await page.goto(`${BASE}/login`);
  const csrf = (await context.cookies()).find((c) => c.name === 'cos_csrf')?.value ?? '';
  const login = await context.request.post(`${BASE}/api/auth/login`, {
    data: { identifier: LOGINS[panel][0], password: LOGINS[panel][1] }, headers: { 'x-csrf-token': csrf },
  });
  if (!login.ok()) { console.log(`${panel}: login failed ${login.status()}`); continue; }

  for (const path of pathsFor(panel)) {
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 800 });
      try {
        await page.goto(`${BASE}${path}`, { waitUntil: 'load', timeout: 120000 });
        await page.waitForTimeout(2200);
        const problems = await page.evaluate(probe);
        visited += 1;
        if (problems.length) {
          findings.push({ panel, path, width, problems });
          console.log(`x ${panel} ${path} @${width}\n    ${problems.join('\n    ')}`);
        }
      } catch (error) {
        console.log(`! ${panel} ${path} @${width}: ${String(error).slice(0, 100)}`);
      }
    }
  }
  await context.close();
}
await browser.close();
writeFileSync(`${OUT}/alignment.json`, JSON.stringify(findings, null, 2));
console.log(`\n${visited} page views checked, ${findings.length} with alignment problems.`);
