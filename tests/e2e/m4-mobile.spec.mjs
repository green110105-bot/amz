// M4 Mobile Production Test — 16 pages + NotificationBell × 10 iters on iPhone 12 emulation
// Target: http://47.97.252.71 (PW_BASE_URL)
// Auth: demo@amz.local / demo  → localStorage 'amz_auth_token'
//
// Coverage:
//  T1 (3): MonitorAnomalies, SLABoard, Notifications  → no overflow + content present
//  T3 (1): Appeals → expect MobileFallback (.mfb or "桌面端推荐")
//  T2 (12): ResolutionCases / Postmortems / Hijacking / Infringement /
//           ReviewList / ReviewClusters / ReviewTrends / RecoveryEmails /
//           Competitors / ImageDiff / CompetitorAttack / BrandDefense
//  Bell: global NotificationBell visible on mobile + popover no overflow
//
// Checks per iter:
//  - no horizontal overflow (scrollWidth <= clientWidth + 5)
//  - body content > 50 chars
//  - T3: MobileFallback present
//  - Bell test: bell visible + no overflow after open

import { test, expect, devices } from '@playwright/test';

const BASE = process.env.PW_BASE_URL || 'http://47.97.252.71';
const ITER = 10;

// Strip defaultBrowserType (webkit) so chromium project runs with iPhone 12 viewport/touch overrides.
// --no-sandbox avoids Win11 sandbox permission errors when multiple agents launch chrome concurrently.
const iphone12 = { ...devices['iPhone 12'] };
delete iphone12.defaultBrowserType;
test.use({
  ...iphone12,
  launchOptions: {
    executablePath: process.env.PW_CHROME_PATH || 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  },
});
test.setTimeout(90 * 1000);

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
  await page.evaluate((hh) => { try { window.location.hash = hh; } catch {} }, h);
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(400);
}

const pages = [
  // T1 — mobile first class
  { name: 'MonitorAnomalies', path: '/monitor/anomalies', tier: 'T1' },
  { name: 'SLABoard',         path: '/monitor/sla',       tier: 'T1' },
  { name: 'Notifications',    path: '/notifications',     tier: 'T1' },
  // T3 — desktop-first + MobileFallback
  { name: 'Appeals',          path: '/reviews/appeals',   tier: 'T3' },
  // T2 — mobile usable (list-style)
  { name: 'ResolutionCases',  path: '/monitor/cases',         tier: 'T2' },
  { name: 'Postmortems',      path: '/monitor/postmortems',   tier: 'T2' },
  { name: 'Hijacking',        path: '/monitor/hijacking',     tier: 'T2' },
  { name: 'Infringement',     path: '/monitor/infringement',  tier: 'T2' },
  { name: 'ReviewList',       path: '/reviews',               tier: 'T2' },
  { name: 'ReviewClusters',   path: '/reviews/clusters',      tier: 'T2' },
  { name: 'ReviewTrends',     path: '/reviews/trends',        tier: 'T2' },
  { name: 'RecoveryEmails',   path: '/reviews/recovery',      tier: 'T2' },
  { name: 'Competitors',      path: '/competitors',           tier: 'T2' },
  { name: 'ImageDiff',        path: '/competitors/image-diff',tier: 'T2' },
  { name: 'CompetitorAttack', path: '/ads/competitor-attack', tier: 'T2' },
  { name: 'BrandDefense',     path: '/ads/brand-defense',     tier: 'T2' },
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
        // Appeals: MobileFallback is rendered inside the "起草申诉" dialog (editor is T3),
        // while the list view is mobile-usable. Open the draft dialog to surface the fallback.
        await page.locator('button:has-text("起草申诉")').first().click({ timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(300);
        const fbClass = await page.locator('.mfb').count();
        const fbText = await page.getByText('桌面端推荐').count();
        const fb = fbClass + fbText;
        expect.soft(fb, `${p.name} iter ${i}: no MobileFallback`).toBeGreaterThanOrEqual(1);
        // close dialog to reset state
        await page.keyboard.press('Escape');
        await page.waitForTimeout(150);
      }
    }
  });
}

// ---- Global NotificationBell ----
test(`NotificationBell mobile - 铃铛 visible + popover no overflow × ${ITER}`, async ({ page }) => {
  await login(page);
  // Park on a typical M4 page so the layout (with bell) mounts.
  await gotoHash(page, '/monitor/anomalies');
  for (let i = 0; i < ITER; i++) {
    // Bell trigger: .bell-badge button (canonical, per m4-prod spec) or aria-label fallback.
    const bell = page.locator('.bell-badge button, .notification-bell, [aria-label*="通知"], [aria-label*="notification"]').first();
    await expect.soft(bell, `iter ${i}: bell missing`).toBeVisible({ timeout: 5000 });
    // Tap bell to open popover
    await bell.click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(300);
    // No horizontal overflow with popover open
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 5);
    expect.soft(overflow, `iter ${i}: overflow with bell popover`).toBe(false);
    // Close popper
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
  }
});
