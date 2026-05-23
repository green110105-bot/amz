// Aggregate deep crawl: per-route tab list + per-tab UI counts + flagship report.

import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, 'output');
const DEEP_DIR = join(OUT, 'deep');
const REPORTS_DIR = join(OUT, 'reports');

if (!existsSync(DEEP_DIR)) { console.error('no deep output'); process.exit(1); }

function readJson(p) { try { return JSON.parse(readFileSync(p, 'utf-8')); } catch { return null; } }

function htmlStats(html) {
  if (!html) return null;
  return {
    buttons: (html.match(/<button[\s>]/g) || []).length,
    inputs: (html.match(/<input[\s>]/g) || []).length,
    selects: (html.match(/<select[\s>]/g) || []).length,
    tables: (html.match(/<table[\s>]/g) || []).length,
    ths: (html.match(/<th[\s>]/g) || []).length,
    rows: (html.match(/<tr[\s>]/g) || []).length,
    modals: (html.match(/class="[^"]*\b(modal|dialog|drawer)\b[^"]*"/gi) || []).length,
    bytes: html.length,
  };
}

function tabFromFilename(name) {
  // "01_天数据.html" → { idx: "01", label: "天数据" }
  const m = name.match(/^(\d{2})_(.+?)\.html$/);
  return m ? { idx: m[1], label: m[2] } : null;
}

const routeDirs = readdirSync(DEEP_DIR).filter((d) => statSync(join(DEEP_DIR, d)).isDirectory()).sort();

const flagshipRows = [];
for (const slug of routeDirs) {
  const dir = join(DEEP_DIR, slug);
  const done = readJson(join(dir, 'done.json'));
  const tabsMeta = readJson(join(dir, 'tabs.json')) || [];
  const initial = readFileSync(join(dir, '00_initial.html'), 'utf-8').catch?.() || (() => {
    try { return readFileSync(join(dir, '00_initial.html'), 'utf-8'); } catch { return ''; }
  })();
  const tabFiles = readdirSync(dir).filter((f) => /^\d{2}_.+\.html$/.test(f) && !f.startsWith('00')).sort();
  const tabsPerRoute = tabFiles.map((f) => {
    const meta = tabFromFilename(f);
    if (!meta) return null;
    const html = (() => { try { return readFileSync(join(dir, f), 'utf-8'); } catch { return ''; } })();
    return { ...meta, html: htmlStats(html) };
  }).filter(Boolean);
  flagshipRows.push({
    slug,
    initialStats: htmlStats(initial),
    tabsFound: done?.tabsFound ?? tabsMeta.length,
    tabsClicked: done?.tabsClicked ?? tabFiles.length,
    netEvents: done?.totalNetworkEvents ?? null,
    tabsPerRoute,
  });
}

// ---------- write deep spec markdown ----------
const md = [
  '# 领星广告模块 — 深度规格（核心 8 页 + 33 子 tab）',
  '',
  `生成时间：${new Date().toISOString()}`,
  '',
  '本报告通过自动 RPA 抓取 ads.lingxing.com 的真实运行界面，**仅只读** —— 没有任何修改 / 删除 / 暂停 / 创建动作。',
  '',
  '## 总览',
  '',
  '| 路由 | tabs 数 | 网络事件 | 初始 DOM (KB) |',
  '|---|---:|---:|---:|',
  ...flagshipRows.map((r) => `| \`/${r.slug.replace(/_/g, '/')}\` | ${r.tabsClicked} | ${r.netEvents ?? '-'} | ${Math.round((r.initialStats?.bytes || 0) / 1024)} |`),
  '',
  '## 每路由详细 tab 矩阵',
  '',
];

for (const r of flagshipRows) {
  md.push(`### \`/${r.slug.replace(/_/g, '/')}\``);
  md.push('');
  if (r.initialStats) {
    const s = r.initialStats;
    md.push(`**初始视图**：${s.buttons} 按钮 / ${s.inputs} 输入 / ${s.tables} 表 / ${s.rows} 行 / ${s.modals} 模态 / ${s.ths} 表头`);
    md.push('');
  }
  if (r.tabsPerRoute.length) {
    md.push('| # | Tab | 按钮 | 输入 | 表 | 行 | 表头 | 模态 |');
    md.push('|---:|---|---:|---:|---:|---:|---:|---:|');
    for (const t of r.tabsPerRoute) {
      const s = t.html || {};
      md.push(`| ${t.idx} | **${t.label}** | ${s.buttons ?? 0} | ${s.inputs ?? 0} | ${s.tables ?? 0} | ${s.rows ?? 0} | ${s.ths ?? 0} | ${s.modals ?? 0} |`);
    }
    md.push('');
  } else {
    md.push('_（无 sub-tab，单一视图）_');
    md.push('');
  }
}

writeFileSync(join(REPORTS_DIR, 'lingxing-ads-deep-spec.md'), md.join('\n'));
console.log('[deep-analyze] wrote', join(REPORTS_DIR, 'lingxing-ads-deep-spec.md'));

// ---------- aggregate all DEEP network events into an API inventory ----------
const apiSet = new Map();
function readEvents(p) {
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf-8').split('\n').filter(Boolean).map((l) => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
}

for (const slug of routeDirs) {
  const dir = join(DEEP_DIR, slug);
  // No per-tab network.jsonl in current deep-crawl; we only track at aggregate level via audit log.
  // So just count once per route from broad output (if exists) — skip for now.
}

// Pull from recon-audit.log to enumerate non-GET endpoints reached
let auditApis = new Map();
if (existsSync(join(OUT, 'recon-audit.log'))) {
  const lines = readFileSync(join(OUT, 'recon-audit.log'), 'utf-8').split('\n').filter(Boolean);
  for (const l of lines) {
    const m = l.match(/^\S+ \S+\s+(\S+)\s+(\S+)/);
    if (!m) continue;
    const [, method, url] = m;
    try {
      const u = new URL(url);
      const key = `${method} ${u.hostname}${u.pathname}`;
      auditApis.set(key, (auditApis.get(key) || 0) + 1);
    } catch {}
  }
}

const audMd = [
  '# 领星广告 — API 端点指纹（从审计日志聚合）',
  '',
  `生成时间：${new Date().toISOString()}`,
  `合计调用：${[...auditApis.values()].reduce((a, b) => a + b, 0)} 次`,
  `唯一端点：${auditApis.size} 个`,
  '',
  '| 调用次数 | Method + Host + Path |',
  '|---:|---|',
  ...[...auditApis.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `| ${n} | \`${k}\` |`),
];
writeFileSync(join(REPORTS_DIR, 'lingxing-ads-api-fingerprint.md'), audMd.join('\n'));
console.log('[deep-analyze] wrote', join(REPORTS_DIR, 'lingxing-ads-api-fingerprint.md'));
