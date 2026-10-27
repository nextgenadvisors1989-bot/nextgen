/**
 * Responsive audit: signs in as each demo role, opens every sidebar destination at phone,
 * tablet and laptop widths and reports pages whose layout spills sideways.
 *
 *   NODE_PATH=<dir containing playwright> node scripts/responsive-audit.mjs [panel ...]
 *   env: AUDIT_BASE (default http://localhost:3001), AUDIT_SHOTS=1 to save screenshots of offenders,
 *        AUDIT_PATHS=/a,/b to check only those pages
 *
 * "Spills" means the page itself scrolls horizontally, or an element pokes past the viewport edge
 * without sitting inside its own horizontally-scrollable wrapper (tables legitimately scroll).
 */
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE = process.env.AUDIT_BASE ?? 'http://localhost:3001';
const OUT = resolve('scripts/.audit');
mkdirSync(OUT, { recursive: true });

const LOGINS = {
  admin: ['demo.admin@complianceos.local', 'Admin@2026'],
  employer: ['balaji.hr@demo.complianceos.local', 'Employer@2026'],
  auditor: ['priya.auditor@demo.complianceos.local', 'Auditor@2026'],
  verifier: ['verifier.test@complianceos.local', 'Verifier@2026'],
  employee: ['employee.test@complianceos.local', 'Employee@2026'],
};
const VIEWPORTS = [
  { name: 'phone', width: 375, height: 800 },
  { name: 'tablet', width: 820, height: 1000 },
  { name: 'laptop', width: 1366, height: 800 },
];
const EXTRA = {
  admin: ['/admin/employees/create', '/admin/employers/create', '/admin/auditors/create', '/admin/audit-assignments/create', '/admin/audit-reports/create'],
  employer: ['/employer/employees/create'],
  auditor: [], verifier: [], employee: [],
};

const menuText = readFileSync('components/navigation/sidebar-menus.tsx', 'utf8');
const ONLY = (process.env.AUDIT_PATHS ?? '').split(',').filter(Boolean);
const pathsFor = (panel) => ONLY.length ? ONLY.filter((p) => p.startsWith(`/${panel}`)) : [...new Set([...menuText.matchAll(/href: '(\/[^']*)'/g)].map((m) => m[1]).filter((p) => p.startsWith(`/${panel}`)))].concat(EXTRA[panel] ?? []);

const probe = () => {
  const vw = document.documentElement.clientWidth;
  const doc = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
  const inScroller = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const o = getComputedStyle(p).overflowX;
      if (o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip') {
        if (p.scrollWidth > p.clientWidth || o !== 'visible') return true;
      }
    }
    return false;
  };
  const offenders = [];
  for (const el of document.body.querySelectorAll('*')) {
    const style = getComputedStyle(el);
    if (style.position === 'fixed' || style.display === 'none' || style.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.right > vw + 1 && !inScroller(el)) {
      offenders.push({ tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 80), right: Math.round(r.right), text: (el.textContent || '').trim().slice(0, 40) });
      if (offenders.length >= 4) break;
    }
  }
  const clipped = [];
  for (const el of document.querySelectorAll('button, a, label, th, h1, h2, h3')) {
    if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflowX === 'hidden' && getComputedStyle(el).textOverflow !== 'ellipsis') {
      clipped.push((el.textContent || '').trim().slice(0, 40));
      if (clipped.length >= 3) break;
    }
  }
  return { vw, doc, overflow: doc - vw, offenders, clipped, errorOverlay: /Application error|__next_error__|Internal Server Error/.test(document.body.innerText + document.documentElement.innerHTML.slice(0, 3000)) };
};

const panels = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(LOGINS);
// AUDIT_CHROME points at any Chromium/Chrome binary when the one Playwright expects is not installed.
const browser = await chromium.launch({ executablePath: process.env.AUDIT_CHROME || undefined });
const findings = [];
let visited = 0;

for (const panel of panels) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 800 } });
  const page = await context.newPage();
  let jsErrors = [];
  page.on('pageerror', (error) => jsErrors.push(String(error.message ?? error).slice(0, 160)));
  await page.goto(`${BASE}/login`);
  const csrf = (await context.cookies()).find((c) => c.name === 'cos_csrf')?.value ?? '';
  const login = await context.request.post(`${BASE}/api/auth/login`, {
    data: { identifier: LOGINS[panel][0], password: LOGINS[panel][1] }, headers: { 'x-csrf-token': csrf },
  });
  if (!login.ok()) { console.log(`${panel}: login failed ${login.status()}`); findings.push({ panel, path: '*', problem: `login ${login.status()}` }); continue; }

  for (const path of pathsFor(panel)) {
    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      try {
        jsErrors = [];
        const response = await page.goto(`${BASE}${path}`, { waitUntil: 'load', timeout: 90000 });
        await page.waitForTimeout(vp === VIEWPORTS[0] ? 700 : 350);
        const result = await page.evaluate(probe);
        visited += 1;
        result.jsErrors = [...jsErrors];
        const bad = jsErrors.length > 0 || result.overflow > 1 || result.offenders.length > 0 || result.clipped.length > 0 || result.errorOverlay || (response && response.status() >= 400);
        if (bad) {
          const entry = { panel, path, viewport: vp.name, status: response?.status(), ...result };
          findings.push(entry);
          console.log(`✗ ${panel} ${path} @${vp.name}: overflow=${result.overflow} offenders=${JSON.stringify(result.offenders[0] ?? null)} clipped=${JSON.stringify(result.clipped)} err=${result.errorOverlay} js=${JSON.stringify(jsErrors)} http=${response?.status()}`);
          if (process.env.AUDIT_SHOTS) await page.screenshot({ path: `${OUT}/${panel}${path.replace(/\//g, '_')}-${vp.name}.png`, fullPage: false });
        }
      } catch (error) {
        findings.push({ panel, path, viewport: vp.name, problem: String(error).slice(0, 160) });
        console.log(`! ${panel} ${path} @${vp.name}: ${String(error).slice(0, 120)}`);
      }
    }
  }
  await context.close();
}
await browser.close();
writeFileSync(`${OUT}/findings.json`, JSON.stringify(findings, null, 2));
console.log(`\n${visited} page-views checked, ${findings.length} with problems. Details: scripts/.audit/findings.json`);
