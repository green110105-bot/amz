// M2 Mobile Production Test — 19 pages × 10 iters on iPhone 12 emulation
// Target: http://47.97.252.71 (PW_BASE_URL)
// Auth: demo@amz.local / demo  → localStorage 'amz_auth_token'
//
// Checks per iter:
//  - no horizontal overflow (scrollWidth <= clientWidth + 5)
//  - page has non-trivial content (body text > 50 chars)
//  - T3 pages: MobileFallback (.mfb or "桌面端推荐") visible

import { test, expect, devices } from '@playwright/test';

const BASE = process.env.PW_BASE_URL || 'http://47.97.252.71';
const ITER = 10;

// iPhone 12 emulation — strip defaultBrowserType=webkit so chromium project runs
const iphone12 = { ...devices['iPhone 12'] };
delete iphone12.defaultBrowserType;
test.use({
  ...iphone12,
  launchOptions: {
    executablePath: process.env.PW_CHROME_PATH || 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  },
});

// PurchaseOrders iteration includes detail click + drawer wait which can take 10-15s/iter.
// Default 30s is too tight for 10 iter.
test.setTimeout(180000);

async function login(page) {
  const res = await page.request.post(`${BASE}/api/v1/auth/login`, {
    data: { email: 'demo@amz.local', password: 'demo' },
  });
  const j = await res.json();
  const token = j.token;
  const storeId = j.defaultStoreId || (j.stores?.[0]?.id) || 's-mock-us';
  await page.addInitScript((a) => {
    try {
      localStorage.setItem('amz_auth_token', a.token);
      localStorage.setItem('amz_current_store_id', a.storeId);
    } catch {}
  }, { token, storeId });
}

async function gotoHash(page, h) {
  await page.goto(`${BASE}/#${h}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(400);
}

const pages = [
  { name: 'ProfitOverview', path: '/profit/overview', tier: 'T1' },
  { name: 'ProfitSkus', path: '/profit/skus' },
  { name: 'OrderProfit', path: '/profit/orders/sample' },
  { name: 'ProfitLeaks', path: '/profit/leaks' },
  { name: 'ProfitCashflow', path: '/profit/cashflow' },
  { name: 'ScenarioSimulator', path: '/profit/scenario', tier: 'T3' },
  { name: 'InventoryReorder', path: '/inventory/reorder' },
  { name: 'SlowMovingDecision', path: '/inventory/slow-moving' },
  { name: 'RepricingDecision', path: '/repricing' },
  { name: 'PurchaseOrders', path: '/inventory/po', tier: 'T3' },
  { name: 'Suppliers', path: '/inventory/suppliers' },
  { name: 'InventoryTransfers', path: '/inventory/transfers' },
  { name: 'MultiStore', path: '/profit/multi-store' },
  { name: 'Dimensions', path: '/profit/dimensions' },
  { name: 'FxRisk', path: '/profit/fx' },
  { name: 'PaymentChannels', path: '/costs/payment-channels' },
  { name: 'TaxAssist', path: '/tax', tier: 'T3' },
  { name: 'LTV', path: '/profit/ltv' },
  { name: 'CustomAlerts', path: '/alerts/custom' },
];

for (const p of pages) {
  test(`${p.name} - mobile × ${ITER}`, async ({ page }) => {
    await login(page);
    for (let i = 0; i < ITER; i++) {
      await gotoHash(page, p.path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 5);
      expect.soft(overflow, `${p.name} iter ${i}: horizontal overflow`).toBe(false);
      const hasContent = await page.locator('body').evaluate((b) => (b.textContent || '').trim().length > 50);
      expect.soft(hasContent, `${p.name} iter ${i}: empty body`).toBe(true);
      if (p.tier === 'T3') {
        // PurchaseOrders.vue renders <MobileFallback v-if="isMobile && current">
        // i.e. MobileFallback only appears on PO *detail* (not list URL). For PurchaseOrders
        // we click into a row first; for other T3 pages we still assert on the list URL.
        if (p.name === 'PurchaseOrders') {
          // Wait for PO data to load (ResponsiveTable cards). Empty list = no card to click.
          await page.locator('.rt-card, .el-table__row').first().waitFor({ timeout: 8000 }).catch(() => {});
          const detailBtn = page.locator('.rt-card button:has-text("详情"), .rt-actions button:has-text("详情")').first();
          if (await detailBtn.count()) {
            await detailBtn.click({ timeout: 2000 }).catch(() => {});
          } else {
            const card = page.locator('.rt-card.rt-card--clickable, .rt-card').first();
            if (await card.count()) await card.click({ timeout: 2000 }).catch(() => {});
          }
          // Wait for drawer + fetchDetail
          await page.waitForTimeout(1500);
          const fbClass = await page.locator('.mfb').count();
          const fbText = await page.getByText('桌面端推荐').count();
          expect.soft(fbClass + fbText, `${p.name} iter ${i}: no MobileFallback after detail click`).toBeGreaterThanOrEqual(1);
        } else {
          const fbClass = await page.locator('.mfb').count();
          const fbText = await page.getByText('桌面端推荐').count();
          expect.soft(fbClass + fbText, `${p.name} iter ${i}: no MobileFallback`).toBeGreaterThanOrEqual(1);
        }
      }
    }
  });
}
