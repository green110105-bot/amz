// Full-auto recon crawl. Connects to debug Chrome on :9222, finds the Lingxing
// tab, derives the ad-module URL prefix from it, enumerates sidebar links
// (auto-expanding submenus), then for each route: visit + screenshot + DOM + HAR-like network log.
//
// Resumable: skips routes whose screenshot.png already exists.

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, existsSync, readFileSync, appendFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, 'output');
const PAGES_DIR = join(OUT, 'pages');
mkdirSync(PAGES_DIR, { recursive: true });

// ----------------- CLI args -----------------
const args = Object.fromEntries(process.argv.slice(2).flatMap((a, i, arr) => {
  if (!a.startsWith('--')) return [];
  const k = a.slice(2);
  const v = arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true;
  return [[k, v]];
}));
const LIMIT       = args.limit ? Number(args.limit) : null;
const PER_WAIT_MS = (args['per-page-wait'] ? Number(args['per-page-wait']) : 10) * 1000;
const PREFIX_HINT = args.prefix || null;
const DRY_RUN     = !!args['dry-run'];

// ----------------- Connect -----------------
console.log('[recon] connecting to Chrome on localhost:9222 …');
let browser;
try {
  browser = await chromium.connectOverCDP('http://localhost:9222');
} catch (e) {
  console.error('\n[recon] ✗ cannot connect. Run `npm run recon:open` first and keep that Chrome window open.\n');
  process.exit(1);
}

const contexts = browser.contexts();
if (contexts.length === 0) { console.error('[recon] no browser context'); process.exit(2); }
const context = contexts[0];
const pages = context.pages();
if (pages.length === 0) { console.error('[recon] no pages open in Chrome'); process.exit(2); }

