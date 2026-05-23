// drawer-crawl.mjs — visit each master page, find the FIRST safe-to-click
// row link, open the detail drawer, capture every tab inside the drawer,
// close the drawer, move on.
//
// SAFETY:
//   - Hard blocklist on element text: 暂停/启用/禁用/删除/修改/编辑/保存/确定/确认/提交/发布/应用/批量/...
//   - Only clicks anchors (<a>) in the FIRST data column of table rows
//   - Skips inputs / buttons / checkboxes / switches at row level
//   - Drawer close via × button, then Escape fallback
//   - All non-GET requests logged to recon-audit.log
//   - Skips any page where no safe target is found

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, existsSync, appendFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, 'output');
const DRAWER_DIR = join(OUT, 'drawers');
mkdirSync(DRAWER_DIR, { recursive: true });

// All ad-data pages where row-click likely opens a detail drawer
const PAGES = [
  // Top-level master pages
  '/home',
  '/ad_report/profile/campaign/index',          // 全部活动
  '/ad_report/campaign/index/index',            // SP
  '/ad_report/headline/index/index',            // SB
  '/ad_report/sd/index/index',                  // SD
  '/ad_report/st/index/index',                  // ST
  '/ad_report/portfolio/profile/list',          // Portfolios
  '/ad_report/analyze/sku/index',               // 广告商品
  // Cross-master pages (ad-group / ad / keyword / target)
  '/ad_report/ad_group/index/index',
  '/ad_report/ad/index/index',
  '/ad_report/keyword/profile/index',           // user just had drawer here
  '/ad_report/target/auto/index',
  '/ad_report/target/profile/index',
  '/ad_report/ad_group/profile/index',
  '/ad_report/ad/profile/index',
  '/ad_report/placement/profile/index',
  '/ad_report/keyword_search_term/profile/index',
  '/ad_report/search_term_st/profile/index',
  // SB sub-master
  '/ad_report/headline/ad_group/list',
  '/ad_report/headline/all_ad_group/list',
  '/ad_report/headline/all_product_ad/list',
  '/ad_report/headline/all_placement/index',
  '/ad_report/headline/headline_all_keyword/index',
  '/ad_report/headline/all_target/index',
  '/ad_report/headline/all_keyword_search_term/index',
  '/ad_report/headline/all_purchased_asin/list',
  // SD sub-master
  '/ad_report/sd/ad_group/index',
  '/ad_report/sd/all_ad_group/index',
  '/ad_report/sd/all_product_ad/index',
  '/ad_report/sd/all_target/index',
  '/ad_report/sd/all_audience/index',
  '/ad_report/sd/all_match_target/index',
  // Analyze pages
  '/ad_report/analyze/company/index',
  '/ad_report/analyze/keyword/index',
  '/ad_report/analyze/search_term/index',
  '/ad_report/analyze/sku_campaign/index',
  '/ad_report/analyze/sku_target/index',
  '/ad_report/analyze/sku_search_term/index',
  '/ad_report/analyze/country/index',
  '/ad_report/analyze/ad_type/index',
  '/ad_report/analyze/placement/index',
];

// HARD blocklist — never click anything whose text or class hints at write
const TEXT_BLOCKLIST = /(暂停|启用|禁用|删除|修改|编辑|保存|确定|确认|提交|发布|应用|批量|执行|创建|新建|添加|关闭|结束|导出|导入|上传|下载|调整|变更|抢位|预警|规则|开始|启动|开启|应用规则|应用策略|生效|失效|定价|出价|改价|调价|改预算|调预算|生成|复制)/;
const CLASS_BLOCKLIST = /(btn-danger|btn-warning|delete|pause|enable|disable|switch|action|edit-btn|update-btn)/i;

const TAB_SELECTORS = [
  'a[role="tab"]',
  'a[data-toggle="tab"]',
  '.nav-tabs > li > a',
  '.nav-tabs li.tab a',
];

const DRAWER_SELECTORS = [
  '.el-drawer:not([style*="display: none"])',
  '.el-dialog__wrapper:not([style*="display: none"])',
  '.modal[style*="display: block"]',
  '[role="dialog"][aria-hidden="false"]',
  '[role="dialog"]:not([aria-hidden="true"])',
];

