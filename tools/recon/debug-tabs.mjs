// Debug: query the live ads.lingxing.com tab for any tab-like elements.
// Print frame count + counts per selector + sample texts.

import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => /^https?:\/\/ads\./.test(p.url() || ''));
if (!page) { console.error('no ads tab'); process.exit(1); }

console.log('page url:', page.url());
console.log('main frame title:', await page.title());

const frames = page.frames();
console.log('frame count:', frames.length);
for (const f of frames) console.log('  frame:', f.url().slice(0, 80));

// Try selectors in MAIN frame
const selectors = [
  'a[role="tab"]',
  'a[data-toggle="tab"]',
  '[role="tab"]',
  '.nav-tabs > li > a',
  '.nav-tabs li a',
  '.nav.nav-tabs li a',
  'li[role="presentation"] a',
  'ul.nav a',
];

for (const s of selectors) {
  const count = await page.locator(s).count().catch(() => 'ERR');
  console.log(`MAIN  ${s}  →  count=${count}`);
}

// Try in each frame
for (let i = 1; i < frames.length; i++) {
  const f = frames[i];
  console.log(`\nFRAME ${i}: ${f.url().slice(0, 80)}`);
  for (const s of selectors) {
    const count = await f.locator(s).count().catch(() => 'ERR');
    if (count !== 'ERR' && count > 0) console.log(`  ${s}  →  ${count}`);
  }
}

// Dump first few tab texts from main
console.log('\nfirst 12 a[role="tab"] in main frame:');
const texts = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('a[role="tab"]'))
    .slice(0, 12)
    .map((el) => ({ text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 30), visible: el.getBoundingClientRect().width > 0 }));
});
console.log(JSON.stringify(texts, null, 2));

process.exit(0);