// Find the ads-module tab. Prefer subdomain ads.* / advertising.* if present,
// otherwise fall back to any lingxing tab.
const lxPage =
  pages.find((p) => /^https?:\/\/(?:ads|advertising)\./i.test(p.url() || '')) ||
  pages.find((p) => /lingxing|lx[-_]?(ads|advertising)|领星/i.test(p.url() || '')) ||
  pages.find((p) => (p.url() || '').match(/^https?:\/\//));

if (!lxPage) { console.error('[recon] no usable tab found'); process.exit(2); }
console.log('[recon] active tab:', lxPage.url());

// ----------------- Derive ad-module scope -----------------
// Modern SaaS often puts each module on a dedicated subdomain. If the current
// host looks ad-specific (ads.*, advertising.*, sp.*) use HOSTNAME scope
// (any path on that host counts). Otherwise fall back to path prefix.
const currentUrl = new URL(lxPage.url());
let moduleHost = null;
let modulePrefix = '/';
if (PREFIX_HINT) {
  modulePrefix = PREFIX_HINT;
} else if (/^(?:ads|advertising|sp|sd|sb)\./i.test(currentUrl.hostname)) {
  moduleHost = currentUrl.hostname; // entire subdomain = the ads module
  modulePrefix = '/';
} else {
  const parts = currentUrl.pathname.split('/').filter(Boolean);
  modulePrefix = '/' + parts.slice(0, 2).join('/') + '/';
}
console.log('[recon] ads-module scope:',
  moduleHost ? `host=${moduleHost} (any path)` : `prefix=${modulePrefix}`);

// ===== SAFETY: install a global write-method auditor BEFORE any navigation =====
// We do NOT block anything (blocking could corrupt page state and miss data),
// but we LOG every non-GET/HEAD/OPTIONS request to a separate audit log so the
// user can review what fired during the crawl. Patterns that look like writes
// also emit a console warning in real time.
const SAFETY_LOG = join(OUT, 'recon-audit.log');
const RISKY_RE = /\/(?:update|delete|create|save|submit|publish|apply|set|toggle|enable|disable|pause|resume|adjust|modify|edit|bulk[-_]?(?:create|update|delete)|sync|trigger|execute|run|launch)\b/i;
let auditCount = 0;
let riskyCount = 0;
lxPage.on('request', (req) => {
  const m = req.method();
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return;
  const url = req.url();
  const risky = RISKY_RE.test(url);
  if (risky) riskyCount++;
  auditCount++;
  const line = `${new Date().toISOString()} ${risky ? 'RISKY' : 'note '} ${m} ${url}`;
  try { appendFileSync(SAFETY_LOG, line + '\n'); } catch {}
  if (risky) {
    console.warn(`\n[recon] ⚠ RISKY non-GET request fired: ${m} ${url}`);
    console.warn('         (logged to recon-audit.log; not blocked — review afterwards)');
  }
});

console.log('[recon] phase 1 — enumerating sidebar routes (READ-ONLY: no clicks)…');
console.log('[recon] safety audit log:', SAFETY_LOG);

await lxPage.bringToFront();

// READ-ONLY route discovery: we DO NOT click any sidebar menu to expand.
// User must manually expand the submenus in Chrome they want crawled,
// OR we extract routes from Vue/React router instance (safer).

// Step A: try to extract routes from Vue Router (zero clicks, fully read-only)
const routerRoutes = await lxPage.evaluate(() => {
  const collected = [];
  const seen = new Set();
  function walk(routes, base = '') {
    if (!Array.isArray(routes)) return;
    for (const r of routes) {
      const p = r?.path ?? r?.route ?? '';
      const full = p && p.startsWith('/') ? p : (base ? base + '/' + p : p);
      if (full && !seen.has(full)) {
        seen.add(full);
        collected.push({ path: full, name: r?.name || '', meta: r?.meta || null });
      }
      if (Array.isArray(r?.children)) walk(r.children, full);
    }
  }
  try {
    const root = document.querySelector('#app') || document.querySelector('[data-v-app]');
    const vueApp = root?.__vue_app__ || root?.__vue__?.$root?.$options?._base?.config?.globalProperties;
    const router =
      vueApp?.config?.globalProperties?.$router ||
      root?.__vue__?.$router ||
      window.__VUE_ROUTER__ ||
      null;
    if (router?.options?.routes) walk(router.options.routes);
    if (router?.getRoutes && typeof router.getRoutes === 'function') {
      for (const r of router.getRoutes()) {
        if (r?.path && !seen.has(r.path)) {
          seen.add(r.path);
          collected.push({ path: r.path, name: r?.name || '', meta: r?.meta || null });
        }
      }
    }
  } catch {}
  return collected;
});
if (routerRoutes.length) console.log(`[recon] Vue Router exposed ${routerRoutes.length} routes`);

// Step B: harvest <a href> + clickable router-link items (visible-only, no expand clicks)
const navItems = await lxPage.evaluate((prefix) => {
  const out = [];
  // Plain <a> links
  for (const a of document.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href') || '';
    const text = (a.textContent || '').trim().slice(0, 60);
    out.push({ href, text, source: 'a' });
  }
  // Vue Router links via to=
  for (const a of document.querySelectorAll('[to], [data-href], [router-link]')) {
    const href = a.getAttribute('to') || a.getAttribute('data-href') || a.getAttribute('router-link') || '';
    const text = (a.textContent || '').trim().slice(0, 60);
    out.push({ href, text, source: 'router-link' });
  }
  // Items with data-path / data-route
  for (const el of document.querySelectorAll('[data-path], [data-route]')) {
    const href = el.getAttribute('data-path') || el.getAttribute('data-route') || '';
    const text = (el.textContent || '').trim().slice(0, 60);
    out.push({ href, text, source: 'data-attr' });
  }
  // Normalize: absolute → path, drop anchors, dedupe.
  const seen = new Set();
  return out.filter((x) => {
    if (!x.href) return false;
    let p;
    try {
      p = new URL(x.href, location.href).pathname + (new URL(x.href, location.href).search || '');
    } catch { return false; }
    if (seen.has(p)) return false;
    seen.add(p);
    x.path = p;
    return true;
  });
}, modulePrefix);

// Merge Vue Router + DOM-derived routes; dedupe; filter by scope (host OR prefix)
const merged = new Map();
function inScope(p, origin) {
  if (!p) return false;
  // p might be relative (/foo) or absolute (https://x/foo). Resolve against current page.
  try {
    const abs = new URL(p, origin);
    if (moduleHost) return abs.hostname === moduleHost;
    return abs.hostname === currentUrl.hostname && abs.pathname.startsWith(modulePrefix);
  } catch { return false; }
}
const origin = lxPage.url();
for (const r of [...routerRoutes, ...navItems]) {
  if (!inScope(r.path, origin)) continue;
  let abs;
  try { abs = new URL(r.path, origin); } catch { continue; }
  const key = abs.pathname + abs.search;
  if (!merged.has(key)) merged.set(key, { path: key, text: r.text || r.name || '' });
}
const routes = [...merged.values()];

console.log(`[recon] visible nav items: ${navItems.length}, router routes: ${routerRoutes.length}, after scope-filter + dedupe: ${routes.length}`);

const routesFile = join(OUT, 'routes.json');
writeFileSync(routesFile, JSON.stringify({
  prefix: modulePrefix,
  source: 'sidebar-walk',
  count: routes.length,
  routes,
  rawNavCount: navItems.length,
  ts: new Date().toISOString(),
}, null, 2));
console.log('[recon] wrote', routesFile);

if (routes.length === 0) {
  console.error('\n[recon] ✗ 0 routes matched the prefix.');
  console.error('       Likely you are not on the ad module right now. Navigate there in Chrome and re-run.');
  console.error('       Or pass --prefix /your/ads/path/ explicitly.\n');
  process.exit(3);
}

if (DRY_RUN) {
  console.log('[recon] dry-run done; not crawling.');
  console.log('[recon] preview:');
  for (const r of routes.slice(0, 30)) console.log('   ', r.path, '·', r.text || '');
  if (routes.length > 30) console.log(`   … +${routes.length - 30} more`);
  process.exit(0);
}

// ----------------- Phase 2: crawl each route -----------------
console.log(`[recon] phase 2 — crawling ${LIMIT ? Math.min(LIMIT, routes.length) : routes.length} routes…`);
console.log('[recon] pre-flight: 5 seconds to Ctrl+C if any path below looks like a write action');
for (const r of (LIMIT ? routes.slice(0, LIMIT) : routes).slice(0, 20)) {
  const risky = RISKY_RE.test(r.path);
  console.log(`   ${risky ? '⚠' : ' '} ${r.path}  ${r.text || ''}`);
}
if (routes.length > 20) console.log(`   … +${routes.length - 20} more`);
await new Promise((res) => setTimeout(res, 5000));

function slugify(s) {
  return s.replace(/^\//, '').replace(/[^\w]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 100);
}

const todo = LIMIT ? routes.slice(0, LIMIT) : routes;
let crawled = 0, skipped = 0, failed = 0;

for (const r of todo) {
  const slug = slugify(r.path) || 'index';
  const dir = join(PAGES_DIR, slug);
  const shotPath = join(dir, 'screenshot.png');

  if (existsSync(shotPath)) {
    skipped++;
    continue;
  }
  mkdirSync(dir, { recursive: true });

  const events = [];
  const onReq = (req) => {
    if (!req.url().startsWith('http')) return;
    events.push({ kind: 'req', ts: Date.now(), method: req.method(), url: req.url(),
      headers: req.headers(), postData: req.postData()?.slice(0, 4096) });
  };
  const onResp = async (res) => {
    try {
      const url = res.url(); if (!url.startsWith('http')) return;
      const headers = res.headers();
      const ct = headers['content-type'] || '';
      let body = null;
      if (/json|text|xml/i.test(ct)) {
        try {
          const t = await res.text();
          body = t.length > 200_000 ? t.slice(0, 200_000) + '\n…[TRUNCATED]' : t;
        } catch {}
      }
      events.push({ kind: 'resp', ts: Date.now(), url, status: res.status(), headers, contentType: ct, body });
    } catch {}
  };
  lxPage.on('request', onReq);
  lxPage.on('response', onResp);

  process.stdout.write(`[recon] ${String(crawled + 1).padStart(3, ' ')}/${todo.length}  ${r.path}  `);
  const t0 = Date.now();
  try {
    const targetUrl = new URL(r.path, lxPage.url()).toString();
    await lxPage.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30_000 }).catch(() => null);
    await lxPage.waitForTimeout(PER_WAIT_MS / 2);
    // Scroll bottom to flush lazy loads
    await lxPage.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => null);
    await lxPage.waitForTimeout(PER_WAIT_MS / 2);
    // Screenshot + DOM
    await lxPage.screenshot({ path: shotPath, fullPage: true });
    const html = await lxPage.content();
    writeFileSync(join(dir, 'dom.html'), html);
    // Network jsonl
    writeFileSync(join(dir, 'network.jsonl'), events.map((e) => JSON.stringify(e)).join('\n'));
    crawled++;
    console.log(`✓ ${Math.round((Date.now() - t0) / 100) / 10}s · ${events.length} net evts`);
  } catch (err) {
    failed++;
    console.log(`✗ ${err.message?.slice(0, 80)}`);
    writeFileSync(join(dir, 'error.txt'), String(err?.stack || err));
  } finally {
    lxPage.off('request', onReq);
    lxPage.off('response', onResp);
  }

  // Polite delay between pages
  await lxPage.waitForTimeout(3000);
}

console.log(`\n[recon] phase 2 done. crawled=${crawled} skipped=${skipped} failed=${failed}  total=${todo.length}`);
console.log(`[recon] safety audit: ${auditCount} non-GET requests logged, of which ${riskyCount} matched RISKY pattern`);
if (riskyCount > 0) {
  console.log(`[recon] ⚠ review ${SAFETY_LOG} — search for "RISKY" lines`);
}
console.log('[recon] next:  npm run recon:analyze');
process.exit(0);
