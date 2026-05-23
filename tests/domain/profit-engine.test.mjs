import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateProfit, calculateOrderProfit } from '../../packages/domain/src/profit-engine.mjs';

test('calculateOrderProfit returns net profit with confidence metadata', () => {
  const result = calculateOrderProfit({
    amazonOrderId: 'order-1',
    productId: 'p1',
    quantity: 2,
    itemPrice: 20,
    amazonReferralFee: 6,
    fbaFulfillmentFee: 8,
    cogs: 10,
    freight: 2,
    adCostAllocation: 4,
  });

  assert.equal(result.revenue, 40);
  assert.equal(result.netProfit, 8.8);
  assert.equal(result.breakdown.cogs, 10);
  assert.ok(result.accuracy.confidence > 0);
  assert.ok(result.accuracy.estimatedFields.includes('refundProvision'));
});

test('aggregateProfit summarizes orders', () => {
  const records = [
    calculateOrderProfit({ quantity: 1, itemPrice: 10, amazonReferralFee: 1, cogs: 2 }),
    calculateOrderProfit({ quantity: 1, itemPrice: 20, amazonReferralFee: 2, cogs: 4 }),
  ];

  const aggregate = aggregateProfit(records);
  assert.equal(aggregate.revenue, 30);
  assert.equal(aggregate.orders, 2);
  assert.ok(aggregate.netProfit > 0);
});
