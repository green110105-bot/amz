// Test mobile responsive: emulate 414x896 (iPhone), open drawer, verify bottom-up.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, 'output/mobile-test');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes('localhost:5173'));
if (!page) process.exit(1);

// Emulate mobile viewport
await page.setViewportSize({ width: 414, height: 896 });
await page.waitForTimeout(800);

await page.goto('http://localhost:5173/#/ads/lx/campaigns/cmp-001?g=targeting', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.screenshot({ path: join(OUT, '01-mobile-page.png'), fullPage: false });

const r = await page.evaluate(() => {
  const link = document.querySelector('.el-table__body tbody tr a.link');
  if (link) { link.click(); return link.textContent.trim(); }
  return null;
});
console.log('clicked row:', r);
await page.waitForTimeout(2500);
await page.screenshot({ path: join(OUT, '02-mobile-drawer.png'), fullPage: false });

// Check drawer direction
const direction = await page.evaluate(() => {
  const d = document.querySelector('.ad-analysis-drawer.el-drawer');
  if (!d) return null;
  return d.className;
});
console.log('drawer class:', direction);
const isBtt = direction?.includes('btt');
console.log('is bottom-to-top:', isBtt ? '✓' : '✗ (still ttb)');

// Restore desktop
await page.setViewportSize({ width: 1920, height: 1080 });
await page.waitForTimeout(500);

process.exit(isBtt ? 0 : 1);
