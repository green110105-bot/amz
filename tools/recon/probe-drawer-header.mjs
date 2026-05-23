// Inspect the currently visible drawer header structure.
import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes('localhost:5173'));
if (!page) process.exit(1);

const info = await page.evaluate(() => {
  const drawer = document.querySelector('.ad-analysis-drawer');
  if (!drawer) return { error: 'no drawer with .ad-analysis-drawer class' };
  const headerEl = drawer.querySelector('.el-drawer__header');
  const titleEl = drawer.querySelector('.el-drawer__title');
  const customHeader = drawer.querySelector('.drawer-header');
  const closeBtn = drawer.querySelector('.el-drawer__close-btn');
  return {
    drawer: { class: drawer.className, rect: drawer.getBoundingClientRect() },
    header: headerEl ? { rect: headerEl.getBoundingClientRect(), html: headerEl.outerHTML.slice(0, 400) } : null,
    title: titleEl ? { text: titleEl.textContent, rect: titleEl.getBoundingClientRect() } : null,
    customHeader: customHeader ? { text: customHeader.textContent, rect: customHeader.getBoundingClientRect() } : null,
    closeBtn: closeBtn ? { rect: closeBtn.getBoundingClientRect() } : null,
  };
});
console.log(JSON.stringify(info, null, 2));
process.exit(0);
