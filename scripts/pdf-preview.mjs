// Renders one page of a PDF to a PNG through Chrome's built-in viewer (no extra tools needed).
// Usage: node scripts/pdf-preview.mjs <file.pdf> <out.png> [page=1]
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const [pdf, out, page = '1'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.AUDIT_CHROME, headless: false, args: ['--headless=new', '--window-size=1000,1300'] });
const context = await browser.newContext({ viewport: { width: 1000, height: 1300 } });
const p = await context.newPage();
await p.goto(`${pathToFileURL(resolve(pdf)).href}#page=${page}&zoom=page-fit&toolbar=0&navpanes=0`);
await p.waitForTimeout(3500);
await p.screenshot({ path: out });
await browser.close();
