#!/usr/bin/env node
// M1-012: CI lint — fail when a src/**/*.vue file is neither registered in
// router/index.js nor imported by any registered component/page (orphan / dead page).
//
// Rationale: orphan .vue files (e.g. a second/third A/B-center adopt-winner write path)
// create phantom entry points and false-positive coverage. This guard keeps the page
// graph honest: every .vue must be reachable from the router, directly or transitively.
//
// Usage: node scripts/lint-orphan-vue.mjs [webRoot]
//   webRoot defaults to apps/web-v2
// Exit code 0 = all reachable; non-zero = orphan(s) found (also prints them).

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const webRoot = resolve(process.argv[2] || join(repoRoot, 'apps/web-v2'));
const srcRoot = join(webRoot, 'src');
const routerPath = join(srcRoot, 'router/index.js');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (extname(full) === '.vue') out.push(full);
  }
  return out;
}

// Resolve an import specifier (relative) to an absolute file path, if it is one.
function resolveImport(fromFile, spec) {
  if (!spec.startsWith('.')) return null;
  const base = resolve(dirname(fromFile), spec);
  const candidates = [base, `${base}.vue`, `${base}.js`, join(base, 'index.js'), join(base, 'index.vue')];
  for (const c of candidates) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

// Extract import targets (static `import ... from '...'` and dynamic `import('...')`).
function importsOf(file) {
  const src = readFileSync(file, 'utf8');
  const specs = new Set();
  const staticRe = /import\s+[^'"]*?from\s*['"]([^'"]+)['"]/g;
  const dynRe = /import\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m;
  while ((m = staticRe.exec(src))) specs.add(m[1]);
  while ((m = dynRe.exec(src))) specs.add(m[1]);
  return [...specs];
}

if (!existsSync(routerPath)) {
  console.error(`[lint-orphan-vue] router not found: ${routerPath}`);
  process.exit(2);
}

const allVue = walk(srcRoot);

// Seed roots: every .vue referenced by the router (dynamic imports) + entry App.vue/main.js.
const roots = new Set();
for (const spec of importsOf(routerPath)) {
  const r = resolveImport(routerPath, spec);
  if (r && r.endsWith('.vue')) roots.add(r);
}
for (const entry of ['App.vue', 'main.js']) {
  const p = join(srcRoot, entry);
  if (existsSync(p)) {
    if (p.endsWith('.vue')) roots.add(p);
    for (const spec of importsOf(p)) {
      const r = resolveImport(p, spec);
      if (r) roots.add(r);
    }
  }
}

// BFS over imports from all reachable files (router itself + roots), following both
// .vue and .js modules so transitively-imported components count as reachable.
const reachable = new Set();
const queue = [routerPath, ...roots];
while (queue.length) {
  const file = queue.shift();
  if (reachable.has(file)) continue;
  reachable.add(file);
  if (!existsSync(file)) continue;
  for (const spec of importsOf(file)) {
    const r = resolveImport(file, spec);
    if (r && !reachable.has(r)) queue.push(r);
  }
}

const orphans = allVue.filter((f) => !reachable.has(f));

if (orphans.length) {
  console.error('[lint-orphan-vue] FAIL — unreachable .vue files (not in router, not imported by any registered component):');
  for (const o of orphans) console.error(`  - ${relative(repoRoot, o)}`);
  console.error(`\n${orphans.length} orphan .vue file(s). Delete them or wire them into the router/component graph.`);
  process.exit(1);
}

console.log(`[lint-orphan-vue] OK — all ${allVue.length} .vue files are reachable from the router/component graph.`);
process.exit(0);
