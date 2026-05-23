const FIXTURE_VERSION = 'ad-timeseries.v1';
const DEFAULT_AS_OF_DATE = '2026-05-08';
const SOURCE_MODE = 'deterministic_mock';
const DAY_MS = 86400000;
const REQUIRED_SCENARIOS = Object.freeze([
  'launch',
  'growth',
  'mature',
  'decline',
  'high-acos',
  'zero-order-spend',
  'budget-capped',
  'dayparting-peaks',
  'placement-waste',
  'brand-defense-exposed',
  'competitor-attack',
  'stockout-constrained',
  'outlier-spike',
  'outlier-drop',
  'attribution-lag',
  'negative-keyword-opportunity',
  'guardrail-blocked',
]);

const DEFAULT_COMBOS = Object.freeze([
  {
    asin: 'B0MOCKLAUNCH',
    sku: 'M3-LAUNCH-001',
    productId: 'prod-launch',
    campaignId: 'cmp-launch-sp',
    campaignName: 'SP Launch Discovery',
    lifecycleStage: 'launch',
    scenarios: ['launch', 'zero-order-spend', 'negative-keyword-opportunity'],
    base: { impressions: 900, ctr: 0.026, cvr: 0.012, cpc: 0.82, price: 24, margin: 0.29, dailyBudget: 45, targetAcos: 0.35, bid: 0.92 },
    listedDays: 38,
    reviews: 12,
    inventoryDays: 42,
  },
  {
    asin: 'B0MOCKGROW',
    sku: 'M3-GROWTH-002',
    productId: 'prod-growth',
    campaignId: 'cmp-growth-sp',
    campaignName: 'SP Growth Exact',
    lifecycleStage: 'growth',
    scenarios: ['growth', 'budget-capped', 'dayparting-peaks', 'attribution-lag'],
    base: { impressions: 1500, ctr: 0.038, cvr: 0.12, cpc: 0.72, price: 31, margin: 0.36, dailyBudget: 62, targetAcos: 0.28, bid: 1.05 },
    listedDays: 145,
    reviews: 78,
    inventoryDays: 34,
  },
  {
    asin: 'B0MOCKMATURE',
    sku: 'M3-MATURE-003',
    productId: 'prod-mature',
    campaignId: 'cmp-mature-brand',
    campaignName: 'SP Acme Brand Core',
    lifecycleStage: 'mature',
    scenarios: ['mature', 'brand-defense-exposed', 'placement-waste'],
    base: { impressions: 1200, ctr: 0.045, cvr: 0.095, cpc: 0.65, price: 28, margin: 0.33, dailyBudget: 55, targetAcos: 0.3, bid: 0.98 },
    listedDays: 420,
    reviews: 245,
    inventoryDays: 67,
  },
  {
    asin: 'B0MOCKDECLN',
    sku: 'M3-DECLINE-004',
    productId: 'prod-decline',
    campaignId: 'cmp-decline-auto',
    campaignName: 'SP Decline Auto Harvest',
    lifecycleStage: 'decline',
    scenarios: ['decline', 'high-acos', 'outlier-drop', 'guardrail-blocked'],
    base: { impressions: 1100, ctr: 0.031, cvr: 0.034, cpc: 1.05, price: 22, margin: 0.24, dailyBudget: 48, targetAcos: 0.25, bid: 1.18 },
    listedDays: 520,
    reviews: 190,
    inventoryDays: 92,
  },
  {
    asin: 'B0MOCKATACK',
    sku: 'M3-ATTACK-005',
    productId: 'prod-attack',
    campaignId: 'cmp-attack-sd',
    campaignName: 'SD Competitor Attack',
    lifecycleStage: 'mature',
    scenarios: ['competitor-attack', 'stockout-constrained', 'outlier-spike'],
    base: { impressions: 1000, ctr: 0.034, cvr: 0.082, cpc: 0.88, price: 35, margin: 0.38, dailyBudget: 52, targetAcos: 0.32, bid: 0.9 },
    listedDays: 310,
    reviews: 165,
    inventoryDays: 5,
  },
]);

export { REQUIRED_SCENARIOS };

