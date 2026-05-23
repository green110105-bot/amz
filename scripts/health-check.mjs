import { handleExtendedRequest } from '../apps/api/src/extended-routes.mjs';

const aiDecisionBody = {
  tenantId: 'tenant-demo',
  module: 'M4',
  promptId: 'P-M4-ANOMALY-RECOMMEND',
  subject: { id: 'health-ai', type: 'HEALTH_CHECK', severity: 'P2' },
  evidence: ['health check evidence'],
};

const checks = [
  { path: '/health' },
  { path: '/ready' },
  { path: '/api/v1/dashboard' },
  { path: '/api/v1/profit/overview' },
  { path: '/api/v1/inventory/decisions' },
  { path: '/api/v1/ads/suggestions' },
  { path: '/api/v1/monitor/overview' },
  { path: '/api/v1/listings/prod-case-001/diagnosis' },
  { path: '/api/v1/reviews/prod-case-001/clusters' },
  { path: '/api/v1/competitors/changes' },
  { path: '/api/v1/ai/decisions', method: 'POST', body: aiDecisionBody },
  { path: '/api/v1/listings' },
  { path: '/api/v1/profit/cashflow' },
  { path: '/api/v1/profit/scenario/single-sku', method: 'POST', body: { productId: 'prod-case-001' } },
  { path: '/api/v1/ads/budget-allocator/optimize', method: 'POST', body: { totalBudget: 300 } },
  { path: '/api/v1/ads/dayparting' },
  { path: '/api/v1/monitor/anomalies' },
  { path: '/api/v1/monitor/sla' },
  { path: '/api/v1/audit/quotas' },
  { path: '/api/v1/commercial/entitlements' },
];

for (const { path, expectedStatus = 200, method = 'GET', body: requestBody } of checks) {
  const response = await handleExtendedRequest(new Request(`http://localhost${path}`, {
    method,
    headers: requestBody ? { 'content-type': 'application/json' } : undefined,
    body: requestBody ? JSON.stringify(requestBody) : undefined,
  }));
  if (response.status !== expectedStatus) {
    throw new Error(`${path} expected ${expectedStatus}, got ${response.status}`);
  }
  const body = await response.json();
  if (!body) throw new Error(`${path} returned empty body`);
  console.log(`ok ${path}`);
}



