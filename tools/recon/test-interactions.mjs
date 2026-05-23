// Test header interactions: preset buttons, refresh, escape, entity switch.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, 'output/hd-shots/interactions');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes('localhost:5173'));
if (!page) process.exit(1);

await page.goto('http://localhost:5173/#/ads/lx/campaigns/cmp-001?g=targeting', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

async function snap(name) {
  await page.screenshot({ path: join(OUT, name + '.png'), clip: { x: 0, y: 0, width: 1920, height: 700 } });
  console.log('saved', name);
}

// Open drawer
const r1 = await page.evaluate(() => {
  const link = document.querySelector('.el-table__body tbody tr a.link');
  if (!link) return null;
  link.click();
  return link.textContent.trim();
});
console.log('opened drawer for:', r1);
await page.waitForTimeout(2500);
await snap('01_initial');

// Count rows in daily table (default 7 days)
const before = await page.evaluate(() => {
  return document.querySelectorAll('.ad-analysis-drawer .el-table__body tbody tr').length;
});
console.log('row count (default 7d):', before);

// Click "近 30 天" preset
const presetClicked = await page.evaluate(() => {
  const labels = [...document.querySelectorAll('.ad-analysis-drawer .preset-group .el-radio-button')];
  const t = labels.find((b) => /30/.test(b.textContent || ''));
  if (t) { t.click(); return t.textContent.trim(); }
  return null;
});
console.log('preset clicked:', presetClicked);
await page.waitForTimeout(2000);
await snap('02_after_30d_preset');

const after = await page.evaluate(() => {
  return document.querySelectorAll('.ad-analysis-drawer .el-table__body tbody tr').length;
});
console.log('row count (after 30d):', after);
console.log('row count CHANGED:', before, '→', after);

// Click refresh
const refreshed = await page.evaluate(() => {
  const btn = document.querySelector('.ad-analysis-drawer .header-right .el-button.is-circle:not(.is-disabled)');
  if (btn) { btn.click(); return true; }
  return false;
});
console.log('refresh clicked:', refreshed);
await page.waitForTimeout(1500);
await snap('03_after_refresh');

// Press Escape to close
await page.keyboard.press('Escape');
await page.waitForTimeout(1500);
await snap('04_after_escape');

const stillOpen = await page.evaluate(() => {
  const d = document.querySelector('.ad-analysis-drawer.el-drawer');
  if (!d) return 'no-drawer';
  return d.classList.contains('open') || getComputedStyle(d).visibility !== 'hidden' ? 'still-open' : 'closed';
});
console.log('after Escape state:', stillOpen);

// Test entity switch: click 关闭 then click second row
const closed = await page.evaluate(() => {
  const btn = [...document.querySelectorAll('.ad-analysis-drawer .header-right .el-button')]
    .find((b) => b.textContent.trim() === '关闭');
  if (btn) { btn.click(); return true; }
  return false;
});
await page.waitForTimeout(1000);

const r2 = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.el-table__body tbody tr a.link')];
  if (rows.length >= 2) {
    rows[1].click();
    return rows[1].textContent.trim();
  }
  return null;
});
console.log('opened drawer for second row:', r2);
await page.waitForTimeout(2500);
await snap('05_second_entity');

console.log('done');
process.exit(0);
