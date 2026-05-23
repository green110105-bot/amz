const generatedAt = '2026-05-08T00:00:00.000+08:00';
const fixtureVersion = 'mock-scenarios.v1';

export const scenarioCategories = Object.freeze([
  'M1',
  'M2',
  'M3',
  'M4',
  'audit-security',
  'commercialization',
  'provider-mode',
]);

export const scenarioCatalog = deepFreeze([
  makeScenario({
    id: 'm1-listing-review-voice-gap',
    category: 'M1',
    module: 'M1 listing iteration',
    title: 'Listing copy has review-driven expectation gap',
    description: 'Clusters low-star reviews and competitor copy changes, then drafts a listing-copy recommendation without patching Amazon listings.',
    providers: ['amazon-sp-api', 'keepa', 'sellersprite', 'llm'],
    mode: 'mock',
    source: 'mock-scenarios:m1:listing-review-voice-gap',
    confidence: 0.86,
    fixtures: ['sample-store.products', 'replayMarketChangeReplay.reviews', 'replayMarketChangeReplay.competitorSnapshots'],
    expectedSignals: ['review_cluster:expectation', 'competitor_copy_change', 'listing_patch_blocked', 'audit_action:PATCH_LISTING_COPY'],
    writePolicy: { realWriteAllowed: false, allowedActions: ['draft_listing_recommendation'], blockedActions: ['spapi.patchListing'] },
  }),
  makeScenario({
    id: 'm1-new-asin-launch-readiness',
    category: 'M1',
    module: 'M1 launch readiness',
    title: 'New ASIN launch readiness gaps',
    description: 'Validates title, keyword, image, and early-review readiness signals for a launch candidate using deterministic provider fixtures.',
    providers: ['amazon-sp-api', 'helium10', 'sellersprite', 'llm'],
    mode: 'mock',
    source: 'mock-scenarios:m1:new-asin-launch-readiness',
    confidence: 0.81,
    fixtures: ['providerFixtures.amazon-sp-api.catalog', 'providerFixtures.helium10.keywordResearch'],
    expectedSignals: ['keyword_gap', 'launch_readiness_score', 'content_quality_warning', 'no_store_mutation'],
    writePolicy: { realWriteAllowed: false, allowedActions: ['create_launch_task_card'], blockedActions: ['spapi.createListing', 'notification.sendEmail'] },
  }),
  makeScenario({
    id: 'm2-profit-inventory-reorder-loop',
    category: 'M2',
    module: 'M2 profit inventory loop',
    title: 'Profitable SKU approaches stockout',
    description: 'Combines 24-month order profit, FBA stock, lead time, and safety stock to recommend a reorder approval card.',
    providers: ['amazon-sp-api', 'amazon-ads-api'],
    mode: 'mock',
    source: 'mock-scenarios:m2:profit-inventory-reorder-loop',
    confidence: 0.92,
    fixtures: ['replayOrderProfit24Months', 'sample-store.inventory'],
    expectedSignals: ['net_profit_positive', 'inventory_days_below_lead_time', 'reorder_quantity', 'audit_action:CREATE_REORDER_PLAN'],
    writePolicy: { realWriteAllowed: false, allowedActions: ['draft_purchase_order'], blockedActions: ['supplier.submitPurchaseOrder'] },
  }),
  makeScenario({
    id: 'm2-loss-maker-aged-inventory',
    category: 'M2',
    module: 'M2 profit inventory loop',
    title: 'Loss-making SKU has aged inventory',
    description: 'Detects negative profit and high days-in-warehouse, producing markdown and ad-throttle suggestions for review.',
    providers: ['amazon-sp-api', 'amazon-ads-api'],
    mode: 'mock',
    source: 'mock-scenarios:m2:loss-maker-aged-inventory',
    confidence: 0.9,
    fixtures: ['replayOrderProfit24Months', 'replayAds30Days'],
    expectedSignals: ['net_profit_negative', 'aged_inventory', 'markdown_candidate', 'audit_action:PRICE_OR_AD_REVIEW'],
    writePolicy: { realWriteAllowed: false, allowedActions: ['create_markdown_recommendation'], blockedActions: ['spapi.patchPrice', 'ads.updateCampaignBudget'] },
  }),
  makeScenario({
    id: 'm3-acos-waste-negative-keyword',
    category: 'M3',
    module: 'M3 ad suggestion loop',
    title: 'High ACOS keyword wastes budget',
    description: 'Rolls up 30-day ad metrics and creates pause or negative-keyword suggestions behind audit review.',
    providers: ['amazon-ads-api', 'amazon-sp-api'],
    mode: 'mock',
    source: 'mock-scenarios:m3:acos-waste-negative-keyword',
    confidence: 0.93,
    fixtures: ['replayAds30Days'],
    expectedSignals: ['acos_above_target', 'zero_order_clicks', 'negative_keyword_candidate', 'audit_action:ADD_NEGATIVE_KEYWORD'],
    writePolicy: { realWriteAllowed: false, allowedActions: ['draft_ad_suggestion'], blockedActions: ['ads.addNegativeKeyword', 'ads.updateCampaignBudget'] },
  }),
  makeScenario({
    id: 'm3-growth-budget-guardrail',
    category: 'M3',
    module: 'M3 ad suggestion loop',
    title: 'Profitable campaign requests budget increase within guardrails',
    description: 'Identifies a profitable growth campaign, then verifies budget changes remain pending review and capped by audit limits.',
    providers: ['amazon-ads-api'],
    mode: 'mock',
    source: 'mock-scenarios:m3:growth-budget-guardrail',
    confidence: 0.88,
    fixtures: ['replayAds30Days', 'replayAuditWriteBlockFixtures.high_value_budget_change'],
    expectedSignals: ['acos_below_target', 'sales_trend_positive', 'budget_delta_guardrail', 'audit_action:INCREASE_BUDGET'],
    writePolicy: { realWriteAllowed: false, allowedActions: ['queue_budget_change_for_review'], blockedActions: ['ads.updateCampaignBudget'] },
  }),
  makeScenario({
    id: 'm4-market-watch-competitor-deal',
    category: 'M4',
    module: 'M4 market intelligence',
    title: 'Competitor starts deal and lowers price',
    description: 'Compares competitor snapshots and flags price, deal, and copy changes for operator review.',
    providers: ['keepa', 'sellersprite'],
    mode: 'mock',
    source: 'mock-scenarios:m4:market-watch-competitor-deal',
    confidence: 0.87,
    fixtures: ['replayMarketChangeReplay.competitorSnapshots'],
    expectedSignals: ['price_change', 'deal_started', 'new_competitor', 'market_alert_card'],
    writePolicy: { realWriteAllowed: false, allowedActions: ['create_market_alert'], blockedActions: ['notification.sendWeCom'] },
  }),
  makeScenario({
    id: 'm4-review-quality-regression',
    category: 'M4',
    module: 'M4 monitoring',
    title: 'Review quality regression triggers monitor alert',
    description: 'Clusters negative reviews into packaging, instruction, and performance issues while keeping notifications mocked.',
    providers: ['amazon-sp-api', 'keepa', 'llm', 'notification'],
    mode: 'mock',
    source: 'mock-scenarios:m4:review-quality-regression',
    confidence: 0.84,
    fixtures: ['replayMarketChangeReplay.reviews'],
    expectedSignals: ['review_cluster:packaging', 'review_cluster:instruction', 'review_cluster:performance', 'mock_notification_only'],
    writePolicy: { realWriteAllowed: false, allowedActions: ['draft_monitor_alert'], blockedActions: ['notification.sendEmail', 'notification.sendWeCom'] },
  }),
  makeScenario({
    id: 'audit-real-write-blocks',
    category: 'audit-security',
    module: 'Audit center',
    title: 'Real write-like operations are blocked',
    description: 'Exercises campaign, listing, notification, and billing write guards with redacted payloads and explicit audit reasons.',
    providers: ['amazon-sp-api', 'amazon-ads-api', 'notification', 'billing'],
    mode: 'real-blocked',
    source: 'mock-scenarios:audit-security:real-write-blocks',
    confidence: 1,
    fixtures: ['replayAuditWriteBlockFixtures', 'provider write-guard fixtures'],
    expectedSignals: ['REAL_WRITE_BLOCKED', 'payload_redacted', 'audit_decision:blocked', 'sourceMode:mock'],
    writePolicy: { realWriteAllowed: false, allowedActions: ['record_audit_event'], blockedActions: ['spapi.patchListing', 'ads.updateCampaignBudget', 'billing.createCheckoutSession'] },
  }),
  makeScenario({
    id: 'audit-secret-leak-detection',
    category: 'audit-security',
    module: 'Security readiness',
    title: 'Credential-shaped values stay redacted',
    description: 'Verifies token, secret, webhook, and key-shaped fields are never emitted in scenario logs or attempted payload metadata.',
    providers: ['billing', 'notification', 'llm'],
    mode: 'mock',
    source: 'mock-scenarios:audit-security:secret-leak-detection',
    confidence: 0.98,
    fixtures: ['security redaction samples'],
    expectedSignals: ['secret_redacted', 'webhook_redacted', 'llm_prompt_no_credentials', 'audit_log_safe'],
    writePolicy: { realWriteAllowed: false, allowedActions: ['validate_redaction'], blockedActions: ['notification.sendWeCom', 'billing.createCheckoutSession'] },
  }),
  makeScenario({
    id: 'commercial-plan-entitlement',
    category: 'commercialization',
    module: 'Commercial engine',
    title: 'Plan entitlement gates advanced actions',
    description: 'Checks tenant plan metadata, feature gates, quota usage, and upgrade-card generation without checkout creation.',
    providers: ['billing'],
    mode: 'mock',
    source: 'mock-scenarios:commercialization:plan-entitlement',
    confidence: 0.89,
    fixtures: ['sample-store.tenant', 'billing.mockSubscription'],
    expectedSignals: ['plan:mock_active', 'feature_gate', 'quota_remaining', 'upgrade_card'],
    writePolicy: { realWriteAllowed: false, allowedActions: ['draft_upgrade_card'], blockedActions: ['billing.createCheckoutSession'] },
  }),
  makeScenario({
    id: 'commercial-trial-expiry-safe-nudge',
    category: 'commercialization',
    module: 'Commercial engine',
    title: 'Trial expiry creates safe in-app nudge',
    description: 'Models a trial-expiry journey that can create only in-app mock notifications and never emails or payment sessions.',
    providers: ['billing', 'notification'],
    mode: 'mock',
    source: 'mock-scenarios:commercialization:trial-expiry-safe-nudge',
    confidence: 0.82,
    fixtures: ['billing.trialFixture', 'notification.inAppMock'],
    expectedSignals: ['trial_expiring', 'in_app_mock_notification', 'checkout_blocked', 'operator_review_required'],
    writePolicy: { realWriteAllowed: false, allowedActions: ['create_in_app_nudge'], blockedActions: ['notification.sendEmail', 'billing.createCheckoutSession'] },
  }),
  makeScenario({
    id: 'provider-mode-mock-sandbox-real-matrix',
    category: 'provider-mode',
    module: 'Provider contracts',
    title: 'Provider mode matrix stays deterministic',
    description: 'Enumerates mock, sandbox, and real-blocked modes across SP-API, Ads, Keepa, SellerSprite, Helium 10, LLM, notification, and billing.',
    providers: ['amazon-sp-api', 'amazon-ads-api', 'keepa', 'sellersprite', 'helium10', 'llm', 'notification', 'billing'],
    mode: 'mode-matrix',
    source: 'mock-scenarios:provider-mode:mock-sandbox-real-matrix',
    confidence: 0.97,
    fixtures: ['providerFixtures.*', 'credential-check', 'write-guard'],
    expectedSignals: ['mock_read_ok', 'sandbox_read_fixture', 'real_credentials_missing_blocked', 'real_write_blocked'],
    writePolicy: { realWriteAllowed: false, allowedActions: ['read_fixture', 'credential_check'], blockedActions: ['external_network_mutation', 'real_store_write'] },
  }),
  makeScenario({
    id: 'provider-mode-rate-limit-backoff',
    category: 'provider-mode',
    module: 'Provider contracts',
    title: 'Rate limit and backoff metadata is deterministic',
    description: 'Verifies provider reads include stable rate-limit, retry, lineage, source, and confidence metadata for replayable tests.',
    providers: ['amazon-ads-api', 'keepa', 'sellersprite'],
    mode: 'mock',
    source: 'mock-scenarios:provider-mode:rate-limit-backoff',
    confidence: 0.91,
    fixtures: ['provider rate-limit fixtures'],
    expectedSignals: ['rate_limit_remaining', 'backoff:exponential-jitter-disabled', 'lineage_fixtureVersion', 'confidence_present'],
    writePolicy: { realWriteAllowed: false, allowedActions: ['read_fixture'], blockedActions: ['provider.retry_network_call'] },
  }),
]);

