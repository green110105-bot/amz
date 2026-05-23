import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, 'output/hd-shots/campaign');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes('localhost:5173'));
if (!page) process.exit(1);

await page.goto('http://localhost:5173/#/ads/lx/all-campaigns', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.screenshot({ path: join(OUT, '00_master.png'), clip: { x: 0, y: 0, width: 1920, height: 700 } });

// Click first quick-analysis-icon
const r = await page.evaluate(() => {
  const icon = document.querySelector('.quick-analysis-icon');
  if (!icon) return null;
  icon.click();
  return true;
});
console.log('clicked icon:', r);
await page.waitForTimeout(2500);
await page.screenshot({ path: join(OUT, '01_drawer.png'), clip: { x: 0, y: 0, width: 1920, height: 700 } });

const tabs = await page.evaluate(() => {
  return [...document.querySelectorAll('.ad-analysis-drawer .el-tabs__item')].map((el) => el.textContent.trim());
});
console.log('tabs:', tabs);
console.log('expected 9 tabs:', tabs.length === 9 ? '✓' : '✗');

// Click each campaign-only tab
const campaignOnly = ['超预算分析', '归因期分析', '时间序列', '重点关键词', '溯源（日志）'];
for (const t of campaignOnly) {
  await page.evaluate((target) => {
    const items = [...document.querySelectorAll('.ad-analysis-drawer .el-tabs__item')];
    const m = items.find((el) => el.textContent.trim() === target);
    if (m) m.click();
  }, t);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(OUT, `tab-${t}.png`), clip: { x: 0, y: 0, width: 1920, height: 700 } });
  console.log('captured', t);
}

process.exit(0);
