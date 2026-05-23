import { roundCurrency } from './profit-engine.mjs';

const SOURCE_MODE = 'deterministic_mock';
const ENGINE = 'm3_advanced_engine';
const EPSILON = 0.000001;
const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

const DEFAULT_GUARDRAILS = Object.freeze({
  enabled: false,
  enabledActionTypes: [
    'BID_ADJUSTMENT',
    'DAYPARTING_BID_ADJUSTMENT',
    'ADJUST_PLACEMENT_BID',
    'ADD_NEGATIVE_KEYWORD',
    'INCREASE_BUDGET',
    'DECREASE_BUDGET',
  ],
  disabledActionTypes: [
    'PAUSE_CAMPAIGN',
    'DELETE_CAMPAIGN',
    'LAUNCH_NEW_CAMPAIGN',
    'CHANGE_TARGETING_MATCH_TYPE',
  ],
  maxBidChangePct: 0.15,
  maxPlacementChangePct: 0.15,
  maxDaypartingChangePct: 0.15,
  maxBudgetIncreasePct: 0.2,
  maxBudgetDecreasePct: 0.3,
  dailyAutoActionsPerSkuMax: 5,
  dailyAutoActionsTotalMax: 100,
  weeklyTotalBudgetChangeMaxPct: 0.5,
  excludedTags: ['protected', 'test', 'launch_protection'],
  excludedSkus: [],
  excludedCampaignTypes: [],
  noAutoDuringEvents: ['Prime Day', 'Black Friday'],
  minConfidence: 0.75,
  minInventoryDaysForSpendIncrease: 14,
  allowRealStoreWrites: false,
  rollbackWindowDays: 7,
});

export function optimizeBudgetAllocation({ campaigns = [], totalBudget, config = {} } = {}) {
  const normalized = campaigns.map((campaign, index) => normalizeCampaignForBudget(campaign, index, config));
  const requestedBudget = roundCurrency(num(totalBudget, sum(normalized.map((item) => item.currentBudget))));

  if (normalized.length === 0 || requestedBudget <= 0) {
    return {
      source: source(0.5, ['no_campaigns']),
      totalBudget: Math.max(0, requestedBudget),
      allocatedBudget: 0,
      expectedCurrentProfit: 0,
      expectedRecommendedProfit: 0,
      expectedProfitDelta: 0,
      recommendations: [],
      warnings: normalized.length === 0 ? ['No campaigns were provided.'] : ['Total budget must be greater than zero.'],
    };
  }

  const allocatable = normalized.map((campaign) => {
    const locked = Boolean(campaign.locked || campaign.status === 'paused' || campaign.status === 'archived');
    const minBudget = locked ? campaign.currentBudget : campaign.minBudget;
    const maxBudget = locked ? campaign.currentBudget : Math.max(campaign.maxBudget, minBudget);
    const marginalProfitScore = scoreCampaignBudget(campaign, config);
    return { ...campaign, locked, minBudget, maxBudget, marginalProfitScore };
  });

  const { budgets, warnings } = allocateWithCaps(
    allocatable.map((campaign) => ({
      minBudget: campaign.minBudget,
      maxBudget: campaign.maxBudget,
      weight: Math.max(0.01, campaign.marginalProfitScore),
      locked: campaign.locked,
    })),
    requestedBudget,
  );

  const recommendations = allocatable.map((campaign, index) => {
    const recommendedBudget = roundCurrency(budgets[index]);
    const budgetDelta = roundCurrency(recommendedBudget - campaign.currentBudget);
    const budgetDeltaPercent = campaign.currentBudget === 0
      ? (recommendedBudget > 0 ? 1 : 0)
      : roundCurrency(budgetDelta / campaign.currentBudget, 4);
    const actionType = budgetDelta > EPSILON
      ? 'INCREASE_BUDGET'
      : budgetDelta < -EPSILON
        ? 'DECREASE_BUDGET'
        : 'KEEP_BUDGET';

    return {
      campaignId: campaign.campaignId,
      name: campaign.name,
      actionType,
      currentBudget: roundCurrency(campaign.currentBudget),
      recommendedBudget,
      budgetDelta,
      budgetDeltaPercent,
      marginalProfitScore: roundCurrency(campaign.marginalProfitScore, 3),
      salesRoas: roundCurrency(campaign.salesRoas, 3),
      profitRoas: roundCurrency(campaign.profitRoas, 3),
      constraints: {
        minBudget: roundCurrency(campaign.minBudget),
        maxBudget: roundCurrency(campaign.maxBudget),
        locked: campaign.locked,
      },
      reason: budgetAllocationReason(campaign, budgetDelta),
      auditRequired: actionType !== 'KEEP_BUDGET',
      confidence: roundCurrency(campaign.confidence, 2),
      source: source(campaign.confidence, ['campaign_metrics', 'm2_profit_roas']),
    };
  });

  const expectedCurrentProfit = roundCurrency(sum(allocatable.map((campaign) => estimateBudgetProfit(campaign, campaign.currentBudget))));
  const expectedRecommendedProfit = roundCurrency(sum(allocatable.map((campaign, index) => estimateBudgetProfit(campaign, budgets[index]))));

  return {
    source: source(average(allocatable.map((item) => item.confidence)), ['campaign_metrics', 'm2_profit_roas', 'budget_constraints']),
    totalBudget: requestedBudget,
    allocatedBudget: roundCurrency(sum(budgets)),
    expectedCurrentProfit,
    expectedRecommendedProfit,
    expectedProfitDelta: roundCurrency(expectedRecommendedProfit - expectedCurrentProfit),
    recommendations,
    warnings,
  };
}

