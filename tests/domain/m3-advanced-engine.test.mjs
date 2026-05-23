import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBrandDefensePlan,
  evaluateAdvancedAutoExecutionGuardrails,
  evaluateCreativeAbTest,
  optimizeBudgetAllocation,
  recommendCompetitorAsinAttacks,
  recommendDaypartingBids,
  recommendPlacementAdjustments,
} from '../../packages/domain/src/m3-advanced-engine.mjs';

test('optimizeBudgetAllocation shifts budget toward higher marginal profit campaigns', () => {
  const result = optimizeBudgetAllocation({
    totalBudget: 250,
    campaigns: [
      {
        campaignId: 'growth-sp',
        currentBudget: 100,
        spend: 95,
        sales: 600,
        profit: 220,
        profitRoas: 2.31,
        acos: 0.16,
        targetAcos: 0.3,
        lifecycleStage: 'growth',
        budgetLimitedDays: 5,
        minBudget: 60,
        maxBudget: 180,
      },
      {
        campaignId: 'waste-auto',
        currentBudget: 100,
        spend: 80,
        sales: 120,
        profit: -30,
        profitRoas: -0.38,
        acos: 0.66,
        targetAcos: 0.25,
        minBudget: 30,
        maxBudget: 120,
      },
      {
        campaignId: 'steady-sb',
        currentBudget: 50,
        spend: 45,
        sales: 160,
        profit: 50,
        profitRoas: 1.11,
        acos: 0.28,
        targetAcos: 0.35,
        minBudget: 30,
        maxBudget: 80,
      },
    ],
  });

  const byId = new Map(result.recommendations.map((item) => [item.campaignId, item]));
  assert.equal(result.allocatedBudget, 250);
  assert.ok(byId.get('growth-sp').recommendedBudget > 100);
  assert.ok(byId.get('waste-auto').recommendedBudget < 100);
  assert.equal(byId.get('growth-sp').actionType, 'INCREASE_BUDGET');
  assert.equal(byId.get('waste-auto').actionType, 'DECREASE_BUDGET');
  assert.ok(result.expectedProfitDelta > 0);
  assert.equal(result.source.mode, 'deterministic_mock');
});

test('recommendDaypartingBids creates 7x24 bid modifiers from hourly CVR and profit ROAS', () => {
  const result = recommendDaypartingBids({
    baseBid: 1,
    config: { minClicks: 50 },
    hourlyMetrics: [
      { dayOfWeek: 1, hour: 14, impressions: 1000, clicks: 100, orders: 20, spend: 50, profit: 100 },
      { dayOfWeek: 1, hour: 3, impressions: 900, clicks: 100, orders: 2, spend: 40, profit: -10 },
    ],
  });

  const peak = result.schedule.find((slot) => slot.dayOfWeek === 1 && slot.hour === 14);
  const overnight = result.schedule.find((slot) => slot.dayOfWeek === 1 && slot.hour === 3);

  assert.equal(result.schedule.length, 168);
  assert.equal(peak.bidAdjustmentPct, 0.25);
  assert.equal(peak.recommendedBid, 1.25);
  assert.equal(overnight.bidAdjustmentPct, -0.5);
  assert.equal(overnight.recommendedBid, 0.5);
  assert.ok(result.windows.some((window) => window.dayOfWeek === 1 && window.startHour <= 14 && window.endHour > 14));
});

test('recommendPlacementAdjustments separates top-of-search winners from product-page waste', () => {
  const result = recommendPlacementAdjustments({
    campaign: { campaignId: 'c1', targetProfitRoas: 1.2 },
    config: { minClicks: 20 },
    placements: [
      { placement: 'top_of_search', clicks: 120, orders: 18, spend: 100, sales: 700, profit: 250, currentAdjustmentPct: 0 },
      { placement: 'product_pages', clicks: 120, orders: 3, spend: 100, sales: 120, profit: -40, currentAdjustmentPct: 0 },
    ],
  });

  const top = result.recommendations.find((item) => item.placement === 'top_of_search');
  const detail = result.recommendations.find((item) => item.placement === 'product_pages');

  assert.equal(top.actionType, 'ADJUST_PLACEMENT_BID');
  assert.ok(top.recommendedAdjustmentPct > 0);
  assert.equal(detail.actionType, 'ADJUST_PLACEMENT_BID');
  assert.ok(detail.recommendedAdjustmentPct < 0);
});

