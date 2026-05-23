// Poll debug Chrome until the active tab is on the ad module.
// Detection: URL path contains /ads/ or /sp/ or /ad-/ keyword OR title contains 广告 / 投放.

import { chromium } from 'playwright';

const POLL_MS = 5_000;
const TIMEOUT_MS = 30 * 60 * 1000; // 30 min
const start = Date.now();

async function probe() {
  let browser;
  try {
    browser = await chromium.connectOverCDP('http://localhost:9222');
  } catch (e) {
    return { error: 'cannot_connect' };
  }
  const contexts = browser.contexts();
  if (!contexts.length) { browser.close(); return { error: 'no_context' }; }
  const pages = contexts[0].pages();
  const tabs = await Promise.all(pages.map(async (p) => ({
    url: p.url(),
    title: await p.title().catch(() => ''),
  })));
  browser.close();
  return { tabs };
}

function looksLikeAdModule({ url, title }) {
  const u = (url || '').toLowerCase();
  const t = title || '';
  if (/\/(ads?|sp|sd|sb|advertising|investment|invest|ad-?center|ad-?manage|cpc|ppc)(\/|$|\?)/i.test(u)) return true;
  if (/广告|投放|竞价|关键词|定向/.test(t)) return true;
  return false;
}

console.log('[wait] polling debug Chrome every', POLL_MS / 1000, 's for an ad-module tab…');

let lastReport = '';
while (Date.now() - start < TIMEOUT_MS) {
  const r = await probe();
  if (r.error) {
    console.log('[wait]', new Date().toISOString().slice(11, 19), '·', r.error, '(retry…)');
  } else {
    const report = r.tabs.map((t) => `${t.url.slice(0, 80)}  ::  ${t.title.slice(0, 30)}`).join(' | ');
    if (report !== lastReport) {
      console.log('[wait]', new Date().toISOString().slice(11, 19), '·', r.tabs.length, 'tab(s):', report);
      lastReport = report;
    }
    const match = r.tabs.find(looksLikeAdModule);
    if (match) {
      console.log('\n[wait] ✓ ad-module tab detected:');
      console.log('       URL:', match.url);
      console.log('       title:', match.title);
      console.log('[wait] proceeding to dry-run…');
      process.exit(0);
    }
  }
  await new Promise((res) => setTimeout(res, POLL_MS));
}
console.error('[wait] timeout — no ad-module tab found within 30 min');
process.exit(1);