export function recommendDaypartingBids({ hourlyMetrics = [], baseBid = 1, config = {} } = {}) {
  const minClicks = num(config.minClicks, 20);
  const maxIncrease = num(config.maxIncreasePct, 0.25);
  const maxDecrease = num(config.maxDecreasePct, -0.5);
  const metrics = hourlyMetrics.map(normalizeAdMetric);
  const exact = new Map();
  const hourly = new Map();
  const global = createMetricAggregate();

  for (const metric of metrics) {
    addMetric(global, metric);
    if (metric.hour !== null) {
      addMetric(getOrCreateAggregate(hourly, String(metric.hour)), metric);
    }
    if (metric.dayOfWeek !== null && metric.hour !== null) {
      addMetric(getOrCreateAggregate(exact, `${metric.dayOfWeek}:${metric.hour}`), metric);
    }
  }

  const globalStats = finalizeMetricAggregate(global, {
    cvr: num(config.fallbackCvr, 0.05),
    profitRoas: num(config.fallbackProfitRoas, 1),
  });

  const schedule = [];
  for (let day = 0; day < 7; day += 1) {
    for (let hour = 0; hour < 24; hour += 1) {
      const exactStats = exact.has(`${day}:${hour}`) ? finalizeMetricAggregate(exact.get(`${day}:${hour}`), globalStats) : null;
      const hourStats = hourly.has(String(hour)) ? finalizeMetricAggregate(hourly.get(String(hour)), globalStats) : null;
      const stats = exactStats || hourStats || globalStats;
      const evidenceSource = exactStats ? 'exact_day_hour' : hourStats ? 'hour_fallback' : 'global_fallback';
      const cvrLift = lift(stats.cvr, globalStats.cvr);
      const profitLift = lift(stats.profitRoas, globalStats.profitRoas);
      const evidenceShrink = evidenceSource === 'global_fallback'
        ? 0.25
        : clamp(Math.sqrt(stats.clicks / Math.max(1, minClicks)), evidenceSource === 'exact_day_hour' ? 0.3 : 0.2, 1);
      let bidAdjustmentPct = clamp((0.65 * cvrLift + 0.35 * profitLift) * evidenceShrink, maxDecrease, maxIncrease);
      bidAdjustmentPct = Math.abs(bidAdjustmentPct) < 0.03 ? 0 : roundCurrency(bidAdjustmentPct, 2);

      schedule.push({
        dayOfWeek: day,
        dayName: DAY_NAMES[day],
        hour,
        bidAdjustmentPct,
        recommendedBid: roundCurrency(num(baseBid, 1) * (1 + bidAdjustmentPct)),
        actionType: bidAdjustmentPct === 0 ? 'KEEP_BID' : 'DAYPARTING_BID_ADJUSTMENT',
        evidence: {
          source: evidenceSource,
          impressions: roundCurrency(stats.impressions, 0),
          clicks: roundCurrency(stats.clicks, 0),
          orders: roundCurrency(stats.orders, 0),
          cvr: roundCurrency(stats.cvr, 4),
          profitRoas: roundCurrency(stats.profitRoas, 3),
        },
        confidence: confidenceFromVolume(stats.clicks, stats.orders, minClicks, evidenceSource),
        source: source(confidenceFromVolume(stats.clicks, stats.orders, minClicks, evidenceSource), ['hourly_ads_metrics']),
      });
    }
  }

  return {
    source: source(metrics.length === 0 ? 0.45 : 0.82, ['hourly_ads_metrics']),
    baseBid: roundCurrency(num(baseBid, 1)),
    globalBaseline: {
      cvr: roundCurrency(globalStats.cvr, 4),
      profitRoas: roundCurrency(globalStats.profitRoas, 3),
      clicks: roundCurrency(globalStats.clicks, 0),
    },
    schedule,
    windows: buildDaypartingWindows(schedule),
  };
}

export function recommendPlacementAdjustments({ placements = [], campaign = {}, config = {} } = {}) {
  const normalized = placements.map((placement, index) => normalizePlacementMetric(placement, index));
  const aggregate = createMetricAggregate();
  normalized.forEach((placement) => addMetric(aggregate, placement));
  const baseline = finalizeMetricAggregate(aggregate, {
    cvr: num(config.fallbackCvr, 0.05),
    profitRoas: num(campaign.targetProfitRoas ?? config.targetProfitRoas, 1),
  });
  const targetProfitRoas = num(campaign.targetProfitRoas ?? config.targetProfitRoas, 1);
  const minClicks = num(config.minClicks, 20);

  const recommendations = normalized.map((placement) => {
    const cvrLift = lift(placement.cvr, baseline.cvr);
    const roasLift = lift(placement.profitRoas, targetProfitRoas);
    const maxForPlacement = maxPlacementIncrease(placement.placement, config);
    let recommendedAdjustmentPct = placement.currentAdjustmentPct;
    let reason = 'Insufficient placement evidence; keep current modifier.';

    if (placement.clicks >= minClicks) {
      recommendedAdjustmentPct = clamp(roundCurrency(0.16 * roasLift + 0.08 * cvrLift, 2), num(config.minAdjustmentPct, -0.5), maxForPlacement);
      recommendedAdjustmentPct = Math.abs(recommendedAdjustmentPct) < 0.05 ? 0 : recommendedAdjustmentPct;
      reason = placementReason(placement, recommendedAdjustmentPct, targetProfitRoas);
    }

    const deltaPct = roundCurrency(recommendedAdjustmentPct - placement.currentAdjustmentPct, 4);
    return {
      placement: placement.placement,
      label: placement.label,
      actionType: deltaPct === 0 ? 'KEEP_PLACEMENT_BID' : 'ADJUST_PLACEMENT_BID',
      currentAdjustmentPct: roundCurrency(placement.currentAdjustmentPct, 4),
      recommendedAdjustmentPct,
      deltaPct,
      salesRoas: roundCurrency(placement.salesRoas, 3),
      profitRoas: roundCurrency(placement.profitRoas, 3),
      cvr: roundCurrency(placement.cvr, 4),
      reason,
      auditRequired: deltaPct !== 0,
      confidence: confidenceFromVolume(placement.clicks, placement.orders, minClicks, 'exact_placement'),
      source: source(confidenceFromVolume(placement.clicks, placement.orders, minClicks, 'exact_placement'), ['placement_metrics']),
    };
  });

  return {
    source: source(normalized.length === 0 ? 0.45 : 0.8, ['placement_metrics', 'm2_profit_roas']),
    campaignId: campaign.campaignId ?? campaign.id ?? null,
    baseline: {
      cvr: roundCurrency(baseline.cvr, 4),
      profitRoas: roundCurrency(baseline.profitRoas, 3),
      targetProfitRoas: roundCurrency(targetProfitRoas, 3),
    },
    recommendations,
  };
}