test('buildBrandDefensePlan fills brand exact, bid, and SD ASIN defense gaps', () => {
  const result = buildBrandDefensePlan({
    brandName: 'Acme',
    categoryAvgBid: 1,
    brandTerms: [
      {
        term: 'acme case',
        currentBid: 1,
        adRank: 3,
        topOfSearchShare: 0.45,
        competitorShare: 0.25,
        competitorBidDetected: true,
      },
    ],
    campaigns: [{ campaignId: 'generic-sp', name: 'Generic SP', adType: 'SP', keywords: ['phone case'] }],
    ownAsins: [{ asin: 'B0OWN1', relatedAsins: ['B0OWN2'] }],
  });

  const actions = result.recommendations.map((item) => item.actionType);
  assert.equal(result.status, 'exposed');
  assert.ok(result.coverageScore < 65);
  assert.ok(actions.includes('CREATE_BRAND_DEFENSE_CAMPAIGN'));
  assert.ok(actions.includes('ADD_BRAND_TERM_TO_EXACT_CAMPAIGN'));
  assert.ok(actions.includes('CREATE_SD_DEFENSE_CAMPAIGN'));
});

test('recommendCompetitorAsinAttacks ranks reachable competitor ASINs by attackability', () => {
  const result = recommendCompetitorAsinAttacks({
    categoryAvgBid: 1.2,
    ownProduct: { asin: 'B0OWN1', bsr: 40, rating: 4.6, price: 20, reviewCount: 500 },
    competitors: [
      { asin: 'B0TARGET', bsr: 28, rating: 4.1, price: 22, reviewCount: 300, ageDays: 180 },
      { asin: 'B0STRONG', bsr: 5, rating: 4.8, price: 18, reviewCount: 2000, ageDays: 500 },
    ],
  });

  assert.equal(result.recommendations[0].targetAsin, 'B0TARGET');
  assert.ok(result.recommendations[0].attackScore >= 70);
  assert.deepEqual(result.recommendations[0].strategy, ['SD_PRODUCT_TARGETING', 'SP_PRODUCT_TARGETING']);
  assert.ok(result.rejected.some((item) => item.targetAsin === 'B0STRONG'));
});

test('evaluateCreativeAbTest declares a significant treatment winner after enough data', () => {
  const result = evaluateCreativeAbTest({
    abTest: {
      id: 'ab-1',
      elapsedDays: 14,
      control: {
        creativeId: 'creative-a',
        impressions: 40000,
        clicks: 800,
        orders: 40,
        spend: 700,
        sales: 2000,
        profit: 600,
      },
      treatment: {
        creativeId: 'creative-b',
        impressions: 40000,
        clicks: 1100,
        orders: 88,
        spend: 900,
        sales: 4200,
        profit: 1500,
      },
    },
  });

  assert.equal(result.status, 'ready_to_decide');
  assert.equal(result.significance, 'significant');
  assert.equal(result.winnerCreativeId, 'creative-b');
  assert.equal(result.recommendation, 'ADOPT_TREATMENT');
  assert.ok(result.metrics.lifts.roasLift > 0);
});

test('evaluateAdvancedAutoExecutionGuardrails allows safe mock execution and queues unsafe actions', () => {
  const safe = evaluateAdvancedAutoExecutionGuardrails({
    config: { enabled: true },
    usage: { dailyAutoActionsForSku: 1, dailyAutoActionsTotal: 10, weeklyBudgetChangePct: 0.1 },
    context: { activeEvents: [] },
    action: {
      actionType: 'DAYPARTING_BID_ADJUSTMENT',
      bidChangePercent: 0.1,
      confidence: 0.9,
      target: { sku: 'SKU1', campaignType: 'SP', inventoryDays: 30 },
    },
  });

  const unsafe = evaluateAdvancedAutoExecutionGuardrails({
    config: { enabled: true },
    usage: { dailyAutoActionsForSku: 1, dailyAutoActionsTotal: 10, weeklyBudgetChangePct: 0.1 },
    context: { activeEvents: ['Prime Day'] },
    action: {
      actionType: 'INCREASE_BUDGET',
      budgetDeltaPercent: 0.35,
      confidence: 0.9,
      target: { sku: 'SKU2', tags: ['protected'], campaignType: 'SP', inventoryDays: 5 },
    },
  });

  assert.equal(safe.passes, true);
  assert.equal(safe.decision, 'allow_mock_auto_execution');
  assert.equal(safe.audit.rollbackWindowDays, 7);

  assert.equal(unsafe.passes, false);
  assert.equal(unsafe.decision, 'queue_for_human_review');
  const failedChecks = unsafe.checks.filter((check) => !check.passes).map((check) => check.name);
  assert.ok(failedChecks.includes('value_threshold'));
  assert.ok(failedChecks.includes('sku_exclusion'));
  assert.ok(failedChecks.includes('event_pause'));
  assert.ok(failedChecks.includes('inventory_pressure'));
});
