// Probe: find all "to-*" view-icon classes in the FIRST row's action cell of the
// underlying keyword table. Don't click anything — just enumerate so we can plan.

import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => /^https?:\/\/ads\.lingxing/.test(p.url() || ''));
if (!page) { console.error('no ads tab'); process.exit(1); }
console.log('[probe] page:', page.url());

const info = await page.evaluate(() => {
  // We assume the underlying table (behind any open drawer) is what we want to inspect.
  const trs = [...document.querySelectorAll('tr[role="row"][data-id]')];
  if (trs.length === 0) return { error: 'no_tr_with_data_id' };
  const firstRow = trs[0];

  // Find the action column — typically the last td, with many <a class="fa ...">
  const tds = [...firstRow.querySelectorAll('td')];
  const lastCellIcons = tds.length > 0
    ? [...tds[tds.length - 1].querySelectorAll('a, span, i, button')]
    : [];

  const safeIcons = lastCellIcons.map((el) => {
    const classes = (el.className && typeof el.className === 'string') ? el.className : (el.getAttribute('class') || '');
    const title = el.getAttribute('title') || el.getAttribute('data-title') || '';
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    const dataText = el.getAttribute('data-text') || '';
    const dataKey = el.getAttribute('data-key') || el.getAttribute('data-id') || '';
    const dataHref = el.getAttribute('data-href') || el.getAttribute('href') || '';
    const rect = el.getBoundingClientRect();
    const cs = window.getComputedStyle(el);
    return {
      tag: el.tagName.toLowerCase(),
      classes,
      title,
      dataText,
      text,
      dataKey,
      dataHref: dataHref.slice(0, 100),
      visible: rect.width > 1 && rect.height > 1 && cs.display !== 'none' && cs.visibility !== 'hidden',
    };
  });

  const rowMeta = {
    'data-id': firstRow.getAttribute('data-id'),
    'data-campaign_id': firstRow.getAttribute('data-campaign_id'),
    'data-group_id': firstRow.getAttribute('data-group_id'),
    tdCount: tds.length,
    iconsInLastCell: safeIcons.length,
  };

  return { rowMeta, icons: safeIcons };
});

console.log('[probe] result:');
console.log(JSON.stringify(info, null, 2));
process.exit(0);
