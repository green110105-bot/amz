import fs from 'node:fs';
import path from 'node:path';

const matrixPath = path.join(process.cwd(), 'docs/implementation/FULL_REQUIREMENTS_MATRIX.json');
const outDir = path.join(process.cwd(), 'packages/contracts/generated');
fs.mkdirSync(outDir, { recursive: true });
const items = JSON.parse(fs.readFileSync(matrixPath, 'utf8'));
const routes = [];
for (const item of items) {
  if (!['API_ROW', 'API_ENDPOINT'].includes(item.type)) continue;
  const match = String(item.title).match(/\b(GET|POST|PUT|PATCH|DELETE)\b\s+(?:\/\s+)?(\/api\/[^\s|]+)/i);
  if (!match) continue;
  const method = match[1].toLowerCase();
  const apiPath = match[2].replace(/[),，。]+$/g, '');
  routes.push({
    method,
    path: apiPath,
    operationId: `${method}_${apiPath.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '')}`,
    module: item.module,
    source: item.source,
    summary: item.title,
    status: 'contract_stub_until_implemented',
  });
}

const deduped = [];
const seen = new Set();
for (const route of routes) {
  const key = `${route.method} ${route.path}`;
  if (seen.has(key)) continue;
  seen.add(key);
  deduped.push(route);
}

fs.writeFileSync(path.join(outDir, 'documented-routes.json'), JSON.stringify(deduped, null, 2));
fs.writeFileSync(path.join(outDir, 'documented-routes.mjs'), `export const documentedRoutes = ${JSON.stringify(deduped, null, 2)};\n`);
console.log(`documented routes ok: ${deduped.length} unique routes from ${routes.length} API rows`);