export function buildBrandDefensePlan({ brandName = '', brandTerms = [], campaigns = [], ownAsins = [], categoryAvgBid = 1, config = {} } = {}) {
  const normalizedTerms = brandTerms.map((term, index) => normalizeBrandTerm(term, index));
  const normalizedCampaigns = campaigns.map((campaign) => ({
    ...campaign,
    campaignId: String(campaign.campaignId ?? campaign.id ?? campaign.name ?? 'campaign'),
    name: String(campaign.name ?? campaign.campaignId ?? campaign.id ?? ''),
  }));
  const asins = ownAsins.map((asin, index) => normalizeAsin(asin, index));
  const exactCampaigns = normalizedCampaigns.filter((campaign) => isBrandDefenseCampaign(campaign, brandName));
  const sdDefenseCampaigns = normalizedCampaigns.filter((campaign) => isSdDefenseCampaign(campaign));
  const requiredBid = roundCurrency(num(categoryAvgBid, 1) * num(config.brandExactBidMultiplier, 1.5));
  const bidCap = num(config.brandBidCap, num(categoryAvgBid, 1) * 3);
  const recommendations = [];

  if (exactCampaigns.length === 0 && normalizedTerms.length > 0) {
    recommendations.push({
      actionType: 'CREATE_BRAND_DEFENSE_CAMPAIGN',
      priority: 'high',
      target: { terms: normalizedTerms.map((term) => term.term), matchType: 'exact' },
      recommendedBid: Math.min(requiredBid, bidCap),
      recommendedDailyBudget: roundCurrency(num(config.brandDefenseDailyBudget, 20)),
      reason: 'No dedicated exact-match brand defense campaign was found.',
      auditRequired: true,
      confidence: 0.82,
      source: source(0.82, ['brand_terms', 'campaign_structure']),
    });
  }

  for (const term of normalizedTerms) {
    const covered = exactCampaigns.some((campaign) => campaignCoversTerm(campaign, term.term));
    const intrusion = term.competitorBidDetected || term.competitorShare >= num(config.competitorShareAlertPct, 0.1);
    const weakTopSlot = term.adRank > 1 || term.topOfSearchShare < num(config.minTopOfSearchShare, 0.7);
    const targetBid = clamp(Math.max(requiredBid, term.currentBid * (intrusion ? 1.3 : 1.15)), 0, bidCap);

    if (!covered || term.currentBid + EPSILON < targetBid || weakTopSlot || intrusion) {
      recommendations.push({
        actionType: covered ? 'INCREASE_BRAND_TERM_BID' : 'ADD_BRAND_TERM_TO_EXACT_CAMPAIGN',
        priority: intrusion || weakTopSlot ? 'high' : 'medium',
        target: { term: term.term, campaignId: term.campaignId },
        currentBid: roundCurrency(term.currentBid),
        recommendedBid: roundCurrency(targetBid),
        bidDeltaPercent: term.currentBid === 0 ? 1 : roundCurrency((targetBid - term.currentBid) / term.currentBid, 4),
        reason: brandTermReason(term, covered, intrusion, weakTopSlot),
        auditRequired: true,
        confidence: term.confidence,
        source: source(term.confidence, ['brand_term_metrics']),
      });
    }
  }

  for (const asin of asins) {
    const covered = sdDefenseCampaigns.some((campaign) => campaignTargetsAsin(campaign, asin.asin));
    if (!covered) {
      recommendations.push({
        actionType: 'CREATE_SD_DEFENSE_CAMPAIGN',
        priority: 'medium',
        target: { asin: asin.asin, relatedAsins: asin.relatedAsins },
        recommendedBid: roundCurrency(num(categoryAvgBid, 1) * num(config.sdDefenseBidMultiplier, 0.8)),
        recommendedDailyBudget: roundCurrency(num(config.sdDefenseDailyBudget, 10)),
        reason: 'Own ASIN does not have SD product-targeting defense coverage.',
        auditRequired: true,
        confidence: asin.confidence,
        source: source(asin.confidence, ['own_asin_catalog', 'campaign_structure']),
      });
    }
  }

  const exactCoverage = normalizedTerms.length === 0
    ? 1
    : normalizedTerms.filter((term) => exactCampaigns.some((campaign) => campaignCoversTerm(campaign, term.term))).length / normalizedTerms.length;
  const bidHealth = normalizedTerms.length === 0
    ? 1
    : normalizedTerms.filter((term) => term.currentBid >= requiredBid && term.adRank <= 1 && term.topOfSearchShare >= 0.7).length / normalizedTerms.length;
  const sdCoverage = asins.length === 0
    ? 1
    : asins.filter((asin) => sdDefenseCampaigns.some((campaign) => campaignTargetsAsin(campaign, asin.asin))).length / asins.length;
  const intrusionPresent = normalizedTerms.some((term) => term.competitorBidDetected || term.competitorShare >= 0.1);
  const monitoringScore = intrusionPresent ? (normalizedCampaigns.some((campaign) => campaign.intent === 'brand_intrusion_monitoring') ? 1 : 0.45) : 1;
  const coverageScore = roundCurrency(clamp(30 * exactCoverage + 20 * bidHealth + 30 * sdCoverage + 20 * monitoringScore, 0, 100), 0);

  return {
    source: source(average([0.8, ...normalizedTerms.map((term) => term.confidence), ...asins.map((asin) => asin.confidence)]), ['brand_terms', 'own_asins', 'campaign_structure']),
    brandName,
    coverageScore,
    status: coverageScore >= 85 ? 'healthy' : coverageScore >= 65 ? 'needs_attention' : 'exposed',
    layers: [
      { layer: 'brand_exact_campaign', score: roundCurrency(30 * exactCoverage, 0), coverage: roundCurrency(exactCoverage, 3) },
      { layer: 'brand_bid_occupancy', score: roundCurrency(20 * bidHealth, 0), coverage: roundCurrency(bidHealth, 3) },
      { layer: 'sd_own_asin_defense', score: roundCurrency(30 * sdCoverage, 0), coverage: roundCurrency(sdCoverage, 3) },
      { layer: 'competitor_intrusion_monitoring', score: roundCurrency(20 * monitoringScore, 0), coverage: roundCurrency(monitoringScore, 3) },
    ],
    recommendations: recommendations.sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || String(a.actionType).localeCompare(String(b.actionType))),
  };
}

export function recommendCompetitorAsinAttacks({ ownProduct = {}, competitors = [], categoryAvgBid = 1, config = {} } = {}) {
  const own = normalizeOwnProduct(ownProduct);
  const minScore = num(config.minAttackScore, 50);
  const evaluated = competitors.map((competitor, index) => evaluateCompetitorAttack(own, competitor, index, categoryAvgBid, config));
  const recommendations = evaluated
    .filter((item) => item.attackScore >= minScore)
    .sort((a, b) => b.attackScore - a.attackScore || String(a.targetAsin).localeCompare(String(b.targetAsin)));

  return {
    source: source(competitors.length === 0 ? 0.45 : 0.78, ['m4_competitor_pool', 'catalog_metrics']),
    ownAsin: own.asin,
    recommendations,
    rejected: evaluated
      .filter((item) => item.attackScore < minScore)
      .map((item) => ({ targetAsin: item.targetAsin, attackScore: item.attackScore, reason: item.reason })),
  };
}

export function evaluateCreativeAbTest({ abTest = {}, config = {} } = {}) {
  const minDays = num(config.minDays, 14);
  const minClicksPerVariant = num(config.minClicksPerVariant, 500);
  const minDecisionLift = num(config.minDecisionLift, 0.1);
  const control = normalizeCreativeVariant(abTest.control ?? abTest.controlCreative ?? {}, 'control');
  const treatment = normalizeCreativeVariant(abTest.treatment ?? abTest.treatmentCreative ?? {}, 'treatment');
  const elapsedDays = resolveElapsedDays(abTest);
  const reviewBlocked = ['pending_review', 'rejected'].includes(control.status) || ['pending_review', 'rejected'].includes(treatment.status);
  const ctrLift = lift(treatment.ctr, control.ctr);
  const cvrLift = lift(treatment.cvr, control.cvr);
  const roasLift = lift(treatment.roas, control.roas);
  const profitRoasLift = lift(treatment.profitRoas, control.profitRoas);
  const compositeLift = roundCurrency(0.2 * ctrLift + 0.3 * cvrLift + 0.35 * roasLift + 0.15 * profitRoasLift, 4);
  const ctrZ = twoProportionZ(treatment.clicks, treatment.impressions, control.clicks, control.impressions);
  const cvrZ = twoProportionZ(treatment.orders, treatment.clicks, control.orders, control.clicks);
  const statisticalConfidence = roundCurrency(Math.max(twoSidedConfidence(ctrZ), twoSidedConfidence(cvrZ)), 3);
  const enoughData = elapsedDays >= minDays && control.clicks >= minClicksPerVariant && treatment.clicks >= minClicksPerVariant;

  let status = 'collecting_data';
  let significance = 'insufficient_data';
  let winner = null;
  let recommendation = 'CONTINUE_TEST';

  if (reviewBlocked) {
    status = 'blocked_pending_review';
    significance = 'blocked';
    recommendation = 'WAIT_FOR_CREATIVE_REVIEW';
  } else if (enoughData) {
    if (statisticalConfidence >= 0.95 && Math.abs(compositeLift) >= minDecisionLift) {
      status = 'ready_to_decide';
      significance = 'significant';
    } else if (statisticalConfidence >= 0.8 && Math.abs(compositeLift) >= minDecisionLift / 2) {
      status = 'directional';
      significance = 'directional';
    } else {
      status = 'inconclusive';
      significance = 'not_significant';
    }

    if (compositeLift >= minDecisionLift) {
      winner = treatment;
      recommendation = significance === 'significant' ? 'ADOPT_TREATMENT' : 'CONTINUE_TEST';
    } else if (compositeLift <= -minDecisionLift) {
      winner = control;
      recommendation = significance === 'significant' ? 'KEEP_CONTROL' : 'CONTINUE_TEST';
    }
  }

  return {
    source: source(enoughData ? 0.86 : 0.62, ['creative_ab_metrics']),
    testId: abTest.id ?? null,
    mode: abTest.mode ?? 'parallel_ad_group',
    elapsedDays,
    minDays,
    minClicksPerVariant,
    status,
    significance,
    statisticalConfidence,
    winnerCreativeId: winner?.creativeId ?? null,
    recommendation,
    metrics: {
      control: creativeMetricsForOutput(control),
      treatment: creativeMetricsForOutput(treatment),
      lifts: {
        ctrLift: roundCurrency(ctrLift, 4),
        cvrLift: roundCurrency(cvrLift, 4),
        roasLift: roundCurrency(roasLift, 4),
        profitRoasLift: roundCurrency(profitRoasLift, 4),
        compositeLift,
      },
    },
    notes: [
      'SB and SD creative A/B tests are modeled as deterministic rotation or parallel ad-group tests.',
      'Decision readiness requires elapsed days and click volume to reduce weekday and flywheel bias.',
      'Creative changes should still account for marketplace review delay before execution.',
    ],
  };
}