export function generateAdTimeseries(options = {}) {
  const days = Math.max(90, Math.trunc(Number(options.days ?? 90)));
  const hourlyDays = Math.max(1, Math.trunc(Number(options.hourlyDays ?? days)));
  const asOfDate = options.asOfDate ?? DEFAULT_AS_OF_DATE;
  const comboLimit = Math.max(5, Math.trunc(Number(options.comboCount ?? 5)));
  const combos = (options.combos ?? DEFAULT_COMBOS).slice(0, comboLimit);
  const end = parseDateOnly(asOfDate);
  const start = new Date(end.getTime() - (days - 1) * DAY_MS);
  const hourlyStart = new Date(end.getTime() - (hourlyDays - 1) * DAY_MS);
  const daily = [];
  const hourly = [];

  combos.forEach((combo, comboIndex) => {
    for (let dayIndex = 0; dayIndex < days; dayIndex += 1) {
      const date = new Date(start.getTime() + dayIndex * DAY_MS);
      const metric = buildDailyMetric(combo, comboIndex, dayIndex, days, date);
      daily.push(metric);
    }
    for (let dayIndex = 0; dayIndex < hourlyDays; dayIndex += 1) {
      const date = new Date(hourlyStart.getTime() + dayIndex * DAY_MS);
      for (let hour = 0; hour < 24; hour += 1) {
        hourly.push(buildHourlyMetric(combo, comboIndex, dayIndex, hourlyDays, date, hour));
      }
    }
  });

  const campaigns = combos.map((combo) => rollupCampaign(combo, daily.filter((row) => row.campaignId === combo.campaignId)));
  const products = combos.map(productFromCombo);
  const inventory = combos.map(inventoryFromCombo);
  const profitRecords = campaigns.map((campaign) => ({ productId: campaign.productId, netProfit: round(campaign.profit), source: source(0.86, ['daily_ads_rollup', 'mock_margin']) }));
  const adMetrics30d = campaigns.map((campaign) => toLifecycleAdMetric(campaign));
  const placementMetrics = buildPlacementMetrics(combos);
  const brandTerms = buildBrandTerms();
  const competitorTargets = buildCompetitorTargets();
  const guardrailActions = buildGuardrailActions(combos);
  const expectedSignals = buildExpectedSignals();

  return deepFreeze({
    metadata: {
      fixtureVersion: FIXTURE_VERSION,
      generatedAt: '2026-05-08T00:00:00.000+08:00',
      asOfDate,
      sourceMode: SOURCE_MODE,
      deterministicSeed: 'm3-ad-timeseries-2026-05-08-v1',
      dayLevelDays: days,
      hourlyLevelDays: hourlyDays,
      timezone: 'Asia/Shanghai',
      realWritesPerformed: false,
    },
    source: source(0.91, ['amazon_ads_api_mock', 'spapi_catalog_mock', 'm2_profit_mock', 'inventory_mock']),
    confidence: 0.91,
    writePolicy: {
      realWriteAllowed: false,
      allowedActions: ['read_fixture', 'draft_ad_suggestion', 'queue_audit_action'],
      blockedActions: ['ads.updateCampaignBudget', 'ads.updateBid', 'ads.addNegativeKeyword', 'ads.createCampaign', 'spapi.patchListing', 'external_network_mutation'],
    },
    scenarioCoverage: REQUIRED_SCENARIOS.map((scenario) => ({
      scenario,
      covered: combos.some((combo) => combo.scenarios.includes(scenario)),
      campaignIds: combos.filter((combo) => combo.scenarios.includes(scenario)).map((combo) => combo.campaignId),
      expectedSignals: expectedSignals.filter((signal) => signal.scenarios.includes(scenario)).map((signal) => signal.signal),
    })),
    expectedSignals,
    combos: combos.map((combo) => ({
      asin: combo.asin,
      sku: combo.sku,
      productId: combo.productId,
      campaignId: combo.campaignId,
      campaignName: combo.campaignName,
      lifecycleStage: combo.lifecycleStage,
      scenarios: combo.scenarios,
      source: source(0.9, ['scenario_design']),
      confidence: 0.9,
    })),
    products,
    inventory,
    profitRecords,
    campaigns,
    daily,
    hourly,
    placementMetrics,
    brandDefense: {
      brandName: 'Acme',
      categoryAvgBid: 1,
      brandTerms,
      campaigns: campaigns.map((campaign) => ({ ...campaign, keywords: campaign.campaignId === 'cmp-mature-brand' ? ['acme case broad'] : ['generic case'] })),
      ownAsins: combos.map((combo) => ({ asin: combo.asin, relatedAsins: combos.filter((item) => item.asin !== combo.asin).slice(0, 2).map((item) => item.asin), confidence: 0.84 })),
    },
    competitorAttack: {
      ownProduct: { asin: 'B0MOCKATACK', bsr: 42, rating: 4.6, price: 35, reviewCount: 165 },
      categoryAvgBid: 1.15,
      competitors: competitorTargets,
    },
    guardrailActions,
    engineInputs: {
      lifecycle: { products, adMetrics: adMetrics30d, profitRecords, inventory },
      budgetAllocation: { campaigns, totalBudget: round(sum(campaigns.map((campaign) => campaign.currentBudget)) * 1.05) },
      dayparting: { baseBid: 1, hourlyMetrics: hourly, config: { minClicks: 40 } },
      placements: { campaign: { campaignId: 'cmp-mature-brand', targetProfitRoas: 1.1 }, placements: placementMetrics },
      brandDefense: { brandName: 'Acme', categoryAvgBid: 1, brandTerms, campaigns: campaigns.map((campaign) => ({ ...campaign, keywords: campaign.campaignId === 'cmp-mature-brand' ? ['acme case broad'] : ['generic case'] })), ownAsins: combos.map((combo) => ({ asin: combo.asin, relatedAsins: [] })) },
      competitorAttack: { ownProduct: { asin: 'B0MOCKATACK', bsr: 42, rating: 4.6, price: 35, reviewCount: 165 }, categoryAvgBid: 1.15, competitors: competitorTargets },
      guardrails: { action: guardrailActions.blockedAction, config: { enabled: true }, usage: { dailyAutoActionsForSku: 6, dailyAutoActionsTotal: 101, weeklyBudgetChangePct: 0.58 }, context: { activeEvents: ['Prime Day'] } },
    },
  });
}

