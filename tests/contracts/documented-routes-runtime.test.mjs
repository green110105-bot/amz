import test from 'node:test';
import assert from 'node:assert/strict';
import { documentedRoutes } from '../../packages/contracts/generated/documented-routes.mjs';
import { handleExtendedRequest } from '../../apps/api/src/extended-routes.mjs';

test('every documented API route resolves to an implemented mock contract at runtime', async () => {
  const failures = [];

  for (const route of documentedRoutes) {
    const method = route.method.toUpperCase();
    const path = concretePath(route.path);
    const response = await handleExtendedRequest(new Request(`http://localhost${path}`, {
      method,
      headers: ['POST', 'PUT', 'PATCH'].includes(method) ? { 'content-type': 'application/json' } : undefined,
      body: ['POST', 'PUT', 'PATCH'].includes(method) ? JSON.stringify(bodyFor(route.path)) : undefined,
    }));
    const body = await response.json();

    if (response.status >= 400 || body.status === 'contract_stub_until_implemented' || body.error === 'not_found') {
      failures.push({ method, path, status: response.status, bodyStatus: body.status, error: body.error });
    }
  }

  assert.deepEqual(failures, []);
});

function concretePath(path) {
  return path
    .replace(/\{productId\}/g, 'prod-case-001')
    .replace(/\{iterationId\}/g, 'm1iter-demo')
    .replace(/\{generationId\}/g, 'imggen-demo')
    .replace(/\{expId\}/g, 'exp-demo')
    .replace(/\{orderId\}/g, '111-0000001-0000001')
    .replace(/\{poId\}/g, 'po-runtime-001')
    .replace(/\{supplierId\}/g, 'supplier-1')
    .replace(/\{campaignId\}/g, 'camp-case-growth')
    .replace(/\{suggestionId\}/g, 'sug-runtime')
    .replace(/\{id\}/g, 'audit-001')
    .replace(/\{vid\}/g, 'version-runtime')
    .replace(/\{n\}/g, '1')
    .replace(/\{recId\}/g, 'rec-prod-case-001')
    .replace(/\{decId\}/g, 'slow-prod-case-001')
    .replace(/\{leakId\}/g, 'leak-runtime')
    .replace(/\{asin\}/g, 'B0COMPCASE')
    .replace(/\{category\}/g, 'electronics_accessories')
    .replace(/\{[^/]+\}/g, 'demo-id');
}

function bodyFor(path) {
  if (path.includes('/purchase-orders') && path.endsWith('/transition')) return { nextStatus: 'ordered' };
  if (path.includes('/scenario')) return { productId: 'prod-case-001' };
  if (path.includes('/budget-allocator')) return { totalBudget: 300 };
  if (path.includes('/decision')) return { action: 'accept', selectedProposalId: 'A' };
  if (path.includes('/images')) return { image: { imageType: 'main', format: 'jpg', width: 1600, height: 1600, whiteBackground: true, productRatio: 0.85, photographic: true } };
  return { dryRun: true, sourceMode: 'mock' };
}
