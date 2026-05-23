// Test: navigate to AdGroups tab, click ad-group row, verify 3-tab drawer.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, 'output/hd-shots');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes('localhost:5173'));
if (!page) process.exit(1);

// Navigate to ad-groups tab
await page.goto('http://localhost:5173/#/ads/lx/campaigns/cmp-001?g=ad-groups', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.screenshot({ path: join(OUT, 'adgroup-page.png'), clip: { x: 0, y: 0, width: 1920, height: 700 } });

// Click first ad-group name
const r = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.el-table__body tbody tr')];
  for (const row of rows) {
    const link = row.querySelector('a.link, .link');
    if (link) { link.click(); return link.textContent.trim(); }
  }
  return null;
});
console.log('clicked:', r);
await page.waitForTimeout(2500);
await page.screenshot({ path: join(OUT, 'adgroup-drawer.png'), clip: { x: 0, y: 0, width: 1920, height: 700 } });

// Probe drawer tabs
const tabs = await page.evaluate(() => {
  const t = [...document.querySelectorAll('.ad-analysis-drawer .el-tabs__item')];
  return t.map((el) => el.textContent.trim());
});
console.log('tabs:', tabs);

// Click 对比分析 tab to verify
await page.evaluate(() => {
  const items = [...document.querySelectorAll('.ad-analysis-drawer .el-tabs__item')];
  const t = items.find((el) => el.textContent.trim() === '对比分析');
  if (t) t.click();
});
await page.waitForTimeout(1500);
await page.screenshot({ path: join(OUT, 'adgroup-compare.png'), clip: { x: 0, y: 0, width: 1920, height: 700 } });
console.log('done');
process.exit(0);
