// Full viewport screenshot (1920x1080).
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

const name = process.argv[2] || 'full';
await page.screenshot({ path: join(OUT, name + '.png'), fullPage: false });
console.log('saved', join(OUT, name + '.png'));

// Probe mask
const mask = await page.evaluate(() => {
  const m = document.querySelector('.el-overlay');
  if (!m) return null;
  const r = m.getBoundingClientRect();
  return { rect: r, bg: getComputedStyle(m).backgroundColor, opacity: getComputedStyle(m).opacity };
});
console.log('overlay:', JSON.stringify(mask));
process.exit(0);
