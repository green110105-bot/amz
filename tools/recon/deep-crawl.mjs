// Deep crawl of CORE Amazon ad management pages.
// Per page: navigate, find tabs / radio-button groups, click each, screenshot + DOM + network.
// SAFETY:
//   - text BLOCKLIST never clicked (write-like words)
//   - only known safe selectors (tab UI components, not arbitrary buttons)
//   - polite delays
//   - same RISKY auditor as broad crawl

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, existsSync, appendFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, 'output');
const DEEP_DIR = join(OUT, 'deep');
mkdirSync(DEEP_DIR, { recursive: true });

// CLI args
const args = Object.fromEntries(process.argv.slice(2).flatMap((a, i, arr) => {
  if (!a.startsWith('--')) return [];
  const k = a.slice(2);
  const v = arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true;
  return [[k, v]];
}));
const TAB_WAIT_MS = (args['tab-wait'] ? Number(args['tab-wait']) : 4) * 1000;
const ROUTE_LIST  = args.routes ? args.routes.split(',') : null;

// Core Amazon ad management pages, ordered by importance
const DEFAULT_ROUTES = [
  '/home',
  '/ad_report/profile/campaign/index',     // 全部活动
  '/ad_report/campaign/index/index',       // SP广告
  '/ad_report/headline/index/index',       // SB广告
  '/ad_report/sd/index/index',             // SD广告
  '/ad_report/st/index/index',             // ST广告
  '/ad_report/portfolio/profile/list',     // 广告组合
  '/ad_report/analyze/sku/index',          // 广告商品
];

const ROUTES = ROUTE_LIST || DEFAULT_ROUTES;

// SAFETY: never click any element whose text matches this
const BLOCKLIST_TEXT_RE = /^\s*(暂停|启用|禁用|删除|修改|编辑|保存|确定|确认|提交|发布|应用|批量|执行|创建|新建|添加|关闭|结束|导出|导入|上传|下载|调整|变更|预警|规则|开始|启动|开启|应用规则|应用策略|执行|执行规则)\s*$/;
const RISKY_RE = /\/(?:update|delete|create|save|submit|publish|apply|set|toggle|enable|disable|pause|resume|adjust|modify|edit|bulk[-_]?(?:create|update|delete)|sync|trigger|execute|run|launch)\b/i;

// Tab-like selectors that are SAFE to click (purely UI state, no backend writes).
// Lingxing uses old-school Bootstrap nav-tabs, not modern Vue components.
const TAB_SELECTORS = [
  'a[role="tab"]',
  'a[data-toggle="tab"]',
  '.nav-tabs > li > a',
  '.nav-tabs li.tab a',
  '[role="tab"]',
  // Keep modern selectors too for forward-compat
  '.el-tabs__item',
  '.ant-tabs-tab',
  '.arco-tabs-tab',
  '.el-radio-button__inner',
  '.el-segmented__item',
];

// ----------------- Connect to debug Chrome -----------------
let browser;
try { browser = await chromium.connectOverCDP('http://localhost:9222'); }
catch { console.error('[deep] cannot connect to debug Chrome'); process.exit(1); }
const ctx = browser.contexts()[0];
const lxPage = ctx.pages().find((p) => /^https?:\/\/ads\./i.test(p.url() || ''))
            || ctx.pages().find((p) => /lingxing/i.test(p.url() || ''));
if (!lxPage) { console.error('[deep] no ads tab'); process.exit(2); }
console.log('[deep] active tab:', lxPage.url());

const SAFETY_LOG = join(OUT, 'recon-audit.log');
const ABORT_LOG  = join(OUT, 'aborts.log');

// Audit non-GET requests
let auditCount = 0, riskyCount = 0;
lxPage.on('request', (req) => {
  const m = req.method();
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return;
  const url = req.url();
  const risky = RISKY_RE.test(url) && !/\/(?:list|get|info|fetch|query|search|read)\b/i.test(url);
  if (risky) riskyCount++;
  auditCount++;
  const line = `${new Date().toISOString()} ${risky ? 'RISKY' : 'note '} ${m} ${url}`;
  try { appendFileSync(SAFETY_LOG, line + '\n'); } catch {}
  if (risky) console.warn(`[deep] ⚠ RISKY (not blocked): ${m} ${url}`);
});