function buildDailyMetric(combo, comboIndex, dayIndex, days, date) {
  const progress = dayIndex / Math.max(1, days - 1);
  const phase = Math.sin((dayIndex + comboIndex * 3) / 5) * 0.08;
  let trend = 1;
  if (combo.lifecycleStage === 'launch') trend = 0.45 + progress * 0.9;
  if (combo.lifecycleStage === 'growth') trend = 0.75 + progress * 0.75;
  if (combo.lifecycleStage === 'decline') trend = 1.2 - progress * 0.55;
  let cvrMultiplier = 1;
  let cpcMultiplier = 1;
  let budgetLimited = false;
  let attributionDelayedOrders = 0;
  const scenarioFlags = [];

  if (combo.scenarios.includes('high-acos')) { cvrMultiplier *= 0.62; cpcMultiplier *= 1.28; scenarioFlags.push('high-acos'); }
  if (combo.scenarios.includes('budget-capped') && dayIndex % 6 >= 3) { budgetLimited = true; scenarioFlags.push('budget-capped'); }
  if (combo.scenarios.includes('zero-order-spend') && dayIndex >= days - 30 && dayIndex % 5 !== 0) { cvrMultiplier = 0; scenarioFlags.push('zero-order-spend'); }
  if (combo.scenarios.includes('stockout-constrained') && dayIndex >= days - 14) { trend *= 0.58; scenarioFlags.push('stockout-constrained'); }
  if (combo.scenarios.includes('outlier-spike') && dayIndex === days - 11) { trend *= 2.8; scenarioFlags.push('outlier-spike'); }
  if (combo.scenarios.includes('outlier-drop') && dayIndex === days - 9) { trend *= 0.16; cvrMultiplier *= 0.25; scenarioFlags.push('outlier-drop'); }
  if (combo.scenarios.includes('attribution-lag') && dayIndex >= days - 3) { attributionDelayedOrders = Math.max(1, Math.round(combo.base.impressions * combo.base.ctr * combo.base.cvr * 0.55)); cvrMultiplier *= 0.48; scenarioFlags.push('attribution-lag'); }

  const impressions = Math.max(80, Math.round(combo.base.impressions * trend * (1 + phase)));
  const clicks = Math.max(0, Math.round(impressions * combo.base.ctr * (1 + ((dayIndex % 7) - 3) * 0.015)));
  const cpc = combo.base.cpc * cpcMultiplier * (budgetLimited ? 1.04 : 1);
  let spend = round(clicks * cpc);
  if (budgetLimited && spend > combo.base.dailyBudget * 0.96) spend = round(combo.base.dailyBudget * (0.96 + (dayIndex % 3) * 0.01));
  const orders = cvrMultiplier === 0 ? 0 : Math.max(0, Math.round(clicks * combo.base.cvr * cvrMultiplier));
  const attributedOrders = orders + attributionDelayedOrders;
  const sales = round(attributedOrders * combo.base.price);
  const profit = round(sales * combo.base.margin - spend);

  return {
    date: isoDate(date),
    asin: combo.asin,
    sku: combo.sku,
    productId: combo.productId,
    campaignId: combo.campaignId,
    campaignName: combo.campaignName,
    lifecycleStage: combo.lifecycleStage,
    scenarios: [...new Set([combo.lifecycleStage, ...scenarioFlags])],
    impressions,
    clicks,
    orders,
    attributedOrders,
    spend,
    sales,
    profit,
    acos: safeRatio(spend, sales),
    roas: safeRatio(sales, spend),
    profitRoas: safeRatio(profit, spend),
    targetAcos: combo.base.targetAcos,
    budget: combo.base.dailyBudget,
    budgetCapped: budgetLimited,
    attributionDelayedOrders,
    source: source(0.9, ['daily_ads_mock']),
    confidence: 0.9,
  };
}

