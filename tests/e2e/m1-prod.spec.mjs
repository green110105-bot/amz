// M1 Production smoke test against http://47.97.252.71/
// Strategy: For each M1 page, run ITER iterations. Each iteration loads the
// page (fresh login via API + localStorage), then probes a fixed list of
// interaction elements found via static analysis of *.vue files.
//
// We intentionally batch the element probes inside one Playwright `test()`
// per page+iter to keep the total wall-clock manageable (pages * ITER tests).
// Per-element pass/fail is recorded via expect.soft so a single broken
// element will not abort the iteration.
import { test, expect } from '@playwright/test';

const BASE = process.env.PW_BASE_URL || 'http://47.97.252.71';
const API_BASE = process.env.PW_API_BASE || BASE;
const ITER = Number(process.env.M1_ITER || 10);

// ---------- shared login helper ----------
async function login(page) {
  const ctx = page.context();
  const resp = await ctx.request.post(`${API_BASE}/api/v1/auth/login`, {
    data: { email: 'demo@amz.local', password: 'demo' },
    headers: { 'Content-Type': 'application/json' },
  });
  expect(resp.ok()).toBeTruthy();
  const body = await resp.json();
  const storeId = body.defaultStoreId || (body.stores?.[0]?.id) || 's-mock-us';
  await page.addInitScript(({ token, storeId }) => {
    try {
      localStorage.setItem('amz_auth_token', token);
      localStorage.setItem('amz_current_store_id', storeId);
    } catch {}
  }, { token: body.token, storeId });
  return { token: body.token, storeId };
}

async function gotoHash(page, hashPath) {
  // hash mode router — BASE/#/listings/select
  await page.goto(`${BASE}/#${hashPath}`, { waitUntil: 'domcontentloaded' });
  // Element-Plus components mount on next tick — small wait
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
}

// Probe helper — counts as a soft assertion so we keep going on failure.
async function probeVisible(page, sel, label) {
  const loc = page.locator(sel).first();
  const visible = await loc.isVisible().catch(() => false);
  expect.soft(visible, `[${label}] selector "${sel}" visible`).toBeTruthy();
  return visible;
}

async function probeClick(page, sel, label) {
  const loc = page.locator(sel).first();
  try {
    await loc.click({ timeout: 3000 });
    return true;
  } catch (e) {
    expect.soft(false, `[${label}] click "${sel}" failed: ${e.message?.slice(0, 80)}`).toBeTruthy();
    return false;
  }
}

// ===========================================================================
// PAGE: /listings/select  (ListingSelect)
// Elements:
//  - Mode radio-buttons (3)
//  - Mode 1: search input, "开始优化" button, table, row link
//  - Mode 2: asin input, "识别" button
//  - Mode 3: category, sellingPoints (3 inputs), "+ 添加卖点", "删", targetAudience, priceBand, physicalSpecs, brandPositioning, targetKeywords, submit button
// ===========================================================================
test.describe.serial('M1 /listings/select', () => {
  for (let i = 1; i <= ITER; i++) {
    test(`select iter ${i}`, async ({ page }) => {
      await login(page);
      await gotoHash(page, '/listings/select');

      await probeVisible(page, 'text=优化目标选择', 'select.page-title');
      await probeVisible(page, '.mode-tabs', 'select.mode-tabs');

      // mode radio buttons — switch through all 3
      for (const m of ['1', '2', '3']) {
        const sel = `.mode-tabs label.el-radio-button:has-text("Mode ${m}")`;
        await probeClick(page, sel, `select.mode${m}`);
        await page.waitForTimeout(120);
      }

      // back to mode 1 → search + table
      await probeClick(page, '.mode-tabs label.el-radio-button:has-text("Mode 1")', 'select.mode1.again');
      await probeVisible(page, '.mode-body input[placeholder*="搜索"]', 'select.mode1.search');
      // optimize button (likely disabled with empty selection — just check it exists)
      await probeVisible(page, '.mode-body button:has-text("开始优化")', 'select.mode1.optimizeBtn');
      await probeVisible(page, '.mode-body .el-table', 'select.mode1.table');

      // mode 2
      await probeClick(page, '.mode-tabs label.el-radio-button:has-text("Mode 2")', 'select.mode2.click');
      await probeVisible(page, '.mode2-row input', 'select.mode2.asinInput');
      await probeVisible(page, '.mode2-row button:has-text("识别")', 'select.mode2.identifyBtn');

      // mode 3
      await probeClick(page, '.mode-tabs label.el-radio-button:has-text("Mode 3")', 'select.mode3.click');
      await probeVisible(page, '.mode-body .el-form', 'select.mode3.form');
      await probeVisible(page, '.mode-body button:has-text("提交并进入优化室")', 'select.mode3.submitBtn');
      // try clicking add-point — it may or may not exist depending on draft
      const addBtn = page.locator('.mode-body button:has-text("添加卖点")').first();
      if (await addBtn.isVisible().catch(() => false)) {
        await addBtn.click({ timeout: 2000 }).catch(() => {});
      }
    });
  }
});

