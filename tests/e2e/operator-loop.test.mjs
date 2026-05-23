import test from 'node:test';
import assert from 'node:assert/strict';
import { handleExtendedRequest } from '../../apps/api/src/extended-routes.mjs';

test('E2E operator loop: onboarding to listing, profit, ads audit, M4 SLA, and commercial quota', async () => {
  const onboarding = await api('GET', '/api/v1/commercial/onboarding');
  assert.equal(onboarding.sourceMode, 'mock');
  assert.equal(onboarding.module, 'PRD');
  assert.equal(onboarding.source.mode, 'deterministic_mock');
  assert.ok(['basic_mock', 'decision_ready', 'full_data_ready'].includes(onboarding.plan.readiness));
  assert.ok(onboarding.plan.steps.length > 0);

  const entitlements = await api('GET', '/api/v1/commercial/entitlements');
  const listingsMinimumSkuCount = 1;
  assert.equal(entitlements.sourceMode, 'mock');
  assert.ok(entitlements.entitlements.skus >= listingsMinimumSkuCount);

  const listings = await api('GET', '/api/v1/listings');
  const productId = listings.listings[0].productId;
  assert.equal(listings.source.mode, 'deterministic_mock');
  assert.ok(productId);

  const diagnosis = await api('POST', `/api/v1/listings/${productId}/diagnose`);
  assert.equal(diagnosis.status, 'completed_mock');
  assert.ok(diagnosis.diagnosis.improvements.length > 0);

  const iterationStart = await api('POST', `/api/v1/listings/${productId}/iterations`, { createdBy: 'e2e-qa' });
  const iterationId = iterationStart.iteration.id;
  assert.match(iterationId, /^m1iter-/);

  const round = await api('POST', `/api/v1/iterations/${iterationId}/rounds`, {
    improvement: diagnosis.diagnosis.improvements[0],
  });
  assert.equal(round.round.proposals.length, 3);

  const proposals = await api('POST', `/api/v1/iterations/${iterationId}/rounds/1/proposals`, {
    improvement: diagnosis.diagnosis.improvements[0],
    preferences: { tone: 'evidence_first' },
  });
  assert.equal(proposals.proposals.length, 3);

  const decision = await api('PUT', `/api/v1/iterations/${iterationId}/rounds/1/decision`, {
    action: 'accept',
    selectedProposalId: proposals.proposals[0].id,
    feedback: 'E2E accepts deterministic mock proposal.',
  });
  assert.equal(decision.iteration.rounds[0].status, 'completed');

  const preview = await api('POST', `/api/v1/iterations/${iterationId}/preview`);
  assert.ok(preview.preview.changes.length > 0);

  const applied = await api('POST', `/api/v1/iterations/${iterationId}/apply`, {
    confirm: true,
    appliedBy: 'e2e-qa',
  });
  assert.equal(applied.realStoreWrite, 'blocked_until_credentials');
  assert.equal(applied.iteration.status, 'applied');

  const profit = await api('GET', `/api/v1/profit/skus/${productId}`);
  assert.equal(profit.module, 'M2');
  assert.ok(Number.isFinite(profit.overview.netProfit));

  const cashflow = await api('GET', '/api/v1/profit/cashflow');
  assert.ok(cashflow.windows.some((window) => window.days === 90));
  assert.ok(cashflow.warnings.length >= 0);

  const scenario = await api('POST', '/api/v1/profit/scenario/single-sku', {
    productId,
    horizonDays: 30,
    adjustments: { priceChangePct: -0.03, acosDelta: 0.01 },
  });
  assert.ok(scenario.delta);

  const adSuggestion = await api('GET', '/api/v1/ads/suggestions/e2e-sug-guardrail');
  assert.equal(adSuggestion.module, 'M3');
  assert.equal(adSuggestion.suggestion.id, 'e2e-sug-guardrail');

  const guardedExecution = await api('POST', '/api/v1/ads/suggestions/e2e-sug-guardrail/execute', {
    action: {
      actionType: 'INCREASE_BUDGET',
      budgetDeltaPercent: 0.4,
      confidence: 0.92,
      target: { sku: 'CASE-001', campaignType: 'SP', inventoryDays: 3, tags: ['protected'] },
      expectedImpact: { risk: 'budget_spike' },
      requestedBy: 'e2e-qa',
    },
    context: { activeEvents: ['Prime Day'] },
    usage: { dailyAutoActionsForSku: 3, dailyAutoActionsTotal: 99, weeklyBudgetChangePct: 0.35 },
  });
  assert.equal(guardedExecution.guardrails.passes, false);
  assert.equal(guardedExecution.audit.result.ok, false);
  assert.equal(guardedExecution.audit.risk.executionMode, 'blocked_real_store');

  const auditLog = await api('GET', `/api/v1/audit/${guardedExecution.audit.id}`);
  assert.equal(auditLog.module, 'AUDIT');
  assert.equal(auditLog.auditLog.id, guardedExecution.audit.id);

  const anomalies = await api('GET', '/api/v1/monitor/anomalies');
  assert.equal(anomalies.module, 'M4');
  assert.ok(anomalies.anomalies.length > 0);
  const anomalyId = anomalies.anomalies[0].anomalyId;

  const sla = await api('GET', '/api/v1/monitor/sla');
  assert.equal(sla.module, 'M4');
  assert.ok(sla.totalOpen >= anomalies.anomalies.length);
  assert.ok(Object.keys(sla.bySeverity).length > 0);

  const assignment = await api('POST', `/api/v1/monitor/anomalies/${anomalyId}/assign`);
  assert.equal(assignment.assignment.anomalyId, anomalyId);
  assert.ok(assignment.assignment.assignees.length > 0);

  const resolution = await api('POST', `/api/v1/monitor/anomalies/${anomalyId}/resolve`, {
    actions: [{ id: 'manual-check', status: 'completed_mock' }],
  });
  assert.equal(resolution.status, 'resolved_mock');
  assert.equal(resolution.case.result, 'resolved');

  const quota = await api('GET', '/api/v1/commercial/quota');
  assert.equal(quota.module, 'PRD');
  assert.equal(typeof quota.quota.allowed, 'boolean');
  assert.ok(Array.isArray(quota.quota.warnings));

  const usage = await api('POST', '/api/v1/commercial/usage', {
    events: [
      { type: 'ai_decision', units: 2 },
      { type: 'third_party_call', units: 1 },
      { type: 'write_action', units: 1 },
    ],
  });
  assert.deepEqual(usage.usage, { aiDecisions: 2, imageGenerations: 0, thirdPartyCalls: 1, writeActions: 1 });
});

async function api(method, path, body) {
  const response = await handleExtendedRequest(new Request(`http://localhost${path}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }));
  assert.equal(response.status, 200, `${method} ${path}`);
  const payload = await response.json();
  assert.equal(payload.sourceMode, 'mock', `${method} ${path} sourceMode`);
  assert.ok(payload.source?.confidence >= 0.9, `${method} ${path} confidence metadata`);
  return payload;
}