export const scenarioCatalogById = Object.freeze(Object.fromEntries(scenarioCatalog.map((scenario) => [scenario.id, scenario])));

export function enumerateScenarios({ category, provider, mode } = {}) {
  return scenarioCatalog.filter((scenario) => {
    if (category && scenario.category !== category) return false;
    if (provider && !scenario.providers.includes(provider)) return false;
    if (mode && scenario.mode !== mode) return false;
    return true;
  });
}

export function summarizeScenarioCatalog(scenarios = scenarioCatalog) {
  const summary = {
    total: scenarios.length,
    categories: Object.fromEntries(scenarioCategories.map((category) => [category, 0])),
    providers: {},
    realWriteAllowed: scenarios.some((scenario) => scenario.writePolicy.realWriteAllowed === true),
  };

  for (const scenario of scenarios) {
    summary.categories[scenario.category] = (summary.categories[scenario.category] || 0) + 1;
    for (const provider of scenario.providers) {
      summary.providers[provider] = (summary.providers[provider] || 0) + 1;
    }
  }

  return summary;
}

export function validateScenarioCatalog(scenarios = scenarioCatalog) {
  const errors = [];
  const ids = new Set();
  const coveredCategories = new Set();

  for (const scenario of scenarios) {
    if (!scenario.id || ids.has(scenario.id)) errors.push(`duplicate or missing id: ${scenario.id || '<missing>'}`);
    ids.add(scenario.id);

    if (!scenarioCategories.includes(scenario.category)) errors.push(`${scenario.id}: unknown category ${scenario.category}`);
    coveredCategories.add(scenario.category);

    if (!scenario.source || typeof scenario.source !== 'string') errors.push(`${scenario.id}: source is required`);
    if (typeof scenario.confidence !== 'number' || scenario.confidence <= 0 || scenario.confidence > 1) errors.push(`${scenario.id}: confidence must be within (0, 1]`);
    if (!Array.isArray(scenario.expectedSignals) || scenario.expectedSignals.length === 0) errors.push(`${scenario.id}: expectedSignals are required`);
    if (!Array.isArray(scenario.providers) || scenario.providers.length === 0) errors.push(`${scenario.id}: providers are required`);
    if (!scenario.writePolicy || scenario.writePolicy.realWriteAllowed !== false) errors.push(`${scenario.id}: real writes must be disabled`);
    if (!Array.isArray(scenario.writePolicy?.blockedActions) || scenario.writePolicy.blockedActions.length === 0) errors.push(`${scenario.id}: blocked write-like actions are required`);
  }

  for (const category of scenarioCategories) {
    if (!coveredCategories.has(category)) errors.push(`missing category coverage: ${category}`);
  }

  return { ok: errors.length === 0, errors };
}

function makeScenario(input) {
  return {
    ...input,
    metadata: {
      fixtureVersion,
      generatedAt,
      sourceMode: 'mock',
    },
  };
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