export function evaluateAdvancedAutoExecutionGuardrails({ action = {}, config = {}, usage = {}, context = {} } = {}) {
  const merged = mergeGuardrailConfig(config);
  const normalizedType = normalizeActionType(action.actionType ?? action.type);
  const category = actionCategory(normalizedType);
  const target = action.target ?? {};
  const checks = [];

  addCheck(checks, 'global_switch', Boolean(merged.enabled), 'Full-auto mode is disabled.');

  const actionAllowed = merged.enabledActionTypes.includes(normalizedType) || merged.enabledActionTypes.includes(category);
  const actionDisabled = merged.disabledActionTypes.includes(normalizedType) || merged.disabledActionTypes.includes(category);
  addCheck(
    checks,
    'action_type',
    actionAllowed && !actionDisabled,
    actionDisabled ? `${normalizedType} requires manual review.` : `${normalizedType} is not in the auto-execution allowlist.`,
    actionDisabled && ['DELETE_CAMPAIGN', 'DELETE', 'IRREVERSIBLE'].includes(normalizedType) ? 'high' : 'medium',
  );

  addCheck(checks, 'value_threshold', valueWithinGuardrail(action, category, merged), valueThresholdReason(action, category, merged));

  const dailyForSku = num(usage.dailyAutoActionsForSku ?? usage.dailyForSku, 0);
  const dailyTotal = num(usage.dailyAutoActionsTotal ?? usage.dailyTotal, 0);
  const weeklyBudgetChangePct = Math.abs(num(usage.weeklyBudgetChangePct ?? usage.weeklyTotalBudgetChangePct, 0));
  addCheck(
    checks,
    'daily_quota',
    dailyForSku < merged.dailyAutoActionsPerSkuMax && dailyTotal < merged.dailyAutoActionsTotalMax,
    'Daily automatic action quota would be exceeded.',
  );
  addCheck(
    checks,
    'weekly_budget_quota',
    weeklyBudgetChangePct <= merged.weeklyTotalBudgetChangeMaxPct,
    'Weekly total budget change limit would be exceeded.',
  );

  const targetSku = String(target.sku ?? action.sku ?? '');
  const tags = Array.isArray(target.tags) ? target.tags.map((tag) => String(tag)) : [];
  const campaignType = String(target.campaignType ?? action.campaignType ?? '');
  const excluded = (targetSku && merged.excludedSkus.includes(targetSku))
    || tags.some((tag) => merged.excludedTags.includes(tag))
    || (campaignType && merged.excludedCampaignTypes.includes(campaignType));
  addCheck(checks, 'sku_exclusion', !excluded, 'SKU, tag, or campaign type is excluded from auto-execution.');

  const activeEvents = (context.activeEvents ?? []).map((event) => String(event));
  const eventPaused = activeEvents.some((event) => merged.noAutoDuringEvents.includes(event));
  addCheck(checks, 'event_pause', !eventPaused, 'Auto-execution is paused during the active event window.');

  const confidence = num(action.confidence ?? action.source?.confidence, 1);
  addCheck(checks, 'confidence', confidence >= merged.minConfidence, 'Suggestion confidence is below the automatic threshold.');

  const inventoryDays = num(target.inventoryDays ?? action.inventoryDays, Infinity);
  const increasesSpend = actionIncreasesSpend(action, category);
  addCheck(
    checks,
    'inventory_pressure',
    !(increasesSpend && inventoryDays < merged.minInventoryDaysForSpendIncrease),
    'Spend-increasing actions are blocked when inventory coverage is low.',
  );

  const realStoreWrite = Boolean(action.requiresRealStoreWrite || action.payload?.requiresRealStoreWrite);
  addCheck(
    checks,
    'real_store_write',
    !realStoreWrite || merged.allowRealStoreWrites,
    'Real store writes remain blocked until credentials and explicit approval are provided.',
    realStoreWrite ? 'high' : 'medium',
  );

  const failed = checks.filter((check) => !check.passes);
  const hardBlocked = failed.some((check) => check.name === 'real_store_write' && check.severity === 'high');
  const passes = failed.length === 0;

  return {
    source: source(0.9, ['auto_execution_config', 'suggestion_payload']),
    actionType: normalizedType,
    category,
    passes,
    decision: passes ? 'allow_mock_auto_execution' : hardBlocked ? 'blocked' : 'queue_for_human_review',
    executionMode: passes ? 'mock' : hardBlocked ? 'blocked_real_store' : 'manual_review',
    checks,
    audit: {
      required: true,
      rollbackWindowDays: merged.rollbackWindowDays,
      recordAll: true,
      canRollback: !Boolean(action.nonRollbackable),
    },
  };
}

export function evaluateAutoExecutionGuardrails(input) {
  return evaluateAdvancedAutoExecutionGuardrails(input);
}

export const buildBudgetAllocationPlan = optimizeBudgetAllocation;
export const buildDaypartingBidSchedule = recommendDaypartingBids;
export const buildPlacementAdjustmentPlan = recommendPlacementAdjustments;
export const recommendPlacementBids = recommendPlacementAdjustments;
export const recommendBrandDefenseActions = buildBrandDefensePlan;
export const buildCompetitorAttackRecommendations = recommendCompetitorAsinAttacks;
export const evaluateCreativeAbStatus = evaluateCreativeAbTest;
export const defaultAdvancedGuardrails = DEFAULT_GUARDRAILS;