function buildHourlyMetric(combo, comboIndex, dayIndex, totalDays, date, hour) {
  const dayOfWeek = date.getUTCDay();
  const peak = combo.scenarios.includes('dayparting-peaks') && ((hour >= 12 && hour <= 14) || (hour >= 20 && hour <= 22));
  const overnightWaste = hour >= 1 && hour <= 4;
  const daily = buildDailyMetric(combo, comboIndex, dayIndex, totalDays, date);
  const weight = peak ? 0.082 : overnightWaste ? 0.018 : 0.034;
  const impressions = Math.max(1, Math.round(daily.impressions * weight));
  const clicks = Math.max(0, Math.round(daily.clicks * weight * (peak ? 1.6 : overnightWaste ? 0.8 : 1)));
  const cvrBoost = peak ? 1.9 : overnightWaste ? 0.22 : 0.92;
  const orders = Math.max(0, Math.round(clicks * combo.base.cvr * cvrBoost));
  const spend = round(clicks * combo.base.cpc * (overnightWaste ? 1.15 : 1));
  const sales = round(orders * combo.base.price);
  const profit = round(sales * combo.base.margin - spend);
  return {
    timestamp: `${isoDate(date)}T${String(hour).padStart(2, '0')}:00:00.000+08:00`,
    date: isoDate(date),
    dayOfWeek,
    hour,
    asin: combo.asin,
    sku: combo.sku,
    productId: combo.productId,
    campaignId: combo.campaignId,
    campaignName: combo.campaignName,
    scenarios: peak ? ['dayparting-peaks'] : overnightWaste ? ['dayparting-waste'] : [combo.lifecycleStage],
    impressions,
    clicks,
    orders,
    spend,
    sales,
    profit,
    source: source(0.88, ['hourly_ads_mock']),
    confidence: 0.88,
  };
}

