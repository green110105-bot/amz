// Inspect the currently visible drawer: title + tabs + first 200 chars of text.
import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => /^https?:\/\/ads\.lingxing/.test(p.url() || ''));
if (!page) process.exit(1);

const r = await page.evaluate(() => {
  const all = [...document.querySelectorAll('.modal, [role="dialog"], .left-drawer-container, .drawer-with-content, .ad-detail-slot, .ad-detail, .price-detail, .budget-detail, .portfolio-detail, .strategy-detail, .status-detail')];
  const drawers = all.filter((d) => {
    const r = d.getBoundingClientRect();
    const cs = window.getComputedStyle(d);
    return r.width > 300 && r.height > 200 && cs.display !== 'none' && cs.visibility !== 'hidden';
  });

  return drawers.map((d) => {
    const tabs = [...d.querySelectorAll('a[role="tab"], a[data-toggle="tab"], .nav-tabs > li > a')];
    const activeTab = [...d.querySelectorAll('a[role="tab"][aria-selected="true"], .nav-tabs > li.active > a')];
    const titleEl = d.querySelector('.main-title, .modal-title, .el-drawer__title, .el-dialog__title, h1, h2, h3, h4');
    return {
      classes: d.className,
      rect: d.getBoundingClientRect(),
      title: titleEl?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 80) || '',
      tabsCount: tabs.length,
      tabsText: tabs.map((t) => (t.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean),
      activeTabText: activeTab.map((t) => (t.textContent || '').replace(/\s+/g, ' ').trim()),
      tagsInDrawer: d.tagName + ' ' + (d.id ? '#' + d.id : ''),
    };
  });
});
console.log(JSON.stringify(r, null, 2));
process.exit(0);