function normalizeCampaignForBudget(campaign, index, config) {
  const currentBudget = Math.max(0, num(campaign.currentBudget ?? campaign.dailyBudget ?? campaign.monthlyBudget ?? campaign.budget, 0));
  const spend = Math.max(0, num(campaign.spend ?? campaign.spend30d ?? campaign.currentSpend, 0));
  const sales = Math.max(0, num(campaign.sales ?? campaign.attributedSales ?? campaign.revenue, 0));
  const profitKnown = hasNumber(campaign.profit ?? campaign.netProfit);
  const profit = profitKnown
    ? num(campaign.profit ?? campaign.netProfit, 0)
    : sales * num(campaign.profitMargin ?? campaign.margin, 0.25) - spend;
  const profitRoas = hasNumber(campaign.profitRoas) ? num(campaign.profitRoas) : safeRatio(profit, spend, 0);
  const salesRoas = hasNumber(campaign.salesRoas) ? num(campaign.salesRoas) : safeRatio(sales, spend, 0);
  const acos = hasNumber(campaign.acos) ? num(campaign.acos) : safeRatio(spend, sales, 1);
  const budgetUtilization = hasNumber(campaign.budgetUtilization)
    ? num(campaign.budgetUtilization)
    : safeRatio(spend, Math.max(currentBudget, EPSILON), 0);
  const minBudget = hasNumber(campaign.minBudget ?? campaign.budgetMin)
    ? Math.max(0, num(campaign.minBudget ?? campaign.budgetMin))
    : roundCurrency(currentBudget * num(config.minBudgetPctOfCurrent, 0.4));
  const maxBudget = hasNumber(campaign.maxBudget ?? campaign.budgetMax)
    ? Math.max(0, num(campaign.maxBudget ?? campaign.budgetMax))
    : Math.max(minBudget, roundCurrency(currentBudget * num(config.maxBudgetPctOfCurrent, 1.8)), currentBudget);

  return {
    campaignId: String(campaign.campaignId ?? campaign.id ?? `campaign-${index + 1}`),
    name: String(campaign.name ?? campaign.campaignId ?? campaign.id ?? `Campaign ${index + 1}`),
    status: String(campaign.status ?? 'enabled'),
    locked: Boolean(campaign.locked || campaign.optimizationPaused || campaign.protected),
    currentBudget,
    minBudget,
    maxBudget,
    spend,
    sales,
    profit,
    profitRoas,
    salesRoas,
    acos,
    targetAcos: num(campaign.targetAcos ?? config.targetAcos, 0.3),
    targetProfitRoas: num(campaign.targetProfitRoas ?? config.targetProfitRoas, 1),
    budgetUtilization,
    budgetLimitedDays: num(campaign.budgetLimitedDays, 0),
    lostImpressionShareBudget: num(campaign.lostImpressionShareBudget ?? campaign.budgetLostImpressionShare, 0),
    lifecycleStage: String(campaign.lifecycleStage ?? campaign.stage ?? 'mature'),
    inventoryDays: hasNumber(campaign.inventoryDays) ? num(campaign.inventoryDays) : Infinity,
    strategy: String(campaign.strategy ?? campaign.intent ?? ''),
    confidence: clamp(num(campaign.confidence, profitKnown ? 0.84 : 0.68), 0.35, 0.95),
  };
}

function scoreCampaignBudget(campaign) {
  const targetAcos = Math.max(campaign.targetAcos, EPSILON);
  const acosLift = clamp((targetAcos - campaign.acos) / targetAcos, -1.2, 1.2);
  const utilizationBoost = clamp(campaign.budgetUtilization - 0.85, -0.25, 0.35);
  const limitedBoost = clamp(campaign.budgetLimitedDays / 7, 0, 1) * 0.25
    + clamp(campaign.lostImpressionShareBudget, 0, 0.5) * 0.6;
  const stageBoost = {
    launch: 0.05,
    growth: 0.18,
    mature: 0,
    maturity: 0,
    decline: -0.35,
    declining: -0.35,
  }[campaign.lifecycleStage] ?? 0;
  const inventoryPenalty = campaign.inventoryDays < 14 ? 0.8 : campaign.inventoryDays < 21 ? 0.25 : 0;
  const defenseFloor = campaign.strategy.includes('brand') || campaign.strategy.includes('defense') ? 0.75 : -Infinity;
  return Math.max(defenseFloor, campaign.profitRoas + 0.45 * acosLift + utilizationBoost + limitedBoost + stageBoost - inventoryPenalty);
}

function allocateWithCaps(items, totalBudget) {
  const warnings = [];
  const minSum = sum(items.map((item) => item.minBudget));
  const maxSum = sum(items.map((item) => item.maxBudget));

  if (totalBudget < minSum - EPSILON) {
    warnings.push('Total budget is below campaign minimums; minimums were prorated.');
    const scale = minSum === 0 ? 0 : totalBudget / minSum;
    return { budgets: items.map((item) => roundCurrency(item.minBudget * scale)), warnings };
  }

  if (totalBudget > maxSum + EPSILON) {
    warnings.push('Total budget exceeds campaign maximums; unallocated budget remains outside recommendations.');
  }

  const budgets = items.map((item) => item.minBudget);
  let remaining = Math.max(0, Math.min(totalBudget, maxSum) - minSum);
  let open = items.map((_, index) => index).filter((index) => items[index].maxBudget - budgets[index] > EPSILON);

  while (remaining > EPSILON && open.length > 0) {
    const totalWeight = sum(open.map((index) => Math.max(0.01, items[index].weight)));
    let allocated = 0;
    const stillOpen = [];

    for (const index of open) {
      const room = items[index].maxBudget - budgets[index];
      const share = remaining * (Math.max(0.01, items[index].weight) / totalWeight);
      const add = Math.min(room, share);
      budgets[index] += add;
      allocated += add;
      if (room - add > EPSILON) stillOpen.push(index);
    }

    remaining -= allocated;
    if (allocated <= EPSILON) break;
    open = stillOpen;
  }

  return { budgets: budgets.map((budget) => roundCurrency(budget)), warnings };
}

function estimateBudgetProfit(campaign, budget) {
  const baseBudget = Math.max(campaign.currentBudget, campaign.spend, 1);
  if (budget <= baseBudget) {
    return budget * campaign.profitRoas;
  }
  const baseProfit = baseBudget * campaign.profitRoas;
  const extraBudget = budget - baseBudget;
  const marginalScore = Math.max(-0.5, campaign.marginalProfitScore ?? scoreCampaignBudget(campaign));
  return baseProfit + extraBudget * marginalScore * 0.7;
}

function budgetAllocationReason(campaign, budgetDelta) {
  if (campaign.locked) return 'Campaign is locked or paused, so budget is held flat.';
  if (budgetDelta > EPSILON) {
    if (campaign.profitRoas >= campaign.targetProfitRoas && campaign.budgetUtilization >= 0.85) {
      return 'Profit ROAS is healthy and recent spend shows budget pressure.';
    }
    return 'Marginal profit score is stronger than peer campaigns.';
  }
  if (budgetDelta < -EPSILON) {
    if (campaign.profitRoas < campaign.targetProfitRoas) {
      return 'Profit ROAS is below target, so budget is shifted to stronger campaigns.';
    }
    return 'Campaign has lower marginal return than competing budget uses.';
  }
  return 'Current budget is already near the optimized allocation.';
}

