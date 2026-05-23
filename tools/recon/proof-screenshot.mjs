// Take a high-quality screenshot of every tab in the debug Chrome
// so we can compare to what the user actually sees on their screen.

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, 'output/proof');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const pages = ctx.pages();
console.log(`[proof] ${pages.length} pages in debug Chrome (port 9222):`);

for (let i = 0; i < pages.length; i++) {
  const p = pages[i];
  const url = p.url();
  if (!url.startsWith('http')) continue;
  let title = '';
  try { title = await p.title(); } catch {}
  console.log(`\n[proof] tab #${i + 1}`);
  console.log(`         url:   ${url}`);
  console.log(`         title: ${title}`);
  const file = join(OUT, `tab-${i + 1}.png`);
  try {
    await p.screenshot({ path: file, fullPage: false }); // visible viewport only
    console.log(`         saved: ${file}`);
  } catch (e) {
    console.log(`         ✗ screenshot failed: ${e.message}`);
  }
}

console.log('\n[proof] now open these files and compare each to the Chrome window you see on screen:');
console.log(`        ${OUT}\\`);
process.exit(0);
