// Navigate the first http(s) tab in debug Chrome to a given URL, regardless of current state.
import { chromium } from 'playwright';

const target = process.argv[2];
if (!target) { console.error('usage: node nav-any.mjs <url>'); process.exit(1); }

const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const pages = ctx.pages();
const page = pages.find((p) => p.url().startsWith('http')) || pages[0];
if (!page) { console.error('no tabs'); process.exit(2); }
console.log('[nav-any] before:', page.url());
await page.bringToFront();
await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(2000);
console.log('[nav-any] after:', page.url());
process.exit(0);
