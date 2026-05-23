import { handleExtendedRequest } from '../apps/api/src/extended-routes.mjs';

const requests = [
  { path: '/api/v1/dashboard' },
  { path: '/ready' },
  { path: '/api/v1/profit/overview' },
  { path: '/api/v1/inventory/decisions' },
  { path: '/api/v1/ads/suggestions' },
  { path: '/api/v1/monitor/overview' },
  { path: '/api/v1/listings/prod-case-001/diagnosis' },
  { path: '/api/v1/reviews/prod-case-001/clusters' },
  { path: '/api/v1/competitors/changes' },
  { path: '/api/v1/listings' },
  { path: '/api/v1/listings/prod-case-001/iterations', method: 'POST' },
  { path: '/api/v1/profit/cashflow' },
  { path: '/api/v1/profit/scenario/global', method: 'POST', body: { startingCash: 5000 } },
  { path: '/api/v1/ads/budget-allocator/optimize', method: 'POST', body: { totalBudget: 300 } },
  { path: '/api/v1/ads/brand-defense' },
  { path: '/api/v1/monitor/anomalies' },
  { path: '/api/v1/monitor/sla' },
  { path: '/api/v1/audit/quotas' },
  { path: '/api/v1/commercial/entitlements' },
];

const replay = [];
for (const { path, method = 'GET', body: requestBody } of requests) {
  const started = performance.now();
  const response = await handleExtendedRequest(new Request(`http://localhost${path}`, {
    method,
    headers: requestBody ? { 'content-type': 'application/json' } : undefined,
    body: requestBody ? JSON.stringify(requestBody) : undefined,
  }));
  const elapsedMs = Number((performance.now() - started).toFixed(2));
  if (response.status >= 400) throw new Error(`${path} returned ${response.status}`);
  const body = await response.json();
  replay.push({ path, status: response.status, elapsedMs, keys: Object.keys(body).sort(), sourceMode: body.sourceMode || 'derived' });
}

const aiResponse = await handleExtendedRequest(new Request('http://localhost/api/v1/ai/decisions', {
  method: 'POST',
  body: JSON.stringify({
    module: 'M2',
    promptId: 'P-M2-LEAK-RECOMMEND',
    subject: { id: 'replay-leak', type: 'AD_PROFIT_ROAS_LOW', estimatedMonthlyImpact: 120 },
    evidence: ['replay evidence'],
  }),
}));
if (aiResponse.status !== 200) throw new Error(`AI replay returned ${aiResponse.status}`);
const aiBody = await aiResponse.json();
if (aiBody.provider !== 'codex_local') throw new Error('AI replay did not use codex_local');
replay.push({ path: '/api/v1/ai/decisions', status: 200, elapsedMs: 0, keys: Object.keys(aiBody).sort(), sourceMode: aiBody.sourceMode });

console.log(JSON.stringify({ ok: true, replayed: replay.length, replay }, null, 2));