function normalizeAdMetric(metric) {
  const impressions = Math.max(0, num(metric.impressions, 0));
  let clicks = Math.max(0, num(metric.clicks, 0));
  if (clicks === 0 && impressions > 0 && hasNumber(metric.ctr)) clicks = impressions * num(metric.ctr);
  let orders = Math.max(0, num(metric.orders ?? metric.conversions, 0));
  if (orders === 0 && clicks > 0 && hasNumber(metric.cvr ?? metric.conversionRate)) orders = clicks * num(metric.cvr ?? metric.conversionRate);
  const spend = Math.max(0, num(metric.spend, 0));
  let sales = Math.max(0, num(metric.sales ?? metric.revenue, 0));
  if (sales === 0 && spend > 0 && hasNumber(metric.salesRoas ?? metric.roas)) sales = spend * num(metric.salesRoas ?? metric.roas);
  let profit = hasNumber(metric.profit ?? metric.netProfit)
    ? num(metric.profit ?? metric.netProfit)
    : null;
  if (profit === null && spend > 0 && hasNumber(metric.profitRoas)) profit = spend * num(metric.profitRoas);
  if (profit === null) profit = sales * num(metric.profitMargin ?? metric.margin, 0.25) - spend;

  const hour = hasNumber(metric.hour) ? clamp(Math.trunc(num(metric.hour)), 0, 23) : null;
  const dayOfWeek = parseDayOfWeek(metric.dayOfWeek ?? metric.day);

  return {
    ...metric,
    dayOfWeek,
    hour,
    impressions,
    clicks,
    orders,
    spend,
    sales,
    profit,
    ctr: safeRatio(clicks, impressions, 0),
    cvr: safeRatio(orders, clicks, 0),
    salesRoas: safeRatio(sales, spend, 0),
    profitRoas: safeRatio(profit, spend, 0),
  };
}

function normalizePlacementMetric(placement, index) {
  const metric = normalizeAdMetric(placement);
  const canonical = canonicalPlacement(placement.placement ?? placement.name ?? placement.type ?? `placement-${index + 1}`);
  return {
    ...metric,
    placement: canonical,
    label: placement.label ?? canonical,
    currentAdjustmentPct: num(placement.currentAdjustmentPct ?? placement.bidAdjustmentPct ?? placement.currentBidAdjustmentPct, 0),
  };
}

function createMetricAggregate() {
  return { impressions: 0, clicks: 0, orders: 0, spend: 0, sales: 0, profit: 0, records: 0 };
}

function addMetric(aggregate, metric) {
  aggregate.impressions += metric.impressions;
  aggregate.clicks += metric.clicks;
  aggregate.orders += metric.orders;
  aggregate.spend += metric.spend;
  aggregate.sales += metric.sales;
  aggregate.profit += metric.profit;
  aggregate.records += 1;
}

function getOrCreateAggregate(map, key) {
  if (!map.has(key)) map.set(key, createMetricAggregate());
  return map.get(key);
}

function finalizeMetricAggregate(aggregate, fallback = {}) {
  return {
    ...aggregate,
    ctr: safeRatio(aggregate.clicks, aggregate.impressions, fallback.ctr ?? 0),
    cvr: safeRatio(aggregate.orders, aggregate.clicks, fallback.cvr ?? 0),
    salesRoas: safeRatio(aggregate.sales, aggregate.spend, fallback.salesRoas ?? 0),
    profitRoas: safeRatio(aggregate.profit, aggregate.spend, fallback.profitRoas ?? 0),
  };
}

function buildDaypartingWindows(schedule) {
  const windows = [];
  for (let day = 0; day < 7; day += 1) {
    const slots = schedule.filter((slot) => slot.dayOfWeek === day);
    let startHour = null;
    let currentPct = 0;
    for (const slot of slots) {
      if (slot.bidAdjustmentPct !== 0 && startHour === null) {
        startHour = slot.hour;
        currentPct = slot.bidAdjustmentPct;
      } else if (startHour !== null && slot.bidAdjustmentPct !== currentPct) {
        windows.push(makeWindow(day, startHour, slot.hour, currentPct));
        startHour = slot.bidAdjustmentPct === 0 ? null : slot.hour;
        currentPct = slot.bidAdjustmentPct;
      }
    }
    if (startHour !== null) windows.push(makeWindow(day, startHour, 24, currentPct));
  }
  return windows;
}

function makeWindow(dayOfWeek, startHour, endHour, bidAdjustmentPct) {
  return { dayOfWeek, dayName: DAY_NAMES[dayOfWeek], startHour, endHour, bidAdjustmentPct };
}

function placementReason(placement, adjustmentPct, targetProfitRoas) {
  if (adjustmentPct > 0) {
    return `Placement profit ROAS ${roundCurrency(placement.profitRoas, 2)} beats target ${roundCurrency(targetProfitRoas, 2)}.`;
  }
  if (adjustmentPct < 0) {
    return `Placement profit ROAS ${roundCurrency(placement.profitRoas, 2)} or CVR trails the campaign baseline.`;
  }
  return 'Placement is close to target performance; keep modifier neutral.';
}

function maxPlacementIncrease(placement, config) {
  const defaults = {
    top_of_search: 0.3,
    product_pages: 0.25,
    rest_of_search: 0.15,
  };
  return num(config.maxAdjustmentPct, defaults[placement] ?? 0.2);
}

function canonicalPlacement(value) {
  const text = String(value).toLowerCase().replace(/[\s-]+/g, '_');
  if (text.includes('top') || text.includes('first_page')) return 'top_of_search';
  if (text.includes('product') || text.includes('detail')) return 'product_pages';
  if (text.includes('rest') || text.includes('other')) return 'rest_of_search';
  return text;
}

function normalizeBrandTerm(term, index) {
  const value = typeof term === 'string' ? { term } : term;
  return {
    term: String(value.term ?? value.keyword ?? `brand-term-${index + 1}`),
    campaignId: value.campaignId ?? null,
    currentBid: Math.max(0, num(value.currentBid ?? value.bid, 0)),
    adRank: Math.max(1, num(value.adRank ?? value.adPosition, 99)),
    topOfSearchShare: clamp(num(value.topOfSearchShare ?? value.topOfSearchImpressionShare, 0), 0, 1),
    competitorShare: clamp(num(value.competitorShare ?? value.competitorImpressionShare, 0), 0, 1),
    competitorBidDetected: Boolean(value.competitorBidDetected),
    confidence: clamp(num(value.confidence, 0.78), 0.4, 0.95),
  };
}

function normalizeAsin(asin, index) {
  const value = typeof asin === 'string' ? { asin } : asin;
  return {
    asin: String(value.asin ?? value.id ?? `asin-${index + 1}`),
    relatedAsins: (value.relatedAsins ?? []).map((item) => String(item)),
    confidence: clamp(num(value.confidence, 0.76), 0.4, 0.95),
  };
}

function isBrandDefenseCampaign(campaign, brandName) {
  const intent = String(campaign.intent ?? campaign.strategy ?? campaign.campaignType ?? '').toLowerCase();
  const name = campaign.name.toLowerCase();
  const brand = String(brandName || '').toLowerCase();
  return Boolean(
    campaign.isBrandDefense
      || intent.includes('brand_defense')
      || intent.includes('brand-defense')
      || (name.includes('brand') && name.includes('defense'))
      || (brand && name.includes(brand) && String(campaign.matchType ?? '').toLowerCase() === 'exact'),
  );
}

function isSdDefenseCampaign(campaign) {
  const adType = String(campaign.adType ?? campaign.type ?? '').toUpperCase();
  const intent = String(campaign.intent ?? campaign.strategy ?? '').toLowerCase();
  return Boolean(campaign.isSdDefense || (adType === 'SD' && intent.includes('defense')));
}

function campaignCoversTerm(campaign, term) {
  const keywords = campaign.keywords ?? campaign.terms ?? [];
  const normalized = keywords.map((keyword) => typeof keyword === 'string' ? keyword : keyword.term ?? keyword.keyword);
  return normalized.map((item) => String(item).toLowerCase()).includes(String(term).toLowerCase());
}

function campaignTargetsAsin(campaign, asin) {
  const targets = campaign.targetAsins ?? campaign.targets ?? [];
  return targets.map((target) => typeof target === 'string' ? target : target.asin ?? target.id).map((item) => String(item)).includes(String(asin));
}

