// Deep crawl of DETAIL routes — the 5th-layer pages reached by clicking into
// rows from the master pages. We add ?profile_id= from the current Chrome tab
// when the path requires it.

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, existsSync, readFileSync, appendFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, 'output');
const DEEP = join(OUT, 'deep');
mkdirSync(DEEP, { recursive: true });

// High-value detail routes, hand-picked from discovery output.
// Most need profile_id — we'll inject from current tab's URL.
const DETAIL_ROUTES = [
  '/ad_report/keyword/profile/index',         // user is on this
  '/ad_report/ad_group/index/index',          // master Ad-Group view (most-linked)
  '/ad_report/ad_group/profile/index',
  '/ad_report/target/auto/index',
  '/ad_report/target/profile/index',
  '/ad_report/keyword_search_term/profile/index',
  '/ad_report/search_term_st/profile/index',
  '/ad_report/ad/profile/index',
  '/ad_report/placement/profile/index',
  '/ad_report/negative_keyword/profile/list',
  '/ad_report/negative_target/profile/list',
  '/ad_report/campaign/portfolio/one',
  '/ad_report/profile/index/setting',
  '/ad_report/rule_pro/index/objects',
  '/ad_report/headline/all_ad_group/list',
  '/ad_report/headline/all_product_ad/list',
  '/ad_report/headline/headline_all_keyword/index',
  '/ad_report/headline/all_target/index',
  '/ad_report/sd/all_ad_group/index',
  '/ad_report/sd/all_audience/index',
];

const TAB_SELECTORS = [
  'a[role="tab"]', 'a[data-toggle="tab"]', '.nav-tabs > li > a', '.nav-tabs li.tab a', '[role="tab"]',
  '.el-tabs__item', '.ant-tabs-tab', '.arco-tabs-tab', '.el-radio-button__inner', '.el-segmented__item',
];
const BLOCKLIST_TEXT_RE = /^\s*(暂停|启用|禁用|删除|修改|编辑|保存|确定|确认|提交|发布|应用|批量|执行|创建|新建|添加|关闭|结束|导出|导入|上传|下载|调整|变更|预警|规则|开始|启动|开启|应用规则|应用策略|执行规则)\s*$/;
const RISKY_RE = /\/(?:update|delete|create|save|submit|publish|apply|set|toggle|enable|disable|pause|resume|adjust|modify|edit|bulk[-_]?(?:create|update|delete)|sync|trigger|execute|run|launch)\b/i;

const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const lxPage = ctx.pages().find((p) => /^https?:\/\/ads\./i.test(p.url() || ''));
if (!lxPage) { console.error('no ads tab'); process.exit(2); }
console.log('[detail] active tab:', lxPage.url());

// Extract profile_id from current URL (if any)
let profileId = null;
try {
  const u = new URL(lxPage.url());
  profileId = u.searchParams.get('profile_id');
} catch {}
console.log('[detail] detected profile_id:', profileId);

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
  if (risky) console.warn(`[detail] ⚠ RISKY: ${m} ${url}`);
});

function slugify(s) { return (s || '').replace(/^\//, '').replace(/[^\w]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 100) || 'idx'; }

async function findTabs(page) {
  return await page.evaluate(({ sels, blockRe }) => {
    const seen = new Set(); const out = [];
    for (const sel of sels) {
      let nodes; try { nodes = document.querySelectorAll(sel); } catch { continue; }
      for (const el of nodes) {
        const text = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 50);
        if (!text || new RegExp(blockRe).test(text)) continue;
        const role = el.getAttribute('role') || '';
        const toggle = el.getAttribute('data-toggle') || '';
        const cls = el.className || '';
        const isAuth = role === 'tab' || toggle === 'tab';
        const looksLikeTab = isAuth || /\b(nav-tabs|tab__item|tabs-tab|tabs__nav)\b/i.test(cls) || /tab|segmented|radio-button/i.test(sel + ' ' + cls);
        if (!looksLikeTab) continue;
        if (!isAuth) { const r = el.getBoundingClientRect(); if (r.width < 5 || r.height < 5) continue; }
        const rect = el.getBoundingClientRect();
        const key = `${text}@${Math.round(rect.x)},${Math.round(rect.y)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ selector: sel, text, isAuthTab: isAuth });
      }
    }
    return out;
  }, { sels: TAB_SELECTORS, blockRe: BLOCKLIST_TEXT_RE.source });
}

async function snapshot(page, dir, label) {
  const base = slugify(label);
  try {
    await page.screenshot({ path: join(dir, base + '.png'), fullPage: true });
    writeFileSync(join(dir, base + '.html'), await page.content());
  } catch (e) { console.warn('  snap fail:', label, e.message); }
}

async function deepCrawl(routePath) {
  const slug = slugify(routePath);
  const dir = join(DEEP, slug);
  mkdirSync(dir, { recursive: true });
  if (existsSync(join(dir, 'done.json'))) { console.log(`[detail] skip ${routePath}`); return; }

  console.log(`\n[detail] === ${routePath} ===`);
  const before = auditCount;

  const url = new URL(routePath, lxPage.url());
  if (profileId && !url.searchParams.has('profile_id')) url.searchParams.set('profile_id', profileId);

  try {
    await lxPage.goto(url.toString(), { waitUntil: 'networkidle', timeout: 30000 }).catch(() => null);
    await lxPage.waitForTimeout(4000);
  } catch (e) {
    writeFileSync(join(dir, 'error.txt'), String(e?.stack || e));
    return;
  }
  await snapshot(lxPage, dir, '00_initial');

  const tabs = await findTabs(lxPage);
  console.log(`[detail] found ${tabs.length} tabs`);
  writeFileSync(join(dir, 'tabs.json'), JSON.stringify(tabs, null, 2));

  const clicked = [];
  for (let i = 0; i < tabs.length; i++) {
    const t = tabs[i];
    const label = `${String(i + 1).padStart(2, '0')}_${t.text}`;
    try {
      const ok = await lxPage.evaluate(({ sel, text, blockRe, isAuth }) => {
        const nodes = document.querySelectorAll(sel);
        const re = new RegExp(blockRe);
        for (const el of nodes) {
          const t = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 50);
          if (t === text && !re.test(t)) {
            if (isAuth) { el.click(); return true; }
            const r = el.getBoundingClientRect();
            if (r.width > 4 && r.height > 4) { el.click(); return true; }
          }
        }
        return false;
      }, { sel: t.selector, text: t.text, blockRe: BLOCKLIST_TEXT_RE.source, isAuth: !!t.isAuthTab });
      if (!ok) { console.log(`  skip tab ${label}`); continue; }
      await lxPage.waitForTimeout(4000);
      await snapshot(lxPage, dir, label);
      clicked.push(label);
      console.log(`  ✓ tab ${label}`);
    } catch (e) {
      console.log(`  ✗ tab ${label}: ${e.message.slice(0, 60)}`);
    }
  }

  writeFileSync(join(dir, 'done.json'), JSON.stringify({
    route: routePath,
    profileId,
    tabsFound: tabs.length,
    tabsClicked: clicked.length,
    netEvents: auditCount - before,
    ts: new Date().toISOString(),
  }, null, 2));
  console.log(`[detail] === done ${clicked.length}/${tabs.length} tabs ===`);
  await lxPage.waitForTimeout(3000);
}

for (const r of DETAIL_ROUTES) {
  try { await deepCrawl(r); }
  catch (e) { console.error('  fatal:', r, e.message); }
}

console.log(`\n[detail] all done. audit total: ${auditCount}, RISKY: ${riskyCount}`);
process.exit(0);
