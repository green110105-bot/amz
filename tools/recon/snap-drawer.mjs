// Capture whatever the active tab currently shows — should be the keyword-detail
// drawer the user has open right now. Includes full-page screenshot + DOM dump
// + enumeration of any tabs/buttons WITHIN the drawer.

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, 'output/drawer-capture');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const pages = ctx.pages();

console.log(`[drawer] ${pages.length} tab(s) found`);
for (let i = 0; i < pages.length; i++) {
  const p = pages[i];
  const url = p.url();
  if (!url.startsWith('http')) continue;
  const title = await p.title().catch(() => '?');
  console.log(`  tab #${i + 1}: ${title}  ${url}`);

  // Full screenshot
  await p.screenshot({ path: join(OUT, `tab-${i + 1}-full.png`), fullPage: true }).catch(() => {});
  // Visible viewport
  await p.screenshot({ path: join(OUT, `tab-${i + 1}-viewport.png`), fullPage: false }).catch(() => {});
  // DOM
  writeFileSync(join(OUT, `tab-${i + 1}.html`), await p.content().catch(() => ''));

  // Look for any open drawer / modal / dialog inside this page
  const drawerInfo = await p.evaluate(() => {
    const drawers = [];
    const selectors = [
      '.el-drawer',
      '.el-dialog',
      '.modal',
      '.drawer',
      '.dialog',
      '[role="dialog"]',
      '.ant-drawer-content',
      '.ant-modal',
    ];
    for (const s of selectors) {
      for (const el of document.querySelectorAll(s)) {
        const rect = el.getBoundingClientRect();
        if (rect.width < 50 || rect.height < 50) continue; // too small / hidden
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        const title =
          el.querySelector('.el-drawer__title, .el-dialog__title, .modal-title, [class*="title"]')?.textContent?.trim().slice(0, 80) || '';
        const tabsInside = [...el.querySelectorAll('a[role="tab"], .el-tabs__item, .ant-tabs-tab, [data-toggle="tab"]')]
          .map((t) => t.textContent?.replace(/\s+/g, ' ').trim().slice(0, 30)).filter(Boolean);
        drawers.push({ selector: s, title, width: rect.width, height: rect.height, tabsInside });
      }
    }
    return drawers;
  });

  if (drawerInfo.length > 0) {
    console.log(`  → found ${drawerInfo.length} OPEN drawer(s)/modal(s) in tab #${i + 1}:`);
    for (const d of drawerInfo) {
      console.log(`     · ${d.selector}  "${d.title}"  ${Math.round(d.width)}×${Math.round(d.height)}  tabs: [${d.tabsInside.join(', ')}]`);
    }
  } else {
    console.log(`  → no drawer detected in tab #${i + 1}`);
  }
}

console.log(`\n[drawer] outputs in ${OUT}\\`);
process.exit(0);
