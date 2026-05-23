import test from 'node:test';
import assert from 'node:assert/strict';
import { handleExtendedRequest } from '../../apps/api/src/extended-routes.mjs';

test('full-scope M1 API drives diagnosis, iteration, proposals, apply, image, and experiment flows', async () => {
  const listings = await api('GET', '/api/v1/listings');
  assert.equal(listings.module, 'M1');
  assert.ok(listings.listings.length >= 3);

  const score = await api('GET', '/api/v1/listings/prod-case-001/score');
  assert.ok(score.score >= 0);
  assert.ok(score.dimensions.D1);

  const iterationStart = await api('POST', '/api/v1/listings/prod-case-001/iterations');
  const iterationId = iterationStart.iteration.id;
  const round = await api('POST', `/api/v1/iterations/${iterationId}/rounds`);
  assert.equal(round.round.proposals.length, 3);

  const decision = await api('PUT', `/api/v1/iterations/${iterationId}/rounds/1/decision`, {
    action: 'accept',
    selectedProposalId: 'A',
  });
  assert.equal(decision.iteration.rounds[0].status, 'completed');

  const preview = await api('POST', `/api/v1/iterations/${iterationId}/preview`);
  assert.ok(preview.preview.changes.length > 0);
  const applied = await api('POST', `/api/v1/iterations/${iterationId}/apply`, { confirm: true });
  assert.equal(applied.realStoreWrite, 'blocked_until_credentials');

  const image = await api('POST', '/api/v1/listings/prod-case-001/images/generate');
  assert.equal(image.candidates.length, 3);
  assert.equal(image.complianceSummary.allPassed, true);

  const experiment = await api('POST', '/api/v1/listings/prod-case-001/experiments');
  assert.equal(experiment.realAmazonExperiment, 'blocked_until_credentials');
});

test('full-scope M2 API exposes cashflow, scenarios, tax, alerts, reports, and PO state machine', async () => {
  const cashflow = await api('GET', '/api/v1/profit/cashflow');
  assert.ok(cashflow.windows.some((window) => window.days === 90));

  const scenario = await api('POST', '/api/v1/profit/scenario/single-sku', {
    adjustments: { priceChangePct: -0.05, acosDelta: 0.02 },
  });
  assert.ok(scenario.delta);

  const global = await api('POST', '/api/v1/profit/scenario/global');
  assert.equal(global.horizonResults.length, 3);

  const fx = await api('GET', '/api/v1/profit/fx');
  assert.ok(fx.warnings.some((warning) => warning.code === 'ACCS_HIDDEN_FEE_RISK'));

  const vat = await api('GET', '/api/v1/tax/vat');
  assert.ok(vat.vat.length > 0);

  const alert = await api('POST', '/api/v1/alerts/custom/low_margin_with_spend/test');
  assert.equal(alert.triggered, true);

  const report = await api('POST', '/api/v1/reports/export', { format: 'pdf' });
  assert.match(report.reportId, /^M2-EXPORT-/);

  const po = await api('POST', '/api/v1/purchase-orders', { id: 'po-api-001' });
  assert.equal(po.purchaseOrder.status, 'draft');
  const ordered = await api('POST', '/api/v1/purchase-orders/po-api-001/transition', { nextStatus: 'ordered' });
  assert.equal(ordered.purchaseOrder.status, 'ordered');
  const inTransit = await api('POST', '/api/v1/purchase-orders/po-api-001/transition', { nextStatus: 'in_transit' });
  assert.equal(inTransit.purchaseOrder.status, 'in_transit');
  const reconciled = await api('POST', '/api/v1/purchase-orders/po-api-001/reconcile');
  assert.equal(reconciled.purchaseOrder.status, 'received');
});

test('full-scope M3 API exposes advanced ads optimization and guardrails', async () => {
  const budget = await api('POST', '/api/v1/ads/budget-allocator/optimize');
  assert.equal(budget.module, 'M3');
  assert.ok(budget.recommendations.length > 0);

  const dayparting = await api('GET', '/api/v1/ads/dayparting');
  assert.equal(dayparting.schedule.length, 168);

  const brand = await api('GET', '/api/v1/ads/brand-defense');
  assert.ok(['protected', 'exposed'].includes(brand.status));

  const competitor = await api('GET', '/api/v1/ads/competitor-attack/recommendations');
  assert.ok(competitor.recommendations.length > 0);

  const creative = await api('GET', '/api/v1/ads/creatives/ab-tests/creative-ab-1');
  assert.equal(creative.status, 'ready_to_decide');

  const execution = await api('POST', '/api/v1/ads/suggestions/sug-1/execute', {
    action: {
      actionType: 'INCREASE_BUDGET',
      budgetDeltaPercent: 0.35,
      confidence: 0.9,
      target: { sku: 'SKU2', tags: ['protected'], campaignType: 'SP', inventoryDays: 5 },
    },
    context: { activeEvents: ['Prime Day'] },
  });
  assert.equal(execution.guardrails.passes, false);
  assert.equal(execution.audit.result.ok, false);
});

test('full-scope M4 and audit APIs expose anomalies, routing, review drafts, SLA, and write blocking', async () => {
  const anomalyList = await api('GET', '/api/v1/monitor/anomalies');
  assert.equal(anomalyList.anomalies.length, 22);

  const notifications = await api('GET', '/api/v1/notifications');
  assert.ok(notifications.notifications.some((item) => item.dispatchMode === 'immediate'));

  const sla = await api('GET', '/api/v1/monitor/sla');
  assert.equal(sla.totalOpen, 22);

  const appeal = await api('POST', '/api/v1/reviews/appeals/draft');
  assert.equal(appeal.draft.submitMode, 'manual_review_only');

  const recovery = await api('POST', '/api/v1/reviews/recovery-emails/draft');
  assert.equal(recovery.draft.sendMode, 'manual_review_only');

  const postmortem = await api('POST', '/api/v1/monitor/postmortems/generate');
  assert.equal(postmortem.major, true);

  const quotas = await api('GET', '/api/v1/audit/quotas');
  assert.equal(quotas.quotas.perSkuDaily, 3);

  const reverted = await api('POST', '/api/v1/audit/audit-001/revert');
  assert.equal(reverted.result.ok, false);
  assert.equal(reverted.risk.executionMode, 'blocked_real_store');
});

test('documented endpoints not yet special-cased are implemented mock contracts instead of stubs', async () => {
  const costs = await api('GET', '/api/v1/costs/products');
  assert.equal(costs.status, 'implemented_mock_contract');
  assert.equal(costs.realStoreWrites, 'blocked_until_credentials_and_explicit_approval');
  assert.notEqual(costs.status, 'contract_stub_until_implemented');

  const entitlements = await api('GET', '/api/v1/commercial/entitlements');
  assert.ok(entitlements.entitlements);
});

async function api(method, path, body) {
  const response = await handleExtendedRequest(new Request(`http://localhost${path}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }));
  assert.equal(response.status, 200, `${method} ${path}`);
  return response.json();
}
