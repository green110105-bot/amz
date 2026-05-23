import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateProfit, calculateOrderProfit } from '../../packages/domain/src/profit-engine.mjs';
import { generateAdSuggestions } from '../../packages/domain/src/lifecycle-engine.mjs';
import { clusterReviews, detectCompetitorChanges } from '../../packages/domain/src/market-intel-engine.mjs';
import { createAuditAction, mockExecuteAuditAction } from '../../packages/domain/src/audit-center.mjs';
import { realWriteBlocked } from '../../packages/domain/src/providers.mjs';
import {
  replayAds30Days,
  replayAuditWriteBlockFixtures,
  replayCostDefaults,
  replayMarketChangeReplay,
  replayOrderProfit24Months,
  replayProducts,
} from '../../packages/mock-data/src/replay-fixtures.mjs';

test('24-month order/profit replay is deterministic and matches profit engine totals', () => {
  assert.equal(replayOrderProfit24Months.length, 24);
  assert.deepEqual(replayOrderProfit24Months.map((month) => month.month).slice(0, 3), ['2024-05', '2024-06', '2024-07']);
  assert.equal(replayOrderProfit24Months.at(-1).month, '2026-04');

  const allRecords = [];
  for (const month of replayOrderProfit24Months) {
    assert.equal(month.metadata.sourceMode, 'mock');
    assert.equal(month.orders.length, replayProducts.length);
    const records = month.orders.map((order) => calculateOrderProfit(order, replayCostDefaults));
    const overview = aggregateProfit(records);
    allRecords.push(...records);

    assert.equal(overview.revenue, month.totals.revenue);
    assert.equal(overview.totalCosts, month.totals.totalCosts);
    assert.equal(overview.netProfit, month.totals.netProfit);
    assert.equal(overview.profitMargin, month.totals.profitMargin);
    assert.equal(month.totals.orders, 2);
    assert.ok(month.totals.units > 0);
  }

  const twoYearOverview = aggregateProfit(allRecords);
  assert.equal(twoYearOverview.orders, 48);
  assert.equal(twoYearOverview.revenue, 128946);
  assert.equal(twoYearOverview.netProfit, -7055.48);
  assert.ok(replayOrderProfit24Months.some((month) => month.totals.netProfit < 0));
});

test('30-day ad replay rolls up into profit-aware M3 suggestions', () => {
  assert.equal(replayAds30Days.length, 30);
  assert.equal(replayAds30Days[0].date, '2026-04-08');
  assert.equal(replayAds30Days.at(-1).date, '2026-05-07');

  const adMetrics = rollupAdRows(replayAds30Days.flatMap((day) => day.rows));
  const profitRecords = [
    { productId: 'replay-case-001', netProfit: 2380, revenue: 6900, totalCosts: 4520, profitMargin: 0.3449, accuracy: { confidence: 0.91 } },
    { productId: 'replay-lamp-002', netProfit: -220, revenue: 760, totalCosts: 980, profitMargin: -0.2895, accuracy: { confidence: 0.91 } },
  ];
  const inventory = [
    { productId: 'replay-case-001', available: 260, avgDailySales: 12, sales30d: 360 },
    { productId: 'replay-lamp-002', available: 420, avgDailySales: 2, sales30d: 36, daysInWarehouse: 120 },
  ];

  const suggestions = generateAdSuggestions({ products: replayProducts, adMetrics, profitRecords, inventory });
  const actionTypes = suggestions.map((item) => item.actionType);

  assert.deepEqual(adMetrics.map((row) => row.campaignId), [
    'camp-replay-case-growth',
    'camp-replay-lamp-waste',
    'camp-replay-lamp-zero-order',
  ]);
  assert.ok(actionTypes.includes('INCREASE_BUDGET'));
  assert.ok(actionTypes.includes('LOWER_BID_OR_PAUSE'));
  assert.ok(actionTypes.includes('ADD_NEGATIVE_KEYWORD'));
  assert.ok(suggestions.every((item) => item.auditRequired === true && item.status === 'pending_review'));
});

test('review and competitor replay produces stable clusters and market changes', () => {
  const caseClusters = clusterReviews(replayMarketChangeReplay.reviews.filter((review) => review.productId === 'replay-case-001'));
  const lampClusters = clusterReviews(replayMarketChangeReplay.reviews.filter((review) => review.productId === 'replay-lamp-002'));
  const changes = detectCompetitorChanges(
    replayMarketChangeReplay.competitorSnapshots.previous,
    replayMarketChangeReplay.competitorSnapshots.current,
  );

  assert.deepEqual(caseClusters.map((cluster) => cluster.id), ['quality', 'expectation']);
  assert.deepEqual(lampClusters.map((cluster) => cluster.id), ['packaging', 'instruction', 'performance']);
  assert.deepEqual(changes.map((change) => change.type).sort(), [
    'DEAL_STARTED',
    'LISTING_COPY_CHANGE',
    'NEW_COMPETITOR',
    'PRICE_CHANGE',
    'PRICE_CHANGE',
  ]);
  assert.ok(changes.every((change) => change.interpretation.length > 0));
});

test('audit replay blocks write-like operations and provider real writes', () => {
  for (const fixture of replayAuditWriteBlockFixtures) {
    const action = createAuditAction(fixture);
    const executed = mockExecuteAuditAction(action);

    assert.equal(executed.status, fixture.expectedStatus);
    assert.equal(executed.result.ok, false);
    assert.ok(executed.result.reasons.some((reason) => reason.includes(fixture.expectedReasonIncludes)));
    assert.equal(action.risk.executionMode, fixture.payload.requiresRealStoreWrite ? 'blocked_real_store' : 'mock');
  }

  const providerBlocked = realWriteBlocked('ads', 'updateCampaign');
  assert.equal(providerBlocked.ok, false);
  assert.equal(providerBlocked.sourceMode, 'mock');
});

function rollupAdRows(rows) {
  const byCampaign = new Map();
  for (const row of rows) {
    const current = byCampaign.get(row.campaignId) || {
      productId: row.productId,
      campaignId: row.campaignId,
      keyword: row.keyword,
      spend: 0,
      sales: 0,
      clicks30d: 0,
      orders30d: 0,
      targetAcos: row.targetAcos,
      lifecycleSignals: row.lifecycleSignals,
    };
    current.spend = round(current.spend + row.spend);
    current.sales = round(current.sales + row.sales);
    current.clicks30d += row.clicks;
    current.orders30d += row.orders;
    current.acos = current.sales === 0 ? 0 : round(current.spend / current.sales, 3);
    byCampaign.set(row.campaignId, current);
  }
  return Array.from(byCampaign.values()).sort((a, b) => a.campaignId.localeCompare(b.campaignId));
}

function round(value, digits = 2) {
  return Number(Number(value || 0).toFixed(digits));
}