// ===========================================================================
// PAGE: /listings/optimize  (no id → should redirect/empty)
// ===========================================================================
test.describe.serial('M1 /listings/optimize', () => {
  for (let i = 1; i <= ITER; i++) {
    test(`optimize iter ${i}`, async ({ page }) => {
      await login(page);
      await gotoHash(page, '/listings/optimize');

      // either we end up on /listings/select (redirect) or we see EmptyState
      const onSelect = page.url().includes('/listings/select');
      const empty = await page.locator('text=未指定优化目标').first().isVisible().catch(() => false);
      expect.soft(onSelect || empty, 'optimize.empty-or-redirect').toBeTruthy();

      // Header buttons (when target exists) — try with a synthetic id to load the page header.
      await gotoHash(page, '/listings/optimize/t-no-such-target');
      await page.waitForTimeout(500);
      // PageHeader might render OR the page might redirect to /select if the
      // composable throws — both are acceptable production-safe behaviors.
      const titleVisible = await page.locator('text=Listing 优化室').first().isVisible().catch(() => false);
      const redirected = page.url().includes('/listings/select');
      expect.soft(titleVisible || redirected, 'optimize.title-or-redirect').toBeTruthy();
    });
  }
});

// ===========================================================================
// PAGE: /listings/ab  (ListingAbCenter)
// Elements: 新建 button, status select, table, row buttons, drawer form
// ===========================================================================
test.describe.serial('M1 /listings/ab', () => {
  for (let i = 1; i <= ITER; i++) {
    test(`ab iter ${i}`, async ({ page }) => {
      await login(page);
      await gotoHash(page, '/listings/ab');

      await probeVisible(page, 'text=A/B 测试中心', 'ab.title');
      await probeVisible(page, 'button:has-text("新建 A/B 测试")', 'ab.createBtn');
      // KPI cards (4)
      await probeVisible(page, '.kpi-row', 'ab.kpis');
      // Status filter select
      await probeVisible(page, '.el-card .el-select', 'ab.statusFilter');

      // Open the create drawer
      const createBtn = page.locator('button:has-text("新建 A/B 测试")').first();
      if (await createBtn.isVisible().catch(() => false)) {
        await createBtn.click().catch(() => {});
        await page.waitForTimeout(300);
        const drawerVisible = await page.locator('.el-drawer').first().isVisible().catch(() => false);
        expect.soft(drawerVisible, 'ab.drawer.open').toBeTruthy();
        // Close drawer via 取消 button
        const cancelBtn = page.locator('.el-drawer button:has-text("取消")').first();
        if (await cancelBtn.isVisible().catch(() => false)) {
          await cancelBtn.click().catch(() => {});
        }
      }
    });
  }
});

// ===========================================================================
// PAGE: /listings/experiments  (redirects to /listings/ab)
// ===========================================================================
test.describe.serial('M1 /listings/experiments', () => {
  for (let i = 1; i <= ITER; i++) {
    test(`experiments-redirect iter ${i}`, async ({ page }) => {
      await login(page);
      await gotoHash(page, '/listings/experiments');
      // should redirect to /listings/ab
      const ok = page.url().includes('/listings/ab');
      expect.soft(ok, 'experiments.redirected').toBeTruthy();
    });
  }
});

// ===========================================================================
// PAGE: /listings/keywords-library  (KeywordLibrary)
// Elements: 从搜索词导入, 批量上传, search input, type radio (3), category filter (implicit),
//   add bar: newTerm input, newType radio (2), 添加 button, table 移除 button
// ===========================================================================
test.describe.serial('M1 /listings/keywords-library', () => {
  for (let i = 1; i <= ITER; i++) {
    test(`keywords-library iter ${i}`, async ({ page }) => {
      await login(page);
      await gotoHash(page, '/listings/keywords-library');

      await probeVisible(page, 'text=关键词库', 'kwlib.title');
      await probeVisible(page, 'button:has-text("从搜索词导入")', 'kwlib.importBtn');
      await probeVisible(page, 'button:has-text("批量上传")', 'kwlib.uploadBtn');
      await probeVisible(page, '.kpi-row', 'kwlib.kpis');
      await probeVisible(page, '.add-bar', 'kwlib.addBar');
      await probeVisible(page, 'button:has-text("添加")', 'kwlib.addBtn');
      await probeVisible(page, '.el-table', 'kwlib.table');

      // Click import button (handled in front-end with just a toast)
      await probeClick(page, 'button:has-text("从搜索词导入")', 'kwlib.importClick');
      // toggle type filter via radio button
      const allBtn = page.locator('.el-card label.el-radio-button:has-text("全部")').first();
      const prefBtn = page.locator('.el-card label.el-radio-button:has-text("主词")').first();
      if (await prefBtn.isVisible().catch(() => false)) await prefBtn.click().catch(() => {});
      if (await allBtn.isVisible().catch(() => false)) await allBtn.click().catch(() => {});
    });
  }
});

