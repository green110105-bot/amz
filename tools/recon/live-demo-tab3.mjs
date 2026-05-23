// Drive tab 3 (the ERP one user has in front) to a visible new URL,
// pause, then drive again, so user can witness real navigation.

import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const pages = ctx.pages();
const erpTab = pages.find((p) => /^https?:\/\/erp\.lingxing\.com/.test(p.url() || ''));
if (!erpTab) { console.error('no ERP tab found'); process.exit(1); }

console.log('[demo3] target tab:', erpTab.url());
await erpTab.bringToFront();
await new Promise((r) => setTimeout(r, 1500));

console.log('[demo3] step 1 → switching to ads.lingxing.com 全部活动…  (watch the address bar)');
await erpTab.goto('https://ads.lingxing.com/ad_report/profile/campaign/index', { waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 5000)); // pause 5s so user can read URL

console.log('[demo3] step 2 → switching to ads.lingxing.com SP广告…');
await erpTab.goto('https://ads.lingxing.com/ad_report/campaign/index/index', { waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 5000));

console.log('[demo3] step 3 → switching to ads.lingxing.com 自动规则…');
await erpTab.goto('https://ads.lingxing.com/ad_report/rule_pro/index/objects', { waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 5000));

console.log('[demo3] final URL:', erpTab.url());
console.log('[demo3] If you saw 3 distinct URL changes in the address bar, the recon definitely drives Chrome.');
process.exit(0);
