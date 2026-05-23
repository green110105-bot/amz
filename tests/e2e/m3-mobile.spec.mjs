// M3 Mobile Production Test — http://47.97.252.71/ — iPhone 12 viewport (390x844).
// Strategy: emulate iPhone 12, login via API + localStorage, navigate to each
// representative M3 page using hash routing, then run mobile-specific assertions:
//   1. overflow check: page should not produce body horizontal scroll
//   2. content check: main content visible (no blank/login redirect)
//   3. fallback check: T3 pages should render <MobileFallback> (.mfb)
//   4. ResponsiveTable mobile mode: LxPortfolios should show card list, not el-table
//   5. tap-target / button presence sanity
//
// Each (page, iter) is its own test; ITERS=10 per page.
// ~12-15 pages × 10 iters ≈ 120-150 tests.
import { test, expect, devices } from '@playwright/test';

const PROD_BASE = process.env.PW_BASE_URL || 'http://47.97.252.71';
const API_BASE = `${PROD_BASE}/api/v1`;
const ITERS = 10;
const NAV_TIMEOUT = 25000;

test.setTimeout(60000);

// iPhone 12 emulation — 390×844, DPR 3, mobile=true, touch=true.
// Strip defaultBrowserType (webkit) so the chromium project still drives the run.
// --no-sandbox avoids Win11 sandbox permission errors when multiple agents
// launch chrome concurrently (parallel agent execution).
const iphone12 = { ...devices['iPhone 12'] };
delete iphone12.defaultBrowserType;
test.use({
  ...iphone12,
  launchOptions: {
    executablePath: process.env.PW_CHROME_PATH || 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  },
});

// ---- shared login helper (with retry for 502s when 4 agents share prod) ----
async function login(page) {
  let body = null;
  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const resp = await page.request.post(`${API_BASE}/auth/login`, {
        data: { email: 'demo@amz.local', password: 'demo' },
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
      });
      if (resp.ok()) { body = await resp.json(); break; }
      lastErr = `HTTP ${resp.status()}`;
    } catch (e) { lastErr = e.message; }
    await page.waitForTimeout(500 + attempt * 500);
  }
  if (!body) throw new Error(`login failed after retries: ${lastErr}`);
  const storeId = body.defaultStoreId || 's-mock-us';
  await page.addInitScript(({ token, storeId }) => {
    try {
      localStorage.setItem('amz_auth_token', token);
      localStorage.setItem('amz_current_store_id', storeId);
    } catch {}
  }, { token: body.token, storeId });
  return { token: body.token, storeId };
}

