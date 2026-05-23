import fs from 'node:fs';
import path from 'node:path';
import { buildOpenApiDocument } from '../packages/contracts/src/openapi.mjs';
import { routeRegistry } from '../packages/contracts/src/route-registry.mjs';
import { documentedRoutes } from '../packages/contracts/generated/documented-routes.mjs';

const root = process.cwd();
const outDir = path.join(root, 'packages/contracts/generated');
fs.mkdirSync(outDir, { recursive: true });
const document = buildOpenApiDocument();

if (document.openapi !== '3.1.0') throw new Error('OpenAPI version must be 3.1.0');
const expectedRoutes = mergeRoutes(routeRegistry, documentedRoutes);
const operationCount = Object.values(document.paths || {}).reduce((total, pathItem) => total + Object.keys(pathItem).length, 0);
if (!document.paths || operationCount < expectedRoutes.length) {
  throw new Error('OpenAPI paths are incomplete.');
}

const operationIds = new Set();
for (const route of expectedRoutes) {
  const operation = document.paths[route.path]?.[route.method];
  if (!operation) throw new Error(`Missing OpenAPI operation for ${route.method.toUpperCase()} ${route.path}`);
  if (operationIds.has(operation.operationId)) throw new Error(`Duplicate operationId ${operation.operationId}`);
  operationIds.add(operation.operationId);
  if (!operation.responses?.[200] && !operation.responses?.[202]) {
    throw new Error(`Missing success response for ${operation.operationId}`);
  }
}

fs.writeFileSync(path.join(outDir, 'openapi.json'), JSON.stringify(document, null, 2));
console.log(`openapi ok: ${expectedRoutes.length} routes`);

function mergeRoutes(primary, documented) {
  const merged = [];
  const seen = new Set();
  for (const route of [...primary, ...documented]) {
    const key = `${route.method} ${route.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(route);
  }
  return merged;
}