const RISKY_RE = /\/(?:update|delete|create|save|submit|publish|apply|set|toggle|enable|disable|pause|resume|adjust|modify|edit|bulk[-_]?(?:create|update|delete)|sync|trigger|execute|run|launch)\b/i;

// ----- connect -----
const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const lxPage = ctx.pages().find((p) => /^https?:\/\/ads\./.test(p.url() || ''));
if (!lxPage) { console.error('no ads tab found'); process.exit(2); }
console.log('[drawer] active tab:', lxPage.url());

let profileId = null;
try { profileId = new URL(lxPage.url()).searchParams.get('profile_id'); } catch {}
console.log('[drawer] profile_id:', profileId);

// ----- audit -----
let auditCount = 0, riskyCount = 0;
lxPage.on('request', (req) => {
  const m = req.method();
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return;
  const url = req.url();
  const risky = RISKY_RE.test(url) && !/\/(?:list|get|info|fetch|query|search|read)\b/i.test(url);
  if (risky) riskyCount++;
  auditCount++;
  const line = `${new Date().toISOString()} ${risky ? 'RISKY' : 'note '} ${m} ${url}`;
  try { appendFileSync(join(OUT, 'recon-audit.log'), line + '\n'); } catch {}
  if (risky) console.warn(`[drawer] ⚠ RISKY: ${m} ${url}`);
});