function rollupCampaign(combo, rows) {
  const last30 = rows.slice(-30);
  const spend = sum(last30.map((row) => row.spend));
  const sales = sum(last30.map((row) => row.sales));
  const profit = sum(last30.map((row) => row.profit));
  const clicks = sum(last30.map((row) => row.clicks));
  const orders = sum(last30.map((row) => row.orders));
  return {
    asin: combo.asin,
    sku: combo.sku,
    productId: combo.productId,
    campaignId: combo.campaignId,
    name: combo.campaignName,
    lifecycleStage: combo.lifecycleStage,
    scenarios: combo.scenarios,
    currentBudget: combo.base.dailyBudget,
    minBudget: round(combo.base.dailyBudget * 0.45),
    maxBudget: round(combo.base.dailyBudget * (combo.scenarios.includes('growth') ? 2.2 : 1.35)),
    spend: round(spend),
    sales: round(sales),
    profit: round(profit),
    clicks,
    orders,
    acos: round(safeRatio(spend, sales), 4),
    targetAcos: combo.base.targetAcos,
    salesRoas: round(safeRatio(sales, spend), 4),
    profitRoas: round(safeRatio(profit, spend), 4),
    budgetLimitedDays: last30.filter((row) => row.budgetCapped).length,
    status: 'enabled',
    source: source(0.88, ['30d_ads_rollup']),
    confidence: 0.88,
  };
}

function toLifecycleAdMetric(campaign) {
  return {
    productId: campaign.productId,
    campaignId: campaign.campaignId,
    keyword: campaign.scenarios.includes('negative-keyword-opportunity') ? 'free replacement parts' : 'category exact',
    spend: campaign.spend,
    sales: campaign.sales,
    acos: campaign.acos,
    targetAcos: campaign.targetAcos,
    clicks30d: campaign.scenarios.includes('negative-keyword-opportunity') ? Math.max(35, campaign.clicks) : campaign.clicks,
    orders30d: campaign.scenarios.includes('negative-keyword-opportunity') ? 0 : campaign.orders,
    lifecycleSignals: lifecycleSignalsFor(campaign.lifecycleStage),
    source: source(0.88, ['lifecycle_ad_metric_mock']),
  };
}

function productFromCombo(combo) {
  return { id: combo.productId, asin: combo.asin, sku: combo.sku, daysListed: combo.listedDays, reviewCount: combo.reviews, optimizationPaused: false, source: source(0.86, ['catalog_mock']) };
}

function inventoryFromCombo(combo) {
  const avgDailySales = combo.lifecycleStage === 'growth' ? 8 : combo.lifecycleStage === 'decline' ? 3 : 5;
  return { productId: combo.productId, asin: combo.asin, available: Math.round(avgDailySales * combo.inventoryDays), avgDailySales, inventoryDays: combo.inventoryDays, source: source(0.84, ['inventory_mock']) };
}

function lifecycleSignalsFor(stage) {
  if (stage === 'launch') return { daysListed: 38, reviewCount: 12, salesTrend4w: 0.08, bsrTrend4w: -0.04, inventoryDays: 42 };
  if (stage === 'growth') return { daysListed: 145, reviewCount: 78, salesTrend4w: 0.24, bsrTrend4w: -0.18, inventoryDays: 34 };
  if (stage === 'decline') return { daysListed: 520, reviewCount: 190, salesTrend4w: -0.16, bsrTrend4w: 0.26, inventoryDays: 92 };
  return { daysListed: 420, reviewCount: 245, salesTrend4w: 0.02, bsrTrend4w: 0.03, inventoryDays: 67 };
}

function buildPlacementMetrics(combos) {
  const mature = combos.find((combo) => combo.campaignId === 'cmp-mature-brand');
  return [
    { campaignId: mature.campaignId, placement: 'top_of_search', impressions: 9800, clicks: 620, orders: 88, spend: 410, sales: 2464, profit: 405, currentAdjustmentPct: 0.05, scenarios: ['placement-waste'], source: source(0.86, ['placement_metrics_mock']) },
    { campaignId: mature.campaignId, placement: 'product_pages', impressions: 12200, clicks: 540, orders: 13, spend: 500, sales: 364, profit: -380, currentAdjustmentPct: 0.15, scenarios: ['placement-waste'], source: source(0.86, ['placement_metrics_mock']) },
    { campaignId: mature.campaignId, placement: 'rest_of_search', impressions: 16000, clicks: 500, orders: 40, spend: 320, sales: 1120, profit: 50, currentAdjustmentPct: 0, scenarios: ['mature'], source: source(0.86, ['placement_metrics_mock']) },
  ];
}