// ----------------- Per-route deep crawl -----------------
function slugify(s) { return (s || '').replace(/^\//, '').replace(/[^\w]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 100) || 'index'; }

async function findTabs(page) {
  return await page.evaluate(({ selectors, blockRe }) => {
    const seen = new Set();
    const out = [];
    for (const sel of selectors) {
      let nodes;
      try { nodes = document.querySelectorAll(sel); } catch { continue; }
      for (const el of nodes) {
        const text = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 50);
        if (!text) continue;
        if (new RegExp(blockRe).test(text)) continue;
        const role = el.getAttribute('role') || '';
        const toggle = el.getAttribute('data-toggle') || '';
        const cls = el.className || '';
        // Trust strong tab markers immediately. Otherwise need class hint.
        const isAuthTab = role === 'tab' || toggle === 'tab';
        const looksLikeTab = isAuthTab
          || /\b(nav-tabs|tab__item|tabs-tab|tabs__nav)\b/i.test(cls)
          || /tab|segmented|radio-button/i.test(sel + ' ' + cls);
        if (!looksLikeTab) continue;
        // Visibility filter ONLY for fuzzy matches (class-based). Strong markers like
        // role=tab can have 0×0 bounding box if their parent panel is currently hidden,
        // but clicking still works (Bootstrap toggles display).
        if (!isAuthTab) {
          const rect = el.getBoundingClientRect();
          if (rect.width < 5 || rect.height < 5) continue;
        }
        const rect = el.getBoundingClientRect();
        const key = `${text}@${Math.round(rect.x)},${Math.round(rect.y)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ selector: sel, text, x: rect.x, y: rect.y, isAuthTab });
      }
    }
    return out;
  }, { selectors: TAB_SELECTORS, blockRe: BLOCKLIST_TEXT_RE.source });
}

async function snapshot(page, dir, label, since) {
  const baseName = slugify(label);
  try {
    await page.screenshot({ path: join(dir, baseName + '.png'), fullPage: true });
    const html = await page.content();
    writeFileSync(join(dir, baseName + '.html'), html);
  } catch (e) {
    console.warn('[deep]   snapshot fail:', label, e.message);
  }
}

async function deepCrawlRoute(routePath) {
  const slug = slugify(routePath);
  const dir = join(DEEP_DIR, slug);
  mkdirSync(dir, { recursive: true });

  // Skip if already deep-crawled
  if (existsSync(join(dir, 'done.json'))) {
    console.log(`[deep] skip (already done): ${routePath}`);
    return;
  }

  console.log(`\n[deep] === ${routePath} ===`);
  const before = auditCount;

  try {
    const targetUrl = new URL(routePath, lxPage.url()).toString();
    await lxPage.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => null);
    await lxPage.waitForTimeout(TAB_WAIT_MS);
  } catch (e) {
    console.warn('[deep] goto failed:', e.message);
    writeFileSync(join(dir, 'error.txt'), String(e?.stack || e));
    return;
  }

  // Initial state
  await snapshot(lxPage, dir, '00_initial');

  // Find tabs
  const tabs = await findTabs(lxPage);
  console.log(`[deep] found ${tabs.length} clickable tabs`);
  writeFileSync(join(dir, 'tabs.json'), JSON.stringify(tabs, null, 2));

  // Click each tab in turn
  const tabReports = [];
  for (let i = 0; i < tabs.length; i++) {
    const t = tabs[i];
    const label = `${String(i + 1).padStart(2, '0')}_${t.text}`;
    const tabReqsBefore = auditCount;
    try {
      // Click by re-querying the live DOM (positions may have shifted after prior clicks).
      // For role=tab / data-toggle=tab markers we click unconditionally; for fuzzy class
      // matches we still require visibility.
      const clicked = await lxPage.evaluate(({ sel, text, blockRe, isAuthTab }) => {
        const nodes = document.querySelectorAll(sel);
        const blockRegex = new RegExp(blockRe);
        for (const el of nodes) {
          const t = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 50);
          if (t === text && !blockRegex.test(t)) {
            if (isAuthTab) { el.click(); return true; }
            const rect = el.getBoundingClientRect();
            if (rect.width > 4 && rect.height > 4) { el.click(); return true; }
          }
        }
        return false;
      }, { sel: t.selector, text: t.text, blockRe: BLOCKLIST_TEXT_RE.source, isAuthTab: !!t.isAuthTab });

      if (!clicked) { console.log(`[deep]   skip ${label} (not clickable)`); continue; }
      await lxPage.waitForTimeout(TAB_WAIT_MS);
      await snapshot(lxPage, dir, label);
      tabReports.push({ index: i + 1, text: t.text, newReqs: auditCount - tabReqsBefore });
      console.log(`[deep]   ✓ tab ${label}  +${auditCount - tabReqsBefore} net evts`);
    } catch (e) {
      console.warn(`[deep]   ✗ tab ${label}:`, e.message);
    }
  }

  const totalNewReqs = auditCount - before;
  writeFileSync(join(dir, 'done.json'), JSON.stringify({
    route: routePath,
    tabsFound: tabs.length,
    tabsClicked: tabReports.length,
    totalNetworkEvents: totalNewReqs,
    riskyNetSinceStart: riskyCount,
    ts: new Date().toISOString(),
  }, null, 2));
  console.log(`[deep] === done: ${tabReports.length}/${tabs.length} tabs, ${totalNewReqs} net evts ===`);

  // Polite delay between routes
  await lxPage.waitForTimeout(3000);
}

// ----------------- main -----------------
for (const r of ROUTES) {
  try { await deepCrawlRoute(r); }
  catch (e) {
    console.error('[deep] route fatal:', r, e.message);
    appendFileSync(ABORT_LOG, `${new Date().toISOString()} ${r} ${e.message}\n`);
  }
}

console.log(`\n[deep] all routes done. audit total: ${auditCount} non-GET, RISKY: ${riskyCount}`);
console.log('[deep] outputs in', DEEP_DIR);
process.exit(0);