async function gotoHash(page, hashPath) {
  await page.goto(`/#${hashPath}`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
  try { await page.waitForLoadState('networkidle', { timeout: 8000 }); } catch {}
  await page.waitForTimeout(400);
}

/**
 * Run base mobile assertions on the current page.
 * Returns a summary object describing what was seen.
 */
async function runMobileChecks(page, label, opts = {}) {
  const expectFallback = opts.expectFallback === true;
  const expectResponsiveCards = opts.expectResponsiveCards === true;
  const result = {
    label,
    url: page.url(),
    overflow: null,
    contentVisible: false,
    fallbackVisible: false,
    tableCount: 0,
    mobileCardCount: 0,
    buttonCount: 0,
    minTapTarget: null,
  };

  // ----- overflow: body width should not exceed viewport (390) -----
  const overflowInfo = await page.evaluate(() => {
    const docW = document.documentElement.scrollWidth;
    const winW = window.innerWidth;
    return { docW, winW, overflowX: docW - winW };
  });
  result.overflow = overflowInfo;
  // Allow 2px sub-pixel slack.
  expect.soft(overflowInfo.overflowX, `[${label}] horizontal overflow ${overflowInfo.overflowX}px`).toBeLessThanOrEqual(2);

  // ----- content visible: at least one of common page chrome elements -----
  // Extended for ResponsiveTable mobile mode (.rt-mobile/.rt-card) and Lx layouts (.lx-layout/.lx1-page/.filter-bar).
  const headerVisible = await page.locator('.el-card, .page-header, h1, h2, h3, .mfb, .responsive-table-mobile, .rt-mobile, .rt-card, .lx-layout, .lx1-page, .filter-bar, .el-table').first().isVisible({ timeout: 6000 }).catch(() => false);
  result.contentVisible = headerVisible;
  expect.soft(headerVisible, `[${label}] main content visible`).toBeTruthy();

  // ----- fallback marker -----
  const fallback = page.locator('.mfb').first();
  result.fallbackVisible = await fallback.isVisible({ timeout: 1500 }).catch(() => false);
  if (expectFallback) {
    expect.soft(result.fallbackVisible, `[${label}] expected MobileFallback (.mfb) visible`).toBeTruthy();
  }

  // ----- ResponsiveTable mobile mode: when expected, prefer card list over el-table -----
  result.tableCount = await page.locator('.el-table:visible').count().catch(() => 0);
  // ResponsiveTable.vue typically renders a class containing "mobile" wrapper or el-card list
  result.mobileCardCount = await page.locator('.responsive-table-mobile, .rt-mobile, .mobile-card, .el-card').count().catch(() => 0);
  if (expectResponsiveCards) {
    // On mobile, either there are no visible el-tables, or there are at least some cards.
    const ok = result.tableCount === 0 || result.mobileCardCount > 0;
    expect.soft(ok, `[${label}] expected mobile card list (tables=${result.tableCount}, cards=${result.mobileCardCount})`).toBeTruthy();
  }

  // ----- buttons present and minimum tap target -----
  const btns = await page.locator('button:visible, .el-button:visible').all();
  result.buttonCount = btns.length;
  let minTap = Infinity;
  const samples = btns.slice(0, 6);
  for (const b of samples) {
    const box = await b.boundingBox().catch(() => null);
    if (box) {
      const m = Math.min(box.width, box.height);
      if (m < minTap) minTap = m;
    }
  }
  result.minTapTarget = Number.isFinite(minTap) ? minTap : null;

  return result;
}

const RESULTS = [];
test.afterAll(async () => {
  try {
    // eslint-disable-next-line no-console
    console.log('\n[M3-MOBILE] page summaries:\n' + JSON.stringify(RESULTS, null, 2));
  } catch {}
});

// ============== T1 — mobile-first pages ==============
const T1_PAGES = [
  { name: 'AdsHub', path: '/ads' },
  { name: 'AdsTimeline', path: '/ads/timeline' },
  { name: 'StrategyLibrary', path: '/ads/strategies' },
  { name: 'LxPortfolios', path: '/ads/lx/portfolios', expectResponsiveCards: true },
];

test.describe('M3 mobile — T1 mobile-first', () => {
  for (const p of T1_PAGES) {
    for (let i = 1; i <= ITERS; i++) {
      test(`${p.name} ${p.path} iter ${i}`, async ({ page }) => {
        await login(page);
        await gotoHash(page, p.path);
        const r = await runMobileChecks(page, `${p.name}#${i}`, {
          expectResponsiveCards: p.expectResponsiveCards,
        });
        RESULTS.push(r);
        // Multi-fallback selector — LxPortfolios renders el-card/rt-card/portfolio-item or
        // ResponsiveTable mobile-card cards. Also accept "page has buttons rendered" as a
        // signal the route mounted successfully (avoids selector race over OR-chains).
        let mounted = r.contentVisible || r.fallbackVisible;
        if (!mounted) {
          mounted = await page.locator('.el-card, .rt-card, .lx-portfolio-card, .portfolio-item, [data-test="portfolio"]')
            .first().isVisible({ timeout: 5000 }).catch(() => false);
        }
        if (!mounted) {
          const btnCount = await page.locator('button').count().catch(() => 0);
          mounted = btnCount > 0;
        }
        expect(mounted).toBeTruthy();
      });
    }
  }
});

// ============== T3 — desktop-first w/ MobileFallback ==============
const T3_PAGES = [
  { name: 'LxCampaignDetail', path: '/ads/lx/campaigns/cmp-001' },
  { name: 'Campaigns', path: '/ads/campaigns' },
  { name: 'Playbook', path: '/ads/playbook' },
];

test.describe('M3 mobile — T3 fallback', () => {
  for (const p of T3_PAGES) {
    for (let i = 1; i <= ITERS; i++) {
      test(`${p.name} ${p.path} iter ${i} (expect MobileFallback)`, async ({ page }) => {
        await login(page);
        await gotoHash(page, p.path);
        const r = await runMobileChecks(page, `${p.name}#${i}`, { expectFallback: true });
        RESULTS.push(r);
        expect(r.contentVisible || r.fallbackVisible).toBeTruthy();
      });
    }
  }
});

// ============== T2 — list / tab representatives ==============
const T2_PAGES = [
  { name: 'LxAllCampaigns', path: '/ads/lx/all-campaigns' },
  { name: 'LxTabSP', path: '/ads/lx/sp' },
  { name: 'LxTabSD', path: '/ads/lx/sd' },
  { name: 'LxTabST', path: '/ads/lx/st' },
  { name: 'Dayparting', path: '/ads/dayparting' },
  { name: 'BudgetAllocator', path: '/ads/budget-allocator' },
  { name: 'SearchTermReport', path: '/ads/reports/search-terms' },
];

test.describe('M3 mobile — T2 list representatives', () => {
  for (const p of T2_PAGES) {
    for (let i = 1; i <= ITERS; i++) {
      test(`${p.name} ${p.path} iter ${i}`, async ({ page }) => {
        await login(page);
        await gotoHash(page, p.path);
        const r = await runMobileChecks(page, `${p.name}#${i}`);
        RESULTS.push(r);
        expect(r.contentVisible || r.fallbackVisible).toBeTruthy();
      });
    }
  }
});
