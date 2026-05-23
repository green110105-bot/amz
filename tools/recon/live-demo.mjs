// Live demo: drive the debug Chrome in front of the user so they can see.
import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => /^https?:\/\/ads\./.test(p.url() || ''));
if (!page) { console.error('no ads tab'); process.exit(1); }

console.log('[demo] before:', page.url());
await page.bringToFront();
console.log('[demo] step 1 → navigating to 全部活动…');
await page.goto('https://ads.lingxing.com/ad_report/profile/campaign/index', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);

console.log('[demo] step 2 → navigating to SP广告…');
await page.goto('https://ads.lingxing.com/ad_report/campaign/index/index', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);

console.log('[demo] step 3 → navigating to 关键词分析…');
await page.goto('https://ads.lingxing.com/ad_report/analyze/keyword/index', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);

console.log('[demo] after:', page.url());
console.log('[demo] If you saw the tab change URL 3 times above, the recon definitely drove your Chrome.');
process.exit(0);
