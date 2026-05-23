// Probe LxCampaignDetail page tabs.
import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => /^http:\/\/localhost:5173/.test(p.url() || ''));
if (!page) process.exit(1);
console.log('url:', page.url());

const r = await page.evaluate(() => {
  // All tab-like elements
  const sels = ['.el-tabs__item', '[role="tab"]', '.el-segmented__item', '.el-radio-button__inner', '.nav-tabs > li', '.nav-tabs a'];
  const found = {};
  for (const s of sels) {
    const els = [...document.querySelectorAll(s)];
    if (els.length === 0) continue;
    found[s] = els.map((el) => ({
      text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 30),
      rect: el.getBoundingClientRect(),
      visible: el.offsetParent !== null,
    }));
  }
  return {
    url: location.href,
    bodyWidth: document.body.offsetWidth,
    innerWidth: window.innerWidth,
    foundTabs: found,
  };
});
console.log(JSON.stringify(r, null, 2));
process.exit(0);
