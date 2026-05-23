// Open a new tab in the debug Chrome pointing at localhost dev server.
import { chromium } from 'playwright';

const url = process.argv[2] || 'http://localhost:5173';
const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
await page.bringToFront();
await page.waitForTimeout(1500);
console.log('opened:', page.url());
console.log('title:', await page.title());
process.exit(0);