function buildBrandTerms() {
  return [
    { term: 'acme case', campaignId: 'cmp-mature-brand', currentBid: 0.82, adRank: 3, topOfSearchShare: 0.42, competitorShare: 0.28, competitorBidDetected: true, scenarios: ['brand-defense-exposed'], source: source(0.87, ['brand_term_mock']) },
    { term: 'acme cover', campaignId: null, currentBid: 0, adRank: 4, topOfSearchShare: 0.2, competitorShare: 0.18, competitorBidDetected: true, scenarios: ['brand-defense-exposed'], source: source(0.84, ['brand_term_mock']) },
  ];
}

function buildCompetitorTargets() {
  return [
    { asin: 'B0COMPETE01', bsr: 32, rating: 4.1, price: 38, reviewCount: 95, ageDays: 72, ratingTrend: -0.1, scenarios: ['competitor-attack'], source: source(0.82, ['m4_competitor_mock']) },
    { asin: 'B0COMPETE02', bsr: 9, rating: 4.8, price: 29, reviewCount: 2400, ageDays: 620, scenarios: ['competitor-attack'], source: source(0.78, ['m4_competitor_mock']) },
  ];
}

function buildGuardrailActions(combos) {
  const targetCombo = combos.find((combo) => combo.scenarios.includes('guardrail-blocked'));
  return {
    blockedAction: {
      actionType: 'INCREASE_BUDGET',
      budgetDeltaPercent: 0.42,
      confidence: 0.71,
      target: { sku: targetCombo.sku, campaignId: targetCombo.campaignId, tags: ['protected'], campaignType: 'SP', inventoryDays: 6 },
      scenarios: ['guardrail-blocked'],
      source: source(0.71, ['guardrail_mock']),
    },
    safeAction: {
      actionType: 'ADD_NEGATIVE_KEYWORD',
      confidence: 0.88,
      target: { sku: 'M3-LAUNCH-001', campaignId: 'cmp-launch-sp', campaignType: 'SP', inventoryDays: 42 },
      scenarios: ['negative-keyword-opportunity'],
      source: source(0.88, ['guardrail_mock']),
    },
  };
}

function buildExpectedSignals() {
  const pairs = [
    ['lifecycle:launch', ['launch']], ['lifecycle:growth', ['growth']], ['lifecycle:mature', ['mature']], ['lifecycle:decline', ['decline']],
    ['acos_above_target', ['high-acos']], ['spend_without_orders', ['zero-order-spend']], ['budget_limited_days', ['budget-capped']],
    ['hourly_peak_cvr_lift', ['dayparting-peaks']], ['product_page_waste', ['placement-waste']], ['brand_term_intrusion', ['brand-defense-exposed']],
    ['attackable_competitor_asin', ['competitor-attack']], ['inventory_days_below_guardrail', ['stockout-constrained']],
    ['daily_spend_spike', ['outlier-spike']], ['daily_conversion_drop', ['outlier-drop']], ['late_attribution_pending', ['attribution-lag']],
    ['negative_keyword_candidate', ['negative-keyword-opportunity']], ['auto_execution_guardrail_blocked', ['guardrail-blocked']],
    ['no_real_store_write', REQUIRED_SCENARIOS],
  ];
  return pairs.map(([signal, scenarios]) => ({ signal, scenarios, source: source(0.9, ['expected_signal_design']), confidence: 0.9 }));
}

function parseDateOnly(value) {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid asOfDate: ${value}`);
  return date;
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function source(confidence, signals) {
  return { mode: SOURCE_MODE, provider: 'amazon_ads_api_mock', fixtureVersion: FIXTURE_VERSION, confidence: round(confidence, 2), signals };
}

function safeRatio(numerator, denominator) {
  return Math.abs(Number(denominator) || 0) < 0.000001 ? 0 : round(Number(numerator) / Number(denominator), 4);
}

function sum(values) {
  return values.reduce((total, value) => total + Number(value || 0), 0);
}

function round(value, precision = 2) {
  const factor = 10 ** precision;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export const adTimeseriesFixture = generateAdTimeseries();
