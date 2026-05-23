// Batch 2 — crawl the remaining 38 detail routes discovered in DOM but not yet
// captured. Re-uses the deep-detail tab-clicking logic with the same safety filters.

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, existsSync, readFileSync, appendFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, 'output');
const DEEP = join(OUT, 'deep');

// Load remaining detail routes (excluding already-crawled ones)
const detail = JSON.parse(readFileSync(join(OUT, 'detail-routes.json'), 'utf-8'));
const doneSet = new Set();
for (const slug of (await import('node:fs')).readdirSync(DEEP)) doneSet.add(slug);
function slugify(p) { return p.replace(/^\//, '').replace(/[^\w]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 100) || 'idx'; }
const ROUTES = detail.newRoutes.filter((r) => !doneSet.has(slugify(r.path))).map((r) => r.path);
console.log('[batch2] will crawl', ROUTES.length, 'remaining detail routes');

const TAB_SELECTORS = [
  'a[role="tab"]', 'a[data-toggle="tab"]', '.nav-tabs > li > a', '.nav-tabs li.tab a', '[role="tab"]',
  '.el-tabs__item', '.ant-tabs-tab', '.arco-tabs-tab', '.el-radio-button__inner', '.el-segmented__item',
];
const BLOCK_RE = /^\s*(暂停|启用|禁用|删除|修改|编辑|保存|确定|确认|提交|发布|应用|批量|执行|创建|新建|添加|关闭|结束|导出|导入|上传|下载|调整|变更|预警|规则|开始|启动|开启)\s*$/;
const RISKY_RE = /\/(?:update|delete|create|save|submit|publish|apply|set|toggle|enable|disable|pause|resume|adjust|modify|edit|bulk[-_]?(?:create|update|delete)|sync|trigger|execute|run|launch)\b/i;

const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const lxPage = ctx.pages().find((p) => /^https?:\/\/ads\./i.test(p.url() || ''));
if (!lxPage) { console.error('no ads tab'); process.exit(2); }

let profileId = null;
try { profileId = new URL(lxPage.url()).searchParams.get('profile_id'); } catch {}
console.log('[batch2] profile_id:', profileId);

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
  if (risky) console.warn(`[batch2] ⚠ RISKY: ${m} ${url}`);
});

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
  }, { sels: TAB_SELECTORS, blockRe: BLOCK_RE.source });
}

async function snap(page, dir, label) {
  const base = slugify(label);
  try {
    await page.screenshot({ path: join(dir, base + '.png'), fullPage: true });
    writeFileSync(join(dir, base + '.html'), await page.content());
  } catch (e) { console.warn('  snap fail:', e.message); }
}

async function crawl(routePath) {
  const slug = slugify(routePath);
  const dir = join(DEEP, slug);
  mkdirSync(dir, { recursive: true });
  if (existsSync(join(dir, 'done.json'))) { console.log(`[batch2] skip ${routePath}`); return; }

  console.log(`\n[batch2] === ${routePath} ===`);
  const before = auditCount;
  const url = new URL(routePath, lxPage.url());
  if (profileId && !url.searchParams.has('profile_id')) url.searchParams.set('profile_id', profileId);

  try {
    await lxPage.goto(url.toString(), { waitUntil: 'networkidle', timeout: 30000 }).catch(() => null);
    await lxPage.waitForTimeout(4000);
  } catch (e) { writeFileSync(join(dir, 'error.txt'), String(e?.stack || e)); return; }

  await snap(lxPage, dir, '00_initial');
  const tabs = await findTabs(lxPage);
  console.log(`[batch2] found ${tabs.length} tabs`);
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
      }, { sel: t.selector, text: t.text, blockRe: BLOCK_RE.source, isAuth: !!t.isAuthTab });
      if (!ok) { console.log(`  skip ${label}`); continue; }
      await lxPage.waitForTimeout(3500);
      await snap(lxPage, dir, label);
      clicked.push(label);
      console.log(`  ✓ ${label}`);
    } catch (e) { console.log(`  ✗ ${label}: ${e.message.slice(0, 50)}`); }
  }

  writeFileSync(join(dir, 'done.json'), JSON.stringify({
    route: routePath, profileId, tabsFound: tabs.length, tabsClicked: clicked.length,
    netEvents: auditCount - before, ts: new Date().toISOString(),
  }, null, 2));
  console.log(`[batch2] === done ${clicked.length}/${tabs.length} tabs ===`);
  await lxPage.waitForTimeout(2500);
}

for (const r of ROUTES) {
  try { await crawl(r); } catch (e) { console.error('  fatal:', r, e.message); }
}

console.log(`\n[batch2] all done. audit total: ${auditCount}, RISKY: ${riskyCount}`);
process.exit(0);
