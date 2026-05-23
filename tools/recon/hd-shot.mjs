// Take high-res Playwright page screenshot (viewport-level, not OS desktop-level).
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

const name = process.argv[2] || 'snap';
await page.screenshot({ path: join(OUT, name + '.png'), fullPage: false, clip: { x: 0, y: 0, width: 1920, height: 700 } });
console.log('saved', join(OUT, name + '.png'));

// Also probe header
const probe = await page.evaluate(() => {
  const drawer = document.querySelector('.ad-analysis-drawer');
  if (!drawer) return null;
  const header = drawer.querySelector('.el-drawer__header');
  const left = drawer.querySelector('.header-left');
  const tag = drawer.querySelector('.entity-tag');
  const name = drawer.querySelector('.entity-name');
  return {
    headerRect: header?.getBoundingClientRect(),
    headerLeftRect: left?.getBoundingClientRect(),
    tagRect: tag?.getBoundingClientRect(),
    nameRect: name?.getBoundingClientRect(),
    nameText: name?.textContent,
    nameFontSize: name ? window.getComputedStyle(name).fontSize : null,
  };
});
console.log('probe:', JSON.stringify(probe, null, 2));
process.exit(0);
