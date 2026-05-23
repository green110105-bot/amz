// Final E2E: verify all 4 row types open AdAnalysisDrawer with correct tab counts.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, 'output/final-e2e');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes('localhost:5173'));

const tests = [
  { name: 'campaign',  url: '/#/ads/lx/all-campaigns',                  clickSelector: '.quick-analysis-icon',              expectedTabs: 9 },
  { name: 'adgroup',   url: '/#/ads/lx/campaigns/cmp-001?g=ad-groups',  clickSelector: '.el-table__body tbody tr a.link',   expectedTabs: 3 },
  { name: 'ad',        url: '/#/ads/lx/campaigns/cmp-001?g=ads',        clickSelector: '.quick-analysis-icon',              expectedTabs: 3 },
  { name: 'keyword',   url: '/#/ads/lx/campaigns/cmp-001?g=targeting',  clickSelector: '.el-table__body tbody tr a.link',   expectedTabs: 5 },
  { name: 'portfolio', url: '/#/ads/lx/portfolios',                     clickSelector: '.quick-analysis-icon',              expectedTabs: 2 },
];

const results = [];

for (const t of tests) {
  console.log(`\n[final] === ${t.name} ===`);
  await page.goto('http://localhost:5173' + t.url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  // Close any lingering drawer
  await page.evaluate(() => {
    const d = document.querySelector('.ad-analysis-drawer.open');
    if (d) {
      const btn = [...d.querySelectorAll('.el-button')].find((b) => b.textContent.trim() === '关闭');
      if (btn) btn.click();
    }
  });
  await page.waitForTimeout(800);

  const clicked = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    el.click();
    return el.textContent.trim().slice(0, 40);
  }, t.clickSelector);
  console.log('  clicked:', clicked);

  await page.waitForTimeout(2500);
  await page.screenshot({ path: join(OUT, t.name + '.png'), clip: { x: 0, y: 0, width: 1920, height: 700 } });

  const tabs = await page.evaluate(() => {
    return [...document.querySelectorAll('.ad-analysis-drawer .el-tabs__item')].map((el) => el.textContent.trim());
  });
  const pass = tabs.length === t.expectedTabs;
  console.log(`  tabs: [${tabs.join(', ')}]`);
  console.log(`  expected ${t.expectedTabs}, got ${tabs.length} ${pass ? '✓' : '✗'}`);
  results.push({ ...t, actualTabs: tabs.length, tabsText: tabs, pass });
}

console.log('\n\n[final] SUMMARY:');
for (const r of results) {
  console.log(`  ${r.pass ? '✓' : '✗'} ${r.name.padEnd(10)} ${r.actualTabs}/${r.expectedTabs} tabs`);
}
const all = results.every((r) => r.pass);
console.log(`\n  ${all ? '✅ ALL GREEN' : '❌ SOME FAILED'}`);
process.exit(all ? 0 : 1);