// ----- helpers -----
function slugify(s) { return (s || '').replace(/^\//, '').replace(/[^\w一-龥]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'idx'; }

async function snap(page, dir, label) {
  const base = slugify(label);
  try {
    await page.screenshot({ path: join(dir, base + '.png'), fullPage: true });
    writeFileSync(join(dir, base + '.html'), await page.content());
  } catch (e) {
    console.warn('  snap fail:', e.message?.slice(0, 80));
  }
}

async function closeAnyDrawer(page) {
  // 1) Click × button if present
  await page.evaluate((sels) => {
    const all = [];
    for (const s of sels) document.querySelectorAll(s).forEach((d) => all.push(d));
    const visible = all.filter((d) => {
      const r = d.getBoundingClientRect();
      return r.width > 200 && r.height > 200 && window.getComputedStyle(d).display !== 'none';
    });
    for (const d of visible) {
      const close = d.querySelector(
        '.el-drawer__close-btn, .el-dialog__headerbtn, button.close, [data-dismiss="modal"], [aria-label="Close"], .modal-header .close, .close',
      );
      if (close) try { close.click(); } catch {}
    }
  }, DRAWER_SELECTORS);
  await page.waitForTimeout(500);
  // 2) Escape fallback
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(500);
}

// Find a SAFE first-row click target. Returns CSS-attribute selector for the chosen element, or null.
async function findFirstSafeRowLink(page) {
  return await page.evaluate(({ textBlock, classBlock }) => {
    function isSafe(el) {
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (!text || text.length < 1 || text.length > 100) return false;
      if (new RegExp(textBlock).test(text)) return false;
      if (new RegExp(classBlock).test(el.className || '')) return false;
      const tag = el.tagName.toLowerCase();
      if (tag === 'button' || tag === 'input' || tag === 'select') return false;
      // Must be visible
      const r = el.getBoundingClientRect();
      if (r.width < 5 || r.height < 5) return false;
      // Must not be inside a confirm dialog
      if (el.closest('.el-message-box, .el-dialog, .modal')) return false;
      return true;
    }

    // Strategy 1: Look for anchors with data-toggle="modal" (most explicit)
    for (const a of document.querySelectorAll('a[data-toggle="modal"], a[data-target^="#"]')) {
      if (!isSafe(a)) continue;
      // Skip if inside header / nav
      if (a.closest('header, nav, .nav, .navbar')) continue;
      a.setAttribute('data-recon-click', 'modal-trigger');
      return { sel: '[data-recon-click="modal-trigger"]', text: a.textContent.trim().slice(0, 40), via: 'data-toggle' };
    }

    // Strategy 2: First column anchor in first tbody row of the largest table
    const tables = [...document.querySelectorAll('table')].sort((a, b) => {
      return (b.offsetWidth * b.offsetHeight) - (a.offsetWidth * a.offsetHeight);
    });
    for (const table of tables.slice(0, 3)) {
      const tbody = table.querySelector('tbody');
      if (!tbody) continue;
      const firstRow = tbody.querySelector('tr');
      if (!firstRow) continue;
      // Look for the first <td> that contains an <a>
      const cells = firstRow.querySelectorAll('td');
      for (const td of cells) {
        const anchor = td.querySelector('a:not([data-toggle="dropdown"])');
        if (!anchor || !isSafe(anchor)) continue;
        const text = anchor.textContent.trim();
        // Skip if it looks like a number page (e.g., "1")
        if (/^\d{1,2}$/.test(text)) continue;
        anchor.setAttribute('data-recon-click', 'row-anchor');
        return { sel: '[data-recon-click="row-anchor"]', text: text.slice(0, 40), via: 'first-cell-anchor' };
      }
    }

    return null;
  }, { textBlock: TEXT_BLOCKLIST.source, classBlock: CLASS_BLOCKLIST.source });
}

async function findOpenDrawer(page) {
  return await page.evaluate((sels) => {
    const all = [];
    for (const s of sels) document.querySelectorAll(s).forEach((d) => all.push({ el: d, sel: s }));
    const visible = all.filter(({ el }) => {
      const r = el.getBoundingClientRect();
      const cs = window.getComputedStyle(el);
      return r.width > 300 && r.height > 200 && cs.display !== 'none' && cs.visibility !== 'hidden';
    });
    if (visible.length === 0) return null;
    // Pick largest
    visible.sort((a, b) => (b.el.getBoundingClientRect().width * b.el.getBoundingClientRect().height) - (a.el.getBoundingClientRect().width * a.el.getBoundingClientRect().height));
    const { el, sel } = visible[0];
    const title = el.querySelector('.el-drawer__title, .el-dialog__title, .modal-title, [class*="header"] [class*="title"]')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 60) || '';
    const tabs = [];
    for (const t of el.querySelectorAll('a[role="tab"], a[data-toggle="tab"], .nav-tabs > li > a')) {
      const text = (t.textContent || '').replace(/\s+/g, ' ').trim();
      if (text && !new RegExp(TEXT_BLOCKLIST_SRC).test(text)) {
        tabs.push(text);
      }
    }
    // Mark drawer for later querying
    el.setAttribute('data-recon-drawer', '1');
    return { sel: '[data-recon-drawer="1"]', title, tabs };
  }, DRAWER_SELECTORS).catch(() => null);
}
// Patch — we can't pass regex sources inline to evaluate cleanly; redefine below.

async function findOpenDrawerV2(page) {
  const textBlockSrc = TEXT_BLOCKLIST.source;
  return await page.evaluate(({ sels, textBlockSrc }) => {
    const all = [];
    for (const s of sels) document.querySelectorAll(s).forEach((d) => all.push({ el: d, sel: s }));
    const visible = all.filter(({ el }) => {
      const r = el.getBoundingClientRect();
      const cs = window.getComputedStyle(el);
      return r.width > 300 && r.height > 200 && cs.display !== 'none' && cs.visibility !== 'hidden';
    });
    if (visible.length === 0) return null;
    visible.sort((a, b) =>
      (b.el.getBoundingClientRect().width * b.el.getBoundingClientRect().height) -
      (a.el.getBoundingClientRect().width * a.el.getBoundingClientRect().height));
    const { el, sel } = visible[0];
    const title = el.querySelector('.el-drawer__title, .el-dialog__title, .modal-title, [class*="header"] [class*="title"]')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 60) || '';
    const re = new RegExp(textBlockSrc);
    const tabs = [];
    for (const t of el.querySelectorAll('a[role="tab"], a[data-toggle="tab"], .nav-tabs > li > a')) {
      const text = (t.textContent || '').replace(/\s+/g, ' ').trim();
      if (text && !re.test(text)) tabs.push(text);
    }
    el.setAttribute('data-recon-drawer', '1');
    return { sel: '[data-recon-drawer="1"]', title, tabs };
  }, { sels: DRAWER_SELECTORS, textBlockSrc });
}

async function clickDrawerTab(page, tabText) {
  return await page.evaluate((text) => {
    const drawer = document.querySelector('[data-recon-drawer="1"]');
    if (!drawer) return false;
    for (const t of drawer.querySelectorAll('a[role="tab"], a[data-toggle="tab"], .nav-tabs > li > a')) {
      const tt = (t.textContent || '').replace(/\s+/g, ' ').trim();
      if (tt === text) { t.click(); return true; }
    }
    return false;
  }, tabText);
}

