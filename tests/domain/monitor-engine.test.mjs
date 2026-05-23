import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMonitorOverview, detectAnomalies } from '../../packages/domain/src/monitor-engine.mjs';

test('detectAnomalies creates P0 and P1 events from mock signals', () => {
  const anomalies = detectAnomalies({
    products: [{ id: 'p1', sku: 'S1', asin: 'B0P1', returnRate7d: 0.12 }],
    inventory: [{ productId: 'p1', available: 20, avgDailySales: 5 }],
    adMetrics: [{ productId: 'p1', hourlySpend: 80, avgHourlySpend: 10 }],
    monitorSignals: { p1: { buyBoxLostMinutes: 40, listingChanged: true } },
  });

  assert.ok(anomalies.some((item) => item.type === 'BUY_BOX_LOST' && item.severity === 'P0'));
  assert.ok(anomalies.some((item) => item.type === 'LISTING_CHANGED' && item.severity === 'P0'));
  assert.ok(anomalies.some((item) => item.type === 'LOW_INVENTORY' && item.severity === 'P1'));
});

test('buildMonitorOverview summarizes mock notifications', () => {
  const overview = buildMonitorOverview({
    products: [{ id: 'p1', sku: 'S1', asin: 'B0P1' }],
    inventory: [],
    adMetrics: [],
    monitorSignals: { p1: { accountHealthAtRisk: true } },
  });

  assert.equal(overview.sourceMode, 'mock');
  assert.equal(overview.summary.p0, 1);
  assert.equal(overview.notifications[0].channel, 'in_app_mock');
});