function brandTermReason(term, covered, intrusion, weakTopSlot) {
  if (!covered) return 'Brand term is not covered by a dedicated exact campaign.';
  if (intrusion) return 'Competitor intrusion was detected on the brand term.';
  if (weakTopSlot) return 'Brand term is not consistently holding the top ad slot.';
  return 'Brand term bid is below the configured defense floor.';
}

function normalizeOwnProduct(product) {
  return {
    asin: String(product.asin ?? product.id ?? ''),
    bsr: Math.max(0, num(product.bsr ?? product.bestSellerRank, 0)),
    rating: num(product.rating ?? product.starRating, 0),
    price: Math.max(0, num(product.price, 0)),
    reviewCount: Math.max(0, num(product.reviewCount ?? product.reviews, 0)),
  };
}

function evaluateCompetitorAttack(own, competitor, index, categoryAvgBid, config) {
  const targetAsin = String(competitor.asin ?? competitor.id ?? `competitor-${index + 1}`);
  const bsr = Math.max(0, num(competitor.bsr ?? competitor.bestSellerRank, 0));
  const rating = num(competitor.rating ?? competitor.starRating, 0);
  const price = Math.max(0, num(competitor.price, 0));
  const reviewCount = Math.max(0, num(competitor.reviewCount ?? competitor.reviews, 0));
  const ageDays = hasNumber(competitor.ageDays) ? num(competitor.ageDays) : null;

  const bsrGap = own.bsr > 0 && bsr > 0 ? (own.bsr - bsr) / own.bsr : 0;
  let score = 0;
  const evidence = [];

  if (bsrGap >= 0.1 && bsrGap <= 0.5) {
    score += 25;
    evidence.push('Competitor BSR is 10-50% stronger, which is a reachable attack band.');
  } else if (bsrGap > 0 && bsrGap < 0.1) {
    score += 14;
    evidence.push('Competitor BSR is only slightly stronger.');
  } else if (bsrGap > 0.5) {
    score += 6;
    evidence.push('Competitor BSR may be too strong for efficient attack.');
  } else {
    score += 10;
    evidence.push('Competitor BSR is not stronger, but product targeting can still harvest detail-page traffic.');
  }

  const ratingAdvantage = own.rating - rating;
  if (ratingAdvantage > 0) {
    const points = clamp(ratingAdvantage / 0.5, 0, 1) * 25;
    score += points;
    evidence.push(`Own rating leads by ${roundCurrency(ratingAdvantage, 2)} stars.`);
  }

  if (own.price > 0 && price > 0) {
    const priceGap = (price - own.price) / own.price;
    if (priceGap >= 0) {
      score += 20;
      evidence.push('Competitor price is at or above own price.');
    } else if (priceGap >= -0.1) {
      score += 10;
      evidence.push('Competitor price is within 10% of own price.');
    }
  }

  if (own.reviewCount > 0) {
    const reviewAdvantage = (own.reviewCount - reviewCount) / own.reviewCount;
    if (reviewAdvantage > 0) {
      const points = clamp(reviewAdvantage, 0, 1) * 15;
      score += points;
      evidence.push('Own listing has more review depth.');
    }
  }

  if ((ageDays !== null && ageDays < 90) || reviewCount < num(config.newCompetitorReviewThreshold, 50)) {
    score += 10;
    evidence.push('Competitor is new or review-light.');
  }

  if (competitor.stockoutRisk || num(competitor.ratingTrend, 0) < 0) {
    score += 5;
    evidence.push('Competitor has weakness signals from monitoring.');
  }

  const attackScore = roundCurrency(clamp(score, 0, 100), 0);
  const aggressive = attackScore >= 70;
  const strategies = aggressive ? ['SD_PRODUCT_TARGETING', 'SP_PRODUCT_TARGETING'] : ['SD_PRODUCT_TARGETING'];
  const recommendedDailyBudget = roundCurrency(num(config.baseDailyBudget, aggressive ? 5 : 3));
  const recommendedBid = roundCurrency(num(categoryAvgBid, 1) * (aggressive ? 1 : 0.75));

  return {
    targetAsin,
    attackScore,
    priority: attackScore >= 75 ? 'high' : attackScore >= 60 ? 'medium' : 'low',
    strategy: strategies,
    recommendedDailyBudget,
    recommendedBid,
    expectedShareGainPct: roundCurrency(clamp(attackScore / 1000, 0.03, 0.1), 3),
    reason: attackScore >= 50 ? 'Competitor is attackable under BSR, rating, price, or review-depth rules.' : 'Competitor does not meet enough attack criteria.',
    evidence,
    auditRequired: true,
    confidence: roundCurrency(clamp(0.55 + attackScore / 250, 0.55, 0.9), 2),
    source: source(clamp(0.55 + attackScore / 250, 0.55, 0.9), ['m4_competitor_pool', 'catalog_metrics']),
  };
}

function normalizeCreativeVariant(variant, fallbackId) {
  const metric = normalizeAdMetric(variant);
  return {
    creativeId: String(variant.creativeId ?? variant.id ?? fallbackId),
    status: String(variant.status ?? 'active'),
    impressions: metric.impressions,
    clicks: metric.clicks,
    orders: metric.orders,
    spend: metric.spend,
    sales: metric.sales,
    profit: metric.profit,
    ctr: metric.ctr,
    cvr: metric.cvr,
    roas: metric.salesRoas,
    profitRoas: metric.profitRoas,
  };
}

function creativeMetricsForOutput(variant) {
  return {
    creativeId: variant.creativeId,
    status: variant.status,
    impressions: roundCurrency(variant.impressions, 0),
    clicks: roundCurrency(variant.clicks, 0),
    orders: roundCurrency(variant.orders, 0),
    ctr: roundCurrency(variant.ctr, 4),
    cvr: roundCurrency(variant.cvr, 4),
    roas: roundCurrency(variant.roas, 3),
    profitRoas: roundCurrency(variant.profitRoas, 3),
  };
}

function resolveElapsedDays(abTest) {
  if (hasNumber(abTest.elapsedDays)) return num(abTest.elapsedDays);
  const start = Date.parse(abTest.startedAt ?? '');
  const end = Date.parse(abTest.endedAt ?? abTest.asOfDate ?? '');
  if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
    return Math.floor((end - start) / 86400000);
  }
  return num(abTest.durationDays, 0);
}

function twoProportionZ(successTreatment, trialsTreatment, successControl, trialsControl) {
  if (trialsTreatment <= 0 || trialsControl <= 0) return 0;
  const pTreatment = successTreatment / trialsTreatment;
  const pControl = successControl / trialsControl;
  const pooled = (successTreatment + successControl) / (trialsTreatment + trialsControl);
  const standardError = Math.sqrt(pooled * (1 - pooled) * (1 / trialsTreatment + 1 / trialsControl));
  return standardError <= EPSILON ? 0 : (pTreatment - pControl) / standardError;
}

function twoSidedConfidence(zValue) {
  const z = Math.abs(zValue);
  return clamp(2 * normalCdf(z) - 1, 0, 0.999);
}

function normalCdf(value) {
  return 0.5 * (1 + erf(value / Math.SQRT2));
}

function erf(value) {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}

