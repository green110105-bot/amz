// Inspect the visible .popover that opened — list every clickable item.
import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => /^https?:\/\/ads\.lingxing/.test(p.url() || ''));
if (!page) process.exit(1);

const r = await page.evaluate(() => {
  const pops = [...document.querySelectorAll('.popover')];
  const visible = pops.find((p) => {
    const rc = p.getBoundingClientRect();
    return rc.width > 30 && rc.height > 20 && window.getComputedStyle(p).display !== 'none';
  });
  if (!visible) return { error: 'no_visible_popover' };
  // Enumerate all clickable elements within
  const items = [...visible.querySelectorAll('a, button, [class*="to-"], [class*="Js-"], li')];
  return {
    popClass: visible.className,
    rect: visible.getBoundingClientRect(),
    itemCount: items.length,
    items: items.map((el) => ({
      tag: el.tagName.toLowerCase(),
      classes: el.className || '',
      text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40),
      dataText: el.getAttribute('data-text') || '',
      dataHref: (el.getAttribute('data-href') || el.getAttribute('href') || '').slice(0, 80),
    })),
  };
});
console.log(JSON.stringify(r, null, 2));
process.exit(0);
