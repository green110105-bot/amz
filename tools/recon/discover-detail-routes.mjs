// Discover ad-detail routes by parsing already-captured DOM dumps for
// internal hrefs that weren't in the sidebar.
import { readdirSync, readFileSync, existsSync, writeFileSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, 'output');
const PAGES = join(OUT, 'pages');
const DEEP  = join(OUT, 'deep');

const routes = JSON.parse(readFileSync(join(OUT, 'routes.json'), 'utf-8')).routes.map(r => r.path);
const knownSet = new Set(routes);

const found = new Map(); // path → { count, sampleFrom }

function harvest(html, fromFile) {
  // Extract all href= values
  const hrefs = (html.match(/href="\/[^"#?]+(?:\?[^"#]*)?"/g) || []).map(s => s.slice(6, -1));
  for (const h of hrefs) {
    // Only ads.lingxing.com paths (relative)
    if (!/^\/(ad_report|ad|tools|tag|attribution|build|fead|suggestion|word_stock)\//.test(h)) continue;
    const clean = h.split('?')[0]; // strip query for grouping
    const entry = found.get(clean) || { count: 0, samples: new Set(), known: knownSet.has(h) || knownSet.has(clean) };
    entry.count++;
    if (entry.samples.size < 3) entry.samples.add(fromFile);
    found.set(clean, entry);
  }
}

function walkDir(root) {
  if (!existsSync(root)) return;
  for (const dir of readdirSync(root)) {
    const dp = join(root, dir);
    if (!statSync(dp).isDirectory()) continue;
    for (const f of readdirSync(dp)) {
      if (!f.endsWith('.html')) continue;
      try {
        const html = readFileSync(join(dp, f), 'utf-8');
        harvest(html, dir + '/' + f);
      } catch {}
    }
  }
}

walkDir(PAGES);
walkDir(DEEP);

// Sort by count desc, separate known vs new
const list = [...found.entries()].sort((a, b) => b[1].count - a[1].count);
const newOnes = list.filter(([_, e]) => !e.known);
const knownOnes = list.filter(([_, e]) => e.known);

console.log(`\nFound ${list.length} unique paths in DOM.`);
console.log(`  already in sidebar: ${knownOnes.length}`);
console.log(`  NEW (detail pages?): ${newOnes.length}`);

console.log('\n=== Top 30 NEW paths (detail pages, sorted by reference count) ===\n');
for (const [p, e] of newOnes.slice(0, 30)) {
  console.log(`${String(e.count).padStart(4)} × ${p}`);
}

writeFileSync(join(OUT, 'detail-routes.json'), JSON.stringify({
  ts: new Date().toISOString(),
  totalUnique: list.length,
  newCount: newOnes.length,
  newRoutes: newOnes.map(([p, e]) => ({ path: p, refs: e.count, sampledFrom: [...e.samples] })),
  knownRoutes: knownOnes.map(([p, e]) => ({ path: p, refs: e.count })),
}, null, 2));
console.log('\nWrote detail-routes.json');
