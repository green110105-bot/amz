// Focused Escape test with detailed state probing.
import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes('localhost:5173'));
if (!page) process.exit(1);

await page.goto('http://localhost:5173/#/ads/lx/campaigns/cmp-001?g=targeting', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

// Open drawer
await page.evaluate(() => {
  const link = document.querySelector('.el-table__body tbody tr a.link');
  if (link) link.click();
});
await page.waitForTimeout(2000);

const stateBefore = await page.evaluate(() => {
  const d = document.querySelector('.ad-analysis-drawer.el-drawer');
  const overlay = document.querySelector('.ad-analysis-drawer.el-drawer')?.closest('.el-overlay');
  return {
    drawerClass: d?.className || null,
    drawerVisible: d ? getComputedStyle(d).display : null,
    overlayDisplay: overlay ? getComputedStyle(overlay).display : null,
    overlayPresent: !!overlay,
  };
});
console.log('STATE BEFORE ESC:', JSON.stringify(stateBefore));

// Focus drawer body first then press Escape
await page.evaluate(() => {
  const d = document.querySelector('.ad-analysis-drawer.el-drawer');
  if (d) d.focus();
});
await page.keyboard.press('Escape');
await page.waitForTimeout(1000);

const stateAfter = await page.evaluate(() => {
  const d = document.querySelector('.ad-analysis-drawer.el-drawer');
  const overlay = document.querySelector('.ad-analysis-drawer.el-drawer')?.closest('.el-overlay');
  return {
    drawerClass: d?.className || null,
    drawerVisible: d ? getComputedStyle(d).display : null,
    overlayDisplay: overlay ? getComputedStyle(overlay).display : null,
    overlayPresent: !!overlay,
  };
});
console.log('STATE AFTER ESC:', JSON.stringify(stateAfter));

process.exit(0);
