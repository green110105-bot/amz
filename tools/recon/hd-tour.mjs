// Click each tab in the open drawer and take a HD viewport screenshot of each.
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

const tabs = ['天数据', '对比分析', '小时数据', '广告位', '用户搜索词'];
for (let i = 0; i < tabs.length; i++) {
  const name = tabs[i];
  const r = await page.evaluate((target) => {
    const items = [...document.querySelectorAll('.ad-analysis-drawer .el-tabs__item')];
    const match = items.find((el) => el.textContent.trim() === target);
    if (match) { match.click(); return true; }
    return false;
  }, name);
  if (!r) { console.log('  skip', name); continue; }
  await page.waitForTimeout(1500);
  const out = join(OUT, `tab-${String(i + 1).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 1920, height: 700 } });
  console.log('saved', out);
}
process.exit(0);
