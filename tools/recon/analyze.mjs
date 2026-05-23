// Aggregate output/pages/*/network.jsonl + dom.html into 4 markdown reports.
// Pure offline — no browser needed.

import { readFileSync, readdirSync, existsSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, 'output');
const PAGES_DIR = join(OUT, 'pages');
const REPORTS_DIR = join(OUT, 'reports');
mkdirSync(REPORTS_DIR, { recursive: true });

if (!existsSync(PAGES_DIR)) {
  console.error('[analyze] no pages output found — run npm run recon:crawl first.');
  process.exit(1);
}

const routesMeta = existsSync(join(OUT, 'routes.json'))
  ? JSON.parse(readFileSync(join(OUT, 'routes.json'), 'utf-8'))
  : { routes: [], prefix: '' };

// ---------- collect ----------
function readEvents(p) {
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf-8').split('\n').filter(Boolean).map((l) => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
}

const slugDirs = readdirSync(PAGES_DIR).filter((d) => {
  try { return statSync(join(PAGES_DIR, d)).isDirectory(); } catch { return false; }
});

const apiEndpoints = new Map(); // key = method + path, value = { samples: [{url, status, sampleRespBody}], pages: Set }
const perPage = []; // {slug, route, screenshotSize, domBytes, reqCount, apiCount, uiCounts}

