import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyLifecycle, generateAdSuggestions } from '../../packages/domain/src/lifecycle-engine.mjs';

test('classifyLifecycle identifies launch and growth stages', () => {
  assert.equal(classifyLifecycle({ id: 'p1', sku: 'S1', daysListed: 30, reviewCount: 5 }).stage, 'launch');
  assert.equal(classifyLifecycle({ id: 'p2', sku: 'S2' }, { daysListed: 120, reviewCount: 80, salesTrend4w: 0.2 }).stage, 'growth');
});

test('generateAdSuggestions creates profit-aware actions', () => {
  const suggestions = generateAdSuggestions({
    products: [{ id: 'p1', sku: 'S1', daysListed: 140, reviewCount: 70 }],
    profitRecords: [{ productId: 'p1', netProfit: -10 }],
    inventory: [{ productId: 'p1', available: 200, avgDailySales: 5 }],
    adMetrics: [{ productId: 'p1', campaignId: 'c1', spend: 100, sales: 300, acos: 0.3, targetAcos: 0.25, clicks30d: 35, orders30d: 0 }],
  });

  assert.ok(suggestions.some((item) => item.actionType === 'LOWER_BID_OR_PAUSE'));
  assert.ok(suggestions.some((item) => item.actionType === 'ADD_NEGATIVE_KEYWORD'));
});
