import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOpenApiDocument } from '../../packages/contracts/src/openapi.mjs';
import { routeRegistry } from '../../packages/contracts/src/route-registry.mjs';

 test('OpenAPI includes every registered route with unique operation IDs', () => {
  const document = buildOpenApiDocument();
  const operationIds = new Set();
  for (const route of routeRegistry) {
    const operation = document.paths[route.path]?.[route.method];
    assert.ok(operation, `${route.method} ${route.path}`);
    assert.equal(operation.operationId, route.operationId);
    assert.equal(operationIds.has(route.operationId), false);
    operationIds.add(route.operationId);
  }
});