function mergeGuardrailConfig(config) {
  const enabledActionTypes = (config.enabledActionTypes ?? config.actionAllowlist ?? DEFAULT_GUARDRAILS.enabledActionTypes).map(normalizeActionType);
  const disabledActionTypes = (config.disabledActionTypes ?? DEFAULT_GUARDRAILS.disabledActionTypes).map(normalizeActionType);
  return {
    ...DEFAULT_GUARDRAILS,
    ...config,
    enabledActionTypes,
    disabledActionTypes,
    excludedTags: config.excludedTags ?? DEFAULT_GUARDRAILS.excludedTags,
    excludedSkus: config.excludedSkus ?? DEFAULT_GUARDRAILS.excludedSkus,
    excludedCampaignTypes: config.excludedCampaignTypes ?? DEFAULT_GUARDRAILS.excludedCampaignTypes,
    noAutoDuringEvents: config.noAutoDuringEvents ?? config.noAutoDuring ?? DEFAULT_GUARDRAILS.noAutoDuringEvents,
  };
}

function normalizeActionType(type) {
  const value = String(type ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  const aliases = {
    BID_ADJUSTMENT: 'BID_ADJUSTMENT',
    NEGATIVE_KEYWORD_ADD: 'ADD_NEGATIVE_KEYWORD',
    ADD_NEGATIVE: 'ADD_NEGATIVE_KEYWORD',
    LOWER_BID: 'BID_ADJUSTMENT',
    LOWER_BID_OR_PAUSE: 'BID_ADJUSTMENT',
    INCREASE_BRAND_TERM_BID: 'BID_ADJUSTMENT',
    CREATE_BRAND_DEFENSE_CAMPAIGN: 'LAUNCH_NEW_CAMPAIGN',
    CREATE_SD_DEFENSE_CAMPAIGN: 'LAUNCH_NEW_CAMPAIGN',
    LAUNCH_COMPETITOR_ATTACK: 'LAUNCH_NEW_CAMPAIGN',
    ADOPT_CREATIVE_WINNER: 'CHANGE_CREATIVE',
  };
  return aliases[value] ?? value;
}

function actionCategory(type) {
  if (['BID_ADJUSTMENT', 'DAYPARTING_BID_ADJUSTMENT', 'ADJUST_PLACEMENT_BID'].includes(type)) return 'BID_ADJUSTMENT';
  if (type === 'INCREASE_BUDGET') return 'INCREASE_BUDGET';
  if (type === 'DECREASE_BUDGET') return 'DECREASE_BUDGET';
  if (type === 'ADD_NEGATIVE_KEYWORD') return 'ADD_NEGATIVE_KEYWORD';
  if (['LAUNCH_NEW_CAMPAIGN', 'CHANGE_TARGETING_MATCH_TYPE', 'PAUSE_CAMPAIGN', 'DELETE_CAMPAIGN', 'CHANGE_CREATIVE'].includes(type)) return type;
  return type;
}

function valueWithinGuardrail(action, category, config) {
  if (category === 'BID_ADJUSTMENT') {
    const change = Math.abs(num(action.bidChangePercent ?? action.bidAdjustmentPct ?? action.deltaPct ?? action.changePct, 0));
    const type = normalizeActionType(action.actionType ?? action.type);
    const limit = type === 'DAYPARTING_BID_ADJUSTMENT'
      ? config.maxDaypartingChangePct
      : type === 'ADJUST_PLACEMENT_BID'
        ? config.maxPlacementChangePct
        : config.maxBidChangePct;
    return change <= limit + EPSILON;
  }

  if (category === 'INCREASE_BUDGET') {
    return Math.abs(resolveBudgetChangePct(action)) <= config.maxBudgetIncreasePct + EPSILON;
  }

  if (category === 'DECREASE_BUDGET') {
    return Math.abs(resolveBudgetChangePct(action)) <= config.maxBudgetDecreasePct + EPSILON;
  }

  return true;
}

function valueThresholdReason(action, category, config) {
  if (category === 'BID_ADJUSTMENT') {
    return `Bid adjustment exceeds ${roundCurrency(config.maxBidChangePct * 100, 1)}%.`;
  }
  if (category === 'INCREASE_BUDGET') {
    return `Budget increase exceeds ${roundCurrency(config.maxBudgetIncreasePct * 100, 1)}%.`;
  }
  if (category === 'DECREASE_BUDGET') {
    return `Budget decrease exceeds ${roundCurrency(config.maxBudgetDecreasePct * 100, 1)}%.`;
  }
  return 'Action value exceeds configured threshold.';
}

function resolveBudgetChangePct(action) {
  if (hasNumber(action.budgetDeltaPercent ?? action.budgetChangePercent ?? action.changePct)) {
    return num(action.budgetDeltaPercent ?? action.budgetChangePercent ?? action.changePct);
  }
  const currentBudget = num(action.currentBudget ?? action.payload?.currentBudget, 0);
  const delta = num(action.budgetDelta ?? action.payload?.budgetDelta, 0);
  return currentBudget === 0 ? (delta > 0 ? 1 : 0) : delta / currentBudget;
}

function actionIncreasesSpend(action, category) {
  if (category === 'INCREASE_BUDGET' || category === 'LAUNCH_NEW_CAMPAIGN') return true;
  if (category === 'BID_ADJUSTMENT') {
    return num(action.bidChangePercent ?? action.bidAdjustmentPct ?? action.deltaPct ?? action.changePct, 0) > 0;
  }
  return false;
}

function addCheck(checks, name, passes, reason, severity = 'medium') {
  checks.push({
    name,
    passes: Boolean(passes),
    severity: passes ? 'low' : severity,
    reason: passes ? 'ok' : reason,
  });
}

function confidenceFromVolume(clicks, orders, minClicks, sourceKind) {
  const sourcePenalty = sourceKind === 'global_fallback' ? -0.18 : sourceKind === 'hour_fallback' ? -0.08 : 0;
  return roundCurrency(clamp(0.48 + Math.sqrt(clicks / Math.max(1, minClicks)) * 0.25 + Math.min(0.18, orders / 100) + sourcePenalty, 0.35, 0.92), 2);
}

function parseDayOfWeek(value) {
  if (value === undefined || value === null || value === '') return null;
  if (hasNumber(value)) return clamp(Math.trunc(num(value)), 0, 6);
  const normalized = String(value).slice(0, 3).toLowerCase();
  const index = DAY_NAMES.findIndex((day) => day === normalized);
  return index >= 0 ? index : null;
}

function source(confidence, signals = []) {
  return {
    mode: SOURCE_MODE,
    engine: ENGINE,
    confidence: roundCurrency(clamp(confidence, 0, 1), 2),
    signals,
  };
}

function hasNumber(value) {
  return value !== undefined && value !== null && value !== '' && Number.isFinite(Number(value));
}

function num(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function safeRatio(numerator, denominator, fallback = 0) {
  const bottom = num(denominator, 0);
  if (Math.abs(bottom) <= EPSILON) return fallback;
  return num(numerator, 0) / bottom;
}

function lift(value, baseline) {
  if (Math.abs(num(baseline, 0)) <= EPSILON) return num(value, 0) > 0 ? 1 : 0;
  return (num(value, 0) - num(baseline, 0)) / Math.abs(num(baseline, 0));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, num(value, min)));
}

function sum(values) {
  return values.reduce((total, value) => total + num(value, 0), 0);
}

function average(values) {
  const clean = values.filter((value) => Number.isFinite(Number(value)));
  return clean.length === 0 ? 0 : sum(clean) / clean.length;
}

function priorityRank(priority) {
  return { high: 0, medium: 1, low: 2 }[priority] ?? 9;
}
