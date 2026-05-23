import test from 'node:test';
import assert from 'node:assert/strict';
import { detectProfitLeaks } from '../../packages/domain/src/leak-detector.mjs';

test('detectProfitLeaks finds margin, returns, ad and inventory risks', () => {
  const products = [{ id: 'p1', asin: 'B0P1', sku: 'SKU1', unitCost: 10, returnRate7d: 0.1, returnRate30d: 0.03 }];
  const profitRecords = [{ productId: 'p1', netProfit: -20, profitMargin: -0.15 }];
  const adMetrics = [{ productId: 'p1', spend: 100 }];
  const inventory = [{ productId: 'p1', available: 50, sales7d: 0, daysInStock: 45, daysInWarehouse: 280 }];

  const leaks = detectProfitLeaks({ products, profitRecords, adMetrics, inventory });
  const types = leaks.map((leak) => leak.type);
  assert.ok(types.includes('PRICE_BELOW_FULL_COST'));
  assert.ok(types.includes('RETURN_RATE_SPIKE'));
  assert.ok(types.includes('AD_PROFIT_ROAS_LOW'));
  assert.ok(types.includes('STAGNANT_INVENTORY'));
  assert.equal(leaks[0].severity, 'P0');
});
