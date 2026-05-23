import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPriceFollowDecision, buildReorderRecommendation, buildStaleInventoryDecision } from '../../packages/domain/src/inventory-engine.mjs';

test('buildReorderRecommendation flags urgent stockout risk', () => {
  const result = buildReorderRecommendation(
    { id: 'p1', sku: 'SKU1', unitCost: 5, leadTimeDays: 30, safetyStockDays: 7 },
    { available: 40, inbound: 0, avgDailySales: 10 },
  );
  assert.equal(result.urgency, 'high');
  assert.ok(result.recommendedQty > 0);
});

test('buildStaleInventoryDecision compares liquidation options', () => {
  const result = buildStaleInventoryDecision(
    { id: 'p1', sku: 'SKU1', unitCost: 10 },
    { available: 100, sales30d: 2, daysInWarehouse: 190, monthlyStorageFee: 25 },
  );
  assert.equal(result.isStale, true);
  assert.equal(result.options.length, 3);
});

test('buildPriceFollowDecision does not go below break even', () => {
  const result = buildPriceFollowDecision({ id: 'p1', sku: 'SKU1', price: 20, breakEvenPrice: 15 }, 12);
  assert.equal(result.recommendedPrice, 15);
  assert.equal(result.stillProfitable, false);
});