for (const slug of slugDirs) {
  const dir = join(PAGES_DIR, slug);
  const events = readEvents(join(dir, 'network.jsonl'));
  const reqs = events.filter((e) => e.kind === 'req');
  const resps = events.filter((e) => e.kind === 'resp');

  const respByUrl = new Map();
  for (const r of resps) respByUrl.set(r.url, r);

  let apiCount = 0;
  for (const req of reqs) {
    let u;
    try { u = new URL(req.url); } catch { continue; }
    // Heuristic: keep only same-origin API-ish requests
    if (!/\/api[\/-]|\/v\d+\/|\.json($|\?)/i.test(u.pathname)) continue;
    apiCount++;
    const key = `${req.method} ${u.pathname}`;
    let entry = apiEndpoints.get(key);
    if (!entry) entry = { method: req.method, path: u.pathname, hostnames: new Set(), pages: new Set(), samples: [] };
    entry.hostnames.add(u.hostname);
    entry.pages.add(slug);
    const resp = respByUrl.get(req.url);
    if (entry.samples.length < 2) {
      entry.samples.push({
        url: req.url,
        status: resp?.status || null,
        sampleReqBody: req.postData?.slice(0, 800) || null,
        sampleRespBody: resp?.body?.slice(0, 1500) || null,
      });
    }
    apiEndpoints.set(key, entry);
  }

  // Cheap UI counting from DOM
  let uiCounts = null;
  try {
    const html = readFileSync(join(dir, 'dom.html'), 'utf-8');
    uiCounts = {
      buttons: (html.match(/<button[\s>]/g) || []).length,
      inputs: (html.match(/<input[\s>]/g) || []).length,
      selects: (html.match(/<select[\s>]/g) || []).length,
      tables: (html.match(/<table[\s>]/g) || []).length,
      ths: (html.match(/<th[\s>]/g) || []).length,
      modals: (html.match(/class="[^"]*\b(modal|dialog|drawer)\b[^"]*"/gi) || []).length,
    };
  } catch {}

  const r = routesMeta.routes?.find((x) => slug.includes(x.path.replace(/^\//, '').replace(/[^\w]+/g, '_').slice(0, 100)));

  perPage.push({
    slug,
    route: r?.path || '?',
    label: r?.text || '',
    domBytes: existsSync(join(dir, 'dom.html')) ? statSync(join(dir, 'dom.html')).size : 0,
    screenshotKB: existsSync(join(dir, 'screenshot.png')) ? Math.round(statSync(join(dir, 'screenshot.png')).size / 1024) : 0,
    reqCount: reqs.length,
    apiCount,
    uiCounts,
    hasError: existsSync(join(dir, 'error.txt')),
  });
}

// ---------- report: api inventory ----------
const apiList = [...apiEndpoints.values()].sort((a, b) => a.path.localeCompare(b.path));
const apiMd = [
  '# 领星广告模块 API 端点清单',
  '',
  `生成时间：${new Date().toISOString()}`,
  `合计端点：**${apiList.length}** 个唯一 (method, path) 组合`,
  `数据来源：${slugDirs.length} 个页面的网络抓包`,
  '',
  '| Method | Path | 出现页数 | host(s) |',
  '|---|---|---:|---|',
  ...apiList.map((e) => `| ${e.method} | \`${e.path}\` | ${e.pages.size} | ${[...e.hostnames].join(', ')} |`),
  '',
  '## 详细：每个端点的示例请求 / 响应',
  '',
];

for (const e of apiList) {
  apiMd.push(`### ${e.method} ${e.path}`);
  apiMd.push('');
  apiMd.push(`- 在 ${e.pages.size} 个页面出现 (${[...e.pages].slice(0, 5).join(', ')}${e.pages.size > 5 ? ', …' : ''})`);
  if (e.samples[0]) {
    const s = e.samples[0];
    apiMd.push(`- 示例 status: **${s.status ?? 'unknown'}**`);
    if (s.sampleReqBody) {
      apiMd.push('');
      apiMd.push('请求体（前 800 字符）：');
      apiMd.push('```');
      apiMd.push(s.sampleReqBody);
      apiMd.push('```');
    }
    if (s.sampleRespBody) {
      apiMd.push('');
      apiMd.push('响应体（前 1500 字符）：');
      apiMd.push('```');
      apiMd.push(s.sampleRespBody);
      apiMd.push('```');
    }
  }
  apiMd.push('');
}
writeFileSync(join(REPORTS_DIR, 'api-inventory.md'), apiMd.join('\n'));
console.log('[analyze] wrote api-inventory.md (', apiList.length, 'endpoints )');

// ---------- report: spec ----------
const specMd = [
  '# 领星广告模块 — 路由 / UI 规格',
  '',
  `生成时间：${new Date().toISOString()}`,
  `合计路由：**${perPage.length}** 个`,
  `URL 前缀：\`${routesMeta.prefix || '(unknown)'}\``,
  '',
  '## 路由总览',
  '',
  '| # | 路径 | 菜单文本 | 截图 KB | DOM B | 请求数 | API 数 | 按钮 | 输入 | 表 | 模态 |',
  '|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|',
  ...perPage.map((p, i) => {
    const u = p.uiCounts || {};
    return `| ${i + 1} | \`${p.route}\` | ${p.label || '—'} | ${p.screenshotKB || 0} | ${p.domBytes} | ${p.reqCount} | ${p.apiCount} | ${u.buttons ?? '-'} | ${u.inputs ?? '-'} | ${u.tables ?? '-'} | ${u.modals ?? '-'} |`;
  }),
  '',
  '## 每路由的快照位置',
  '',
  ...perPage.map((p) => `- \`${p.route}\` (${p.label || '—'}) → \`tools/recon/output/pages/${p.slug}/\``),
];
writeFileSync(join(REPORTS_DIR, 'lingxing-ads-spec.md'), specMd.join('\n'));
console.log('[analyze] wrote lingxing-ads-spec.md (', perPage.length, 'pages )');

// ---------- report: UI inventory (counts only) ----------
const uiMd = [
  '# UI 元素清单',
  '',
  '从每个页面 DOM 静态计数 — 用于估算交互密度和工作量。',
  '',
  '| Route | Buttons | Inputs | Selects | Tables | Headers (th) | Modals |',
  '|---|---:|---:|---:|---:|---:|---:|',
  ...perPage.map((p) => {
    const u = p.uiCounts || {};
    return `| \`${p.route}\` | ${u.buttons ?? 0} | ${u.inputs ?? 0} | ${u.selects ?? 0} | ${u.tables ?? 0} | ${u.ths ?? 0} | ${u.modals ?? 0} |`;
  }),
  '',
  '## 合计',
  '',
  (() => {
    const t = perPage.reduce((acc, p) => {
      const u = p.uiCounts || {};
      acc.buttons += u.buttons || 0; acc.inputs += u.inputs || 0;
      acc.selects += u.selects || 0; acc.tables += u.tables || 0;
      acc.ths += u.ths || 0; acc.modals += u.modals || 0;
      return acc;
    }, { buttons: 0, inputs: 0, selects: 0, tables: 0, ths: 0, modals: 0 });
    return `- 按钮 ${t.buttons} / 输入 ${t.inputs} / 下拉 ${t.selects} / 表格 ${t.tables} / 表头 ${t.ths} / 模态 ${t.modals}`;
  })(),
];
writeFileSync(join(REPORTS_DIR, 'ui-inventory.md'), uiMd.join('\n'));
console.log('[analyze] wrote ui-inventory.md');

// ---------- report: M3 gap (placeholder — needs hand-curated mapping) ----------
const gapMd = [
  '# 你的 M3 vs 领星广告 — Gap Analysis（待人工补充）',
  '',
  '本报告自动列出领星端点 / 路由，由你 (或我帮你) 逐一对应 M3 已有 / 缺失。',
  '',
  '## 1. 领星有哪些"东西"',
  '',
  `- ${perPage.length} 个广告模块路由`,
  `- ${apiList.length} 个唯一 API 端点`,
  `- 总按钮 ~${perPage.reduce((a, p) => a + (p.uiCounts?.buttons || 0), 0)} 个`,
  '',
  '## 2. M3 已经有的（请填写 ✅ / ❌）',
  '',
  '| 领星路由 | M3 对应 | 状态 | 备注 |',
  '|---|---|---|---|',
  ...perPage.map((p) => `| \`${p.route}\` (${p.label || '?'}) | (?) | ⬜ | |`),
  '',
  '## 3. 自动启发分类（按路径关键词）',
  '',
  ...categorize(perPage).map((c) => `\n### ${c.bucket}（${c.items.length}）\n` +
    c.items.map((it) => `- \`${it.route}\` ${it.label || ''}`).join('\n')),
];
writeFileSync(join(REPORTS_DIR, 'm3-gap-analysis.md'), gapMd.join('\n'));
console.log('[analyze] wrote m3-gap-analysis.md');

function categorize(items) {
  const buckets = {
    'Campaigns / 广告活动': /campaign|计划|活动|sp\/|sb\/|sd\//i,
    'Ad Groups / 广告组':   /adgroup|ad-group|组/i,
    'Keywords / 关键词':     /keyword|kw|关键词|term/i,
    'Targeting / 定向':      /targeting|target|定向|asin/i,
    'Negatives / 否定':      /negative|negate|否定/i,
    'Bidding / 出价':        /bid|出价|价/i,
    'Budget / 预算':         /budget|预算/i,
    'Strategy / 策略':       /strategy|策略/i,
    'SQP / 搜索词':           /sqp|search-?term|搜索词/i,
    'Bulk / 批量':            /bulk|批量|csv|export|import/i,
    'Report / 报表':          /report|报表|analytics|数据/i,
    'Settings / 设置':        /setting|配置/i,
    'Other':                  /./,
  };
  const buckMap = new Map();
  for (const p of items) {
    const haystack = `${p.route} ${p.label || ''}`;
    let placed = false;
    for (const [name, re] of Object.entries(buckets)) {
      if (re.test(haystack)) {
        if (!buckMap.has(name)) buckMap.set(name, []);
        buckMap.get(name).push(p);
        placed = true;
        break;
      }
    }
    if (!placed) {
      if (!buckMap.has('Other')) buckMap.set('Other', []);
      buckMap.get('Other').push(p);
    }
  }
  return [...buckMap.entries()].map(([bucket, items]) => ({ bucket, items }));
}

console.log('\n[analyze] ✓ all reports in', REPORTS_DIR);
