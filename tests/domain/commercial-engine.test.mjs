import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOnboardingPlan, evaluateQuotaUsage, hasPermission, meterUsage } from '../../packages/domain/src/commercial-engine.mjs';

test('evaluateQuotaUsage enforces plan limits and warnings', () => {
  const result = evaluateQuotaUsage({ plan: 'growth', stores: 3, skus: 450, members: 5, aiUsed: 3000 });
  assert.equal(result.allowed, true);
  assert.ok(result.warnings.some((warning) => warning.includes('skus')));

  const exceeded = evaluateQuotaUsage({ plan: 'starter', stores: 2 });
  assert.equal(exceeded.allowed, false);
});

test('hasPermission supports wildcard role permissions', () => {
  assert.equal(hasPermission('admin', 'm1:write'), true);
  assert.equal(hasPermission('operations_manager', 'm3:write'), true);
  assert.equal(hasPermission('readonly', 'm3:write'), false);
});

test('buildOnboardingPlan models staged data readiness', () => {
  assert.equal(buildOnboardingPlan({}).readiness, 'basic_mock');
  assert.equal(buildOnboardingPlan({ hasSpApi: true, hasAdsApi: true, hasCostUpload: true, products: 10 }).readiness, 'decision_ready');
  assert.equal(buildOnboardingPlan({ hasSpApi: true, hasAdsApi: true, hasCostUpload: true, hasThirdParty: true, products: 10 }).readiness, 'full_data_ready');
});

test('meterUsage aggregates billable counters', () => {
  const usage = meterUsage([
    { type: 'ai_decision', units: 3 },
    { type: 'third_party_call', units: 2 },
    { type: 'write_action' },
  ]);
  assert.deepEqual(usage, { aiDecisions: 3, imageGenerations: 0, thirdPartyCalls: 2, writeActions: 1 });
});
