// Open lingxing in the debug Chrome's tab + bring window to front, so the
// user knows which Chrome window to use for the recon.

import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('http://localhost:9222');
const context = browser.contexts()[0];
const pages = context.pages();
const page = pages[0] || (await context.newPage());

const url = process.argv[2] || 'https://www.lingxing.com';
console.log('[nav] opening', url, 'in debug Chrome');
await page.bringToFront();
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch((e) => {
  console.warn('[nav] goto error (page may still load):', e.message);
});
await page.waitForTimeout(1500);
console.log('[nav] current URL after nav:', page.url());
console.log('[nav] title:', await page.title().catch(() => '?'));
console.log('[nav] done. Switch to that Chrome window and log in.');
process.exit(0);