// ===========================================================================
// PAGE: /listings/templates  (CategoryTemplates)
// Elements: 新建类目 button, 用此模板新建 SKU button (per row), 编辑 button
// ===========================================================================
test.describe.serial('M1 /listings/templates', () => {
  for (let i = 1; i <= ITER; i++) {
    test(`templates iter ${i}`, async ({ page }) => {
      await login(page);
      await gotoHash(page, '/listings/templates');
      await probeVisible(page, 'text=类目模板', 'tpl.title');
      await probeVisible(page, 'button:has-text("新建类目")', 'tpl.newBtn');
      await probeVisible(page, '.tpl-card', 'tpl.card');
      await probeVisible(page, 'button:has-text("用此模板新建 SKU")', 'tpl.useBtn');
      await probeVisible(page, 'button:has-text("编辑")', 'tpl.editBtn');
    });
  }
});

// ===========================================================================
// PAGE: /listings/category-pains  (CategoryPains)
// Elements: 类目 filter select, table 推 M1 button
// ===========================================================================
test.describe.serial('M1 /listings/category-pains', () => {
  for (let i = 1; i <= ITER; i++) {
    test(`category-pains iter ${i}`, async ({ page }) => {
      await login(page);
      await gotoHash(page, '/listings/category-pains');
      await probeVisible(page, 'text=类目共性痛点', 'pains.title');
      await probeVisible(page, '.el-select', 'pains.select');
      await probeVisible(page, '.el-table', 'pains.table');
      const pushBtn = page.locator('button:has-text("推 M1")').first();
      const has = await pushBtn.isVisible().catch(() => false);
      expect.soft(has, 'pains.pushBtn').toBeTruthy();
    });
  }
});

// ===========================================================================
// PAGE: /listings/keyword-heatmap  (KeywordHeatmap)
// Elements: heatmap table, header tag
// ===========================================================================
test.describe.serial('M1 /listings/keyword-heatmap', () => {
  for (let i = 1; i <= ITER; i++) {
    test(`keyword-heatmap iter ${i}`, async ({ page }) => {
      await login(page);
      await gotoHash(page, '/listings/keyword-heatmap');
      await probeVisible(page, 'text=关键词覆盖热力图', 'heat.title');
      await probeVisible(page, 'table.heatmap', 'heat.table');
      await probeVisible(page, '.suggest', 'heat.suggest');
    });
  }
});

// ===========================================================================
// PAGE: /listings/multi-locale  (MultiLocale)
// Elements: 扫描更新 button (header), 从母版同步 button, locale table actions
// ===========================================================================
test.describe.serial('M1 /listings/multi-locale', () => {
  for (let i = 1; i <= ITER; i++) {
    test(`multi-locale iter ${i}`, async ({ page }) => {
      await login(page);
      await gotoHash(page, '/listings/multi-locale');
      await probeVisible(page, 'text=多语言母版同步', 'ml.title');
      await probeVisible(page, 'button:has-text("扫描更新")', 'ml.scanBtn');
      await probeVisible(page, '.sku-card', 'ml.skuCard');
      await probeVisible(page, 'button:has-text("从母版同步")', 'ml.syncBtn');
      await probeVisible(page, '.el-table', 'ml.table');
    });
  }
});

// ===========================================================================
// PAGE: /listings/calibration  (ScoringCalibration)
// Elements: KPIs (4), descriptions, dimension table
// ===========================================================================
test.describe.serial('M1 /listings/calibration', () => {
  for (let i = 1; i <= ITER; i++) {
    test(`calibration iter ${i}`, async ({ page }) => {
      await login(page);
      await gotoHash(page, '/listings/calibration');
      await probeVisible(page, 'text=评分系统校准', 'cal.title');
      await probeVisible(page, '.kpi-row', 'cal.kpis');
      await probeVisible(page, 'text=Phase A · 人工标注基线', 'cal.phaseA');
      await probeVisible(page, 'text=Phase B · CVR Lift 真实验证', 'cal.phaseB');
      await probeVisible(page, '.el-table', 'cal.table');
    });
  }
});