// ----- per-page workflow -----
async function processPage(routePath) {
  const slug = slugify(routePath);
  const dir = join(DRAWER_DIR, slug);
  if (existsSync(join(dir, 'done.json'))) {
    console.log(`[drawer] skip (already done): ${routePath}`);
    return;
  }
  mkdirSync(dir, { recursive: true });

  console.log(`\n[drawer] === ${routePath} ===`);

  // 1) Close any lingering drawer first
  await closeAnyDrawer(lxPage);

  // 2) Navigate to master page
  const url = new URL(routePath, lxPage.url());
  if (profileId && !url.searchParams.has('profile_id')) url.searchParams.set('profile_id', profileId);
  try {
    await lxPage.goto(url.toString(), { waitUntil: 'networkidle', timeout: 30000 }).catch(() => null);
    await lxPage.waitForTimeout(3500);
  } catch (e) {
    console.warn('  goto failed:', e.message?.slice(0, 80));
    writeFileSync(join(dir, 'error.txt'), String(e?.stack || e));
    return;
  }
  await snap(lxPage, dir, '00_master');

  // 3) Find a safe row-link
  const target = await findFirstSafeRowLink(lxPage);
  if (!target) {
    console.log('  no safe row target found, skipping');
    writeFileSync(join(dir, 'done.json'), JSON.stringify({ route: routePath, tabsCaptured: 0, reason: 'no_safe_target' }));
    return;
  }
  console.log(`  click target: "${target.text}" (via ${target.via})`);

  // 4) Click it
  try {
    await lxPage.click(target.sel, { timeout: 5000 });
    await lxPage.waitForTimeout(3000);
  } catch (e) {
    console.warn('  click failed:', e.message?.slice(0, 80));
    writeFileSync(join(dir, 'done.json'), JSON.stringify({ route: routePath, tabsCaptured: 0, reason: 'click_failed' }));
    return;
  }

  // 5) Detect drawer
  const drawer = await findOpenDrawerV2(lxPage);
  if (!drawer) {
    console.log('  ⚠ no drawer opened after click (page navigated? popup blocked?)');
    await snap(lxPage, dir, '01_after_click_no_drawer');
    writeFileSync(join(dir, 'done.json'), JSON.stringify({ route: routePath, target, tabsCaptured: 0, reason: 'no_drawer_opened' }));
    await closeAnyDrawer(lxPage);
    return;
  }
  console.log(`  drawer "${drawer.title}" with ${drawer.tabs.length} tabs: [${drawer.tabs.join(', ')}]`);

  // 6) Capture drawer initial
  await snap(lxPage, dir, '01_drawer');

  // 7) Click each drawer tab + capture
  const captured = [];
  for (let i = 0; i < drawer.tabs.length; i++) {
    const t = drawer.tabs[i];
    try {
      const ok = await clickDrawerTab(lxPage, t);
      if (!ok) { console.log(`  skip tab "${t}" (not clickable)`); continue; }
      await lxPage.waitForTimeout(2500);
      await snap(lxPage, dir, `tab_${String(i + 1).padStart(2, '0')}_${t}`);
      captured.push(t);
      console.log(`    ✓ tab ${t}`);
    } catch (e) {
      console.log(`    ✗ tab ${t}: ${e.message?.slice(0, 50)}`);
    }
  }

  // 8) Close
  await closeAnyDrawer(lxPage);

  writeFileSync(join(dir, 'done.json'), JSON.stringify({
    route: routePath,
    target: { text: target.text, via: target.via },
    drawer: { title: drawer.title, tabs: drawer.tabs },
    capturedTabs: captured,
    ts: new Date().toISOString(),
  }, null, 2));
}

// ----- main -----
console.log(`[drawer] will process ${PAGES.length} pages`);
const t0 = Date.now();
let processed = 0;
for (const route of PAGES) {
  try { await processPage(route); processed++; }
  catch (e) { console.error('  fatal:', route, e.message); }
  await lxPage.waitForTimeout(1500);
}

console.log(`\n[drawer] all done in ${Math.round((Date.now() - t0) / 1000)}s.`);
console.log(`[drawer] processed=${processed}/${PAGES.length}  audit=${auditCount} non-GET  RISKY=${riskyCount}`);
console.log('[drawer] outputs:', DRAWER_DIR);
process.exit(0);
