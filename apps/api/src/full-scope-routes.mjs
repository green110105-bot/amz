import { sampleStore } from '../../../packages/mock-data/src/sample-store.mjs';
import { json } from './routes.mjs';
import { documentedRoutes } from '../../../packages/contracts/generated/documented-routes.mjs';
import { aggregateProfit, calculateOrderProfit } from '../../../packages/domain/src/profit-engine.mjs';
import { detectProfitLeaks } from '../../../packages/domain/src/leak-detector.mjs';
import { buildPriceFollowDecision, buildReorderRecommendation, buildStaleInventoryDecision } from '../../../packages/domain/src/inventory-engine.mjs';
import { classifyLifecycle, generateAdSuggestions } from '../../../packages/domain/src/lifecycle-engine.mjs';
import { createAuditAction, mockExecuteAuditAction } from '../../../packages/domain/src/audit-center.mjs';
import { clusterReviews, detectCompetitorChanges } from '../../../packages/domain/src/market-intel-engine.mjs';
import {
  applyIteration,
  buildApplyPreview,
  checkImageCompliance,
  compareListingVersions,
  createAbExperiment,
  createIterationSession,
  createListingVersion,
  createM1Diagnosis,
  decideIterationRound,
  finishIteration,
  generateImageCandidates,
  generateThreeProposals,
  getCategoryTemplate,
  listCategoryTemplates,
  rollbackListingVersion,
  startIterationRound,
} from '../../../packages/domain/src/m1-iteration-engine.mjs';
import {
  assessFxRisk,
  buildCashflow90DayView,
  buildExportReportSummary,
  buildPurchaseOrderSummary,
  buildTaxAssistant,
  evaluateCustomAlerts,
  reconcileLightweightPurchaseOrder,
  simulateGlobalScenario,
  simulateSkuScenario,
  transitionLightweightPurchaseOrder,
} from '../../../packages/domain/src/m2-advanced-engine.mjs';
import {
  buildBrandDefensePlan,
  evaluateAdvancedAutoExecutionGuardrails,
  evaluateCreativeAbTest,
  optimizeBudgetAllocation,
  recommendCompetitorAsinAttacks,
  recommendDaypartingBids,
  recommendPlacementAdjustments,
} from '../../../packages/domain/src/m3-advanced-engine.mjs';
import {
  buildM4Runbook,
  buildM4SlaBoard,
  buildResolutionCase,
  detectM4AdvancedAnomalies,
  dispatchM4Anomalies,
  draftRecoveryEmail,
  draftReviewAppeal,
  generateM4PostmortemReport,
  getM4PlaybookCatalog,
  getM4RuleCatalog,
  groupRelatedAnomalies,
  routeM4Notifications,
} from '../../../packages/domain/src/m4-advanced-engine.mjs';
import {
  buildOnboardingPlan,
  evaluateQuotaUsage,
  getPlanEntitlements,
  hasPermission,
  meterUsage,
} from '../../../packages/domain/src/commercial-engine.mjs';

const NOW = '2026-05-08T10:23:00.000Z';
const iterations = new Map();
const versionsByProduct = new Map();
const experiments = new Map();
const imageGenerations = new Map();
const auditLogs = new Map();
const purchaseOrders = new Map();

seedState();

export async function tryHandleFullScopeRoute(request) {
  const url = new URL(request.url, 'http://localhost');
  const method = (request.method || 'GET').toUpperCase();
  const path = url.pathname;
  const body = ['POST', 'PUT', 'PATCH'].includes(method) ? await readJson(request) : {};

  const direct = routeDirect(method, path, body);
  if (direct) return json(direct.body, direct.status || 200);

  const module = documentedModule(method, path);
  if (!module) return null;

  let bodyByModule;
  if (module === 'M1') bodyByModule = handleM1(method, path, body);
  else if (module === 'M2') bodyByModule = handleM2(method, path, body);
  else if (module === 'M3') bodyByModule = handleM3(method, path, body);
  else if (module === 'M4') bodyByModule = handleM4(method, path, body);
  else if (module === 'AUDIT') bodyByModule = handleAudit(method, path, body);
  else if (module === 'PRD') bodyByModule = handlePlatform(method, path, body);
  else bodyByModule = buildImplementedContract(module, method, path);

  return json(bodyByModule);
}

function routeDirect(method, path, body) {
  if (method === 'GET' && path === '/api/v1/commercial/entitlements') return ok({ plan: sampleStore.tenant.plan, entitlements: getPlanEntitlements(sampleStore.tenant.plan) });
  if (method === 'GET' && path === '/api/v1/commercial/quota') return ok({ quota: evaluateQuotaUsage({ plan: sampleStore.tenant.plan, stores: 1, skus: sampleStore.products.length, members: 3, aiUsed: 1200 }) });
  if (method === 'GET' && path === '/api/v1/commercial/onboarding') return ok({ plan: buildOnboardingPlan({ hasSpApi: false, hasAdsApi: false, hasCostUpload: true, hasThirdParty: false, products: sampleStore.products.length }) });
  if (method === 'POST' && path === '/api/v1/commercial/usage') return ok({ usage: meterUsage(body.events || []) });
  if (method === 'POST' && path === '/api/v1/rbac/check') return ok({ role: body.role, permission: body.permission, allowed: hasPermission(body.role, body.permission) });
  return null;
}

function handleM1(method, path, body) {
  let params;
  if (method === 'GET' && path === '/api/v1/listings') return withMeta('M1', { listings: sampleStore.products.map((product) => ({ productId: product.id, sku: product.sku, asin: product.asin, title: listingFor(product.id).title, score: m1Context(product.id).diagnosis.total_score })) });
  if (method === 'POST' && path === '/api/v1/listings/diagnose-batch') return withMeta('M1', { status: 'completed_mock', diagnoses: sampleStore.products.map((product) => m1Context(product.id).diagnosis) });
  if (method === 'GET' && path === '/api/v1/listings/keywords-library') return withMeta('M1', { keywords: sampleStore.searchTerms.map((term) => ({ keyword: term.term, productId: term.productId, conversionShare: ratio(term.conversions, term.impressions) })) });
  if (method === 'GET' && path === '/api/v1/listings/templates') return withMeta('M1', { templates: listCategoryTemplates() });
  if (method === 'POST' && path === '/api/v1/listings/images/compliance-check') return withMeta('M1', { compliance: checkImageCompliance(body.image || body, body.options || {}) });
  if (method === 'POST' && path === '/api/v1/listings/images/critique') return withMeta('M1', { critique: checkImageCompliance(body.image || body, body.options || {}), suggestions: ['main image needs compliant proof', 'gallery should show dimensions and pain-point evidence'] });
  if (method === 'GET' && (params = match('/api/v1/listings/templates/{category}', path))) return withMeta('M1', { template: getCategoryTemplate(params.category) });
  if (method === 'GET' && (params = match('/api/v1/listings/{productId}/score', path))) return withMeta('M1', { productId: params.productId, score: m1Context(params.productId).diagnosis.total_score, dimensions: m1Context(params.productId).diagnosis.scores });
  if (method === 'POST' && (params = match('/api/v1/listings/{productId}/diagnose', path))) return withMeta('M1', { status: 'completed_mock', diagnosis: m1Context(params.productId).diagnosis });
  if (method === 'GET' && (params = match('/api/v1/listings/{productId}/diagnoses', path))) return withMeta('M1', { diagnoses: [m1Context(params.productId).diagnosis] });
  if (method === 'POST' && (params = match('/api/v1/listings/{productId}/iterations', path))) return createM1Iteration(params.productId, body);
  if (method === 'GET' && (params = match('/api/v1/listings/{productId}/iterations/active', path))) return getActiveM1Iteration(params.productId);
  if (method === 'GET' && (params = match('/api/v1/iterations/{iterationId}', path))) return withMeta('M1', { iteration: iterations.get(params.iterationId) || createM1Iteration(sampleStore.products[0].id, {}).iteration });
  if (method === 'POST' && (params = match('/api/v1/iterations/{iterationId}/rounds', path))) return addM1Round(params.iterationId, body);
  if (method === 'GET' && (params = match('/api/v1/iterations/{iterationId}/rounds/{roundNumber}', path))) return withMeta('M1', { round: (iterations.get(params.iterationId)?.rounds || [])[Number(params.roundNumber) - 1] || null });
  if (method === 'POST' && (params = match('/api/v1/iterations/{iterationId}/rounds/{roundNumber}/proposals', path))) return buildM1Proposals(params.iterationId, body);
  if (method === 'PUT' && (params = match('/api/v1/iterations/{iterationId}/rounds/{roundNumber}/decision', path))) return decideM1(params.iterationId, body);
  if (method === 'POST' && (params = match('/api/v1/iterations/{iterationId}/preview', path))) return previewM1(params.iterationId);
  if (method === 'POST' && (params = match('/api/v1/iterations/{iterationId}/apply', path))) return applyM1(params.iterationId, body);
  if (method === 'GET' && (params = match('/api/v1/listings/{productId}/versions', path))) return withMeta('M1', { versions: ensureVersions(params.productId) });
  if (method === 'POST' && (params = match('/api/v1/listings/{productId}/versions/{versionId}/rollback', path))) {
    const versions = ensureVersions(params.productId);
    const targetVersionId = versions.some((version) => version.id === params.versionId) ? params.versionId : versions[0].id;
    return withMeta('M1', rollbackListingVersion(versions, targetVersionId, { requestedBy: body.requestedBy || 'operator-demo' }));
  }
  if (method === 'POST' && (params = match('/api/v1/listings/{productId}/versions/compare', path))) return compareM1(params.productId, body);
  if (method === 'POST' && (params = match('/api/v1/listings/{productId}/images/generate', path))) return generateM1Images(params.productId, body);
  if (method === 'GET' && (params = match('/api/v1/listings/images/generations/{generationId}', path))) return imageGenerations.get(params.generationId) || withMeta('M1', { error: 'generation_not_found', generationId: params.generationId });
  if (method === 'POST' && (params = match('/api/v1/listings/{productId}/experiments', path))) return createM1Experiment(params.productId, body);
  if (method === 'GET' && (params = match('/api/v1/listings/{productId}/experiments', path))) return withMeta('M1', { experiments: [...experiments.values()].filter((item) => item.productId === params.productId) });
  if (method === 'GET' && (params = match('/api/v1/experiments/{experimentId}', path))) return withMeta('M1', { experiment: experiments.get(params.experimentId) || createM1Experiment(sampleStore.products[0].id, {}).experiment });
  return buildImplementedContract('M1', method, path, { primaryCapabilities: ['diagnosis', 'iteration_state_machine', 'versioning', 'ab_experiment', 'image_compliance'] });
}

function handleM2(method, path, body) {
  let params;
  if (method === 'GET' && path === '/api/v1/profit/skus') return withMeta('M2', { skus: sampleStore.products.map((product) => ({ productId: product.id, sku: product.sku, overview: aggregateProfit(profitRecords().filter((record) => record.productId === product.id)) })) });
  if (method === 'GET' && path === '/api/v1/profit/orders') return withMeta('M2', { orders: profitRecords() });
  if (method === 'GET' && path === '/api/v1/profit/leaks') return withMeta('M2', { leaks: profitLeaks() });
  if (method === 'GET' && path === '/api/v1/inventory/reorder') return withMeta('M2', { recommendations: reorderDecisions() });
  if (method === 'GET' && path === '/api/v1/inventory/slow-moving') return withMeta('M2', { decisions: slowMovingDecisions() });
  if (method === 'GET' && path === '/api/v1/repricing/decisions') return withMeta('M2', { decisions: repricingDecisions() });
  if (method === 'GET' && path === '/api/v1/purchase-orders') return withMeta('M2', { summary: buildPurchaseOrderSummary([...purchaseOrders.values()]), purchaseOrders: [...purchaseOrders.values()] });
  if (method === 'POST' && path === '/api/v1/purchase-orders') return createPo(body);
  if (method === 'GET' && path === '/api/v1/profit/cashflow') return withMeta('M2', cashflowView());
  if (method === 'POST' && path === '/api/v1/profit/scenario/single-sku') return withMeta('M2', simulateSkuScenario({ baseline: m2Baseline(body.productId), adjustments: body.adjustments || { priceChangePct: -0.05, acosDelta: 0.02 }, horizonDays: body.horizonDays || 30 }));
  if (method === 'POST' && path === '/api/v1/profit/scenario/global') return withMeta('M2', simulateGlobalScenario({ skus: sampleStore.products.map((product) => m2Baseline(product.id)), adjustments: body.adjustments || { replenishmentInvestment: 3000 }, startingCash: body.startingCash || 5000 }));
  if (method === 'GET' && path === '/api/v1/profit/fx') return withMeta('M2', fxRisk());
  if (method === 'GET' && path === '/api/v1/profit/fx/sensitivity') return withMeta('M2', { sensitivities: fxRisk().sensitivities, warnings: fxRisk().warnings });
  if (method === 'GET' && path === '/api/v1/alerts/custom') return withMeta('M2', { rules: customAlertRules() });
  if (method === 'POST' && path === '/api/v1/alerts/custom') return withMeta('M2', { rule: body, status: 'saved_mock' });
  if (method === 'GET' && path === '/api/v1/tax/vat') return withMeta('M2', { vat: taxAssistant().vatSummary, prompts: taxAssistant().prompts });
  if (method === 'GET' && path === '/api/v1/tax/sales-tax') return withMeta('M2', { salesTax: taxAssistant().salesTaxSummary, prompts: taxAssistant().prompts });
  if (method === 'POST' && path === '/api/v1/reports/export') return withMeta('M2', buildExportReportSummary({ asOf: '2026-05-08', format: body.format || 'pdf', profitOverview: { overview: aggregateProfit(profitRecords()), orders: profitRecords() }, cashflowView: cashflowView(), purchaseOrders: [...purchaseOrders.values()], fxRisk: fxRisk(), taxAssistant: taxAssistant(), alertEvaluation: testCustomAlert('low_margin_with_spend') }));
  if (method === 'GET' && (params = match('/api/v1/profit/skus/{productId}', path))) return withMeta('M2', { product: productByAnyId(params.productId), overview: aggregateProfit(profitRecords().filter((record) => record.productId === productByAnyId(params.productId).id)) });
  if (method === 'GET' && (params = match('/api/v1/profit/orders/{orderId}', path))) return withMeta('M2', { order: calculateOrderProfit(sampleStore.orders.find((order) => order.amazonOrderId === params.orderId) || sampleStore.orders[0], sampleStore.costDefaults) });
  if (method === 'POST' && (params = match('/api/v1/profit/leaks/{leakId}/action', path))) return audited('M2', 'LEAK_ACTION', params.leakId, body);
  if (method === 'POST' && (params = match('/api/v1/purchase-orders/{poId}/transition', path))) return transitionPo(params.poId, body.nextStatus || 'in_transit', body);
  if (method === 'POST' && (params = match('/api/v1/purchase-orders/{poId}/reconcile', path))) return reconcilePo(params.poId, body);
  if (method === 'POST' && (params = match('/api/v1/alerts/custom/{ruleId}/test', path))) return testCustomAlert(params.ruleId, body);
  return buildImplementedContract('M2', method, path, { primaryCapabilities: ['order_profit', 'cashflow_90d', 'scenario_simulation', 'fx_tax', 'custom_alerts', 'purchase_orders'] });
}

function handleM3(method, path, body) {
  let params;
  if (method === 'GET' && path === '/api/v1/ads/lifecycle') return withMeta('M3', { groups: sampleStore.products.map((product) => ({ productId: product.id, stage: classifyLifecycle(product, adMetric(product.id)?.lifecycleSignals || {}).stage })) });
  if (method === 'GET' && path === '/api/v1/ads/campaigns') return withMeta('M3', { campaigns: campaigns() });
  if (method === 'GET' && path === '/api/v1/ads/dayparting') return withMeta('M3', dayparting());
  if (method === 'GET' && path === '/api/v1/ads/structure-health') return withMeta('M3', { score: 78, gaps: ['brand defense gap', 'waste keyword isolation'], placement: placement() });
  if (method === 'POST' && path === '/api/v1/ads/budget-allocator/optimize') return withMeta('M3', optimizeBudgetAllocation({ totalBudget: body.totalBudget || 300, campaigns: body.campaigns || campaigns() }));
  if (method === 'GET' && path === '/api/v1/ads/brand-defense') return withMeta('M3', brandDefense());
  if (method === 'GET' && path === '/api/v1/ads/competitor-attack/recommendations') return withMeta('M3', competitorAttack());
  if (method === 'POST' && path === '/api/v1/ads/creatives/ab-test') return withMeta('M3', creativeAb(body));
  if (method === 'GET' && path === '/api/v1/ads/keyword-rankings') return withMeta('M3', { rankings: sampleStore.searchTerms.map((term, index) => ({ query: term.term, rank: 8 + index * 4, productId: term.productId })) });
  if (method === 'GET' && path === '/api/v1/ads/sqp') return withMeta('M3', { sqp: sampleStore.searchTerms.map((term) => ({ query: term.term, impressionShare: 0.08, clickShare: 0.1, conversionShare: 0.12 })) });
  if (method === 'GET' && path === '/api/v1/ads/inventory-link') return withMeta('M3', { rules: [{ sku: 'CASE-001', inventoryDays: 4, lowInventoryAction: 'cap_budget' }] });
  if (method === 'GET' && (params = match('/api/v1/ads/suggestions/{suggestionId}', path))) return withMeta('M3', { suggestion: adSuggestion(params.suggestionId) });
  if (method === 'POST' && (params = match('/api/v1/ads/suggestions/{suggestionId}/execute', path))) return executeAd(params.suggestionId, body);
  if (method === 'POST' && (params = match('/api/v1/ads/suggestions/{suggestionId}/customize', path))) return executeAd(params.suggestionId, { ...body, customized: true });
  if (method === 'POST' && (params = match('/api/v1/ads/suggestions/{suggestionId}/reject', path))) return withMeta('M3', { suggestionId: params.suggestionId, status: 'rejected_with_feedback', feedback: body });
  if (method === 'POST' && path === '/api/v1/ads/suggestions/batch-execute') return withMeta('M3', { batchId: 'ads-batch-mock-1', results: (body.suggestionIds || ['sug-1']).map((id) => executeAd(id, body)) });
  if (method === 'GET' && (params = match('/api/v1/ads/creatives/ab-tests/{testId}', path))) return withMeta('M3', creativeAb({ id: params.testId }));
  return buildImplementedContract('M3', method, path, { primaryCapabilities: ['budget_allocation', 'dayparting', 'placement', 'brand_defense', 'competitor_attack', 'creative_ab', 'guardrails'] });
}

function handleM4(method, path, body) {
  let params;
  if (method === 'GET' && path === '/api/v1/monitor/anomalies') return withMeta('M4', { anomalies: anomalies() });
  if (method === 'GET' && path === '/api/v1/monitor/rules') return withMeta('M4', { rules: getM4RuleCatalog() });
  if (method === 'GET' && path === '/api/v1/monitor/anomaly-groups') return withMeta('M4', { groups: groupRelatedAnomalies(anomalies(), { now: NOW }) });
  if (method === 'GET' && path === '/api/v1/monitor/sla') return withMeta('M4', buildM4SlaBoard(dispatchM4Anomalies({ anomalies: anomalies(), team: team(), now: NOW }), NOW));
  if (method === 'GET' && path === '/api/v1/notifications') return withMeta('M4', routeM4Notifications({ anomalies: anomalies(), now: NOW }));
  if (method === 'GET' && path === '/api/v1/reviews') return withMeta('M4', { reviews: sampleStore.reviews.map(withReviewId) });
  if (method === 'GET' && path === '/api/v1/reviews/clusters') return withMeta('M4', { clusters: clusterReviews(sampleStore.reviews) });
  if (method === 'POST' && path === '/api/v1/reviews/appeals/draft') return withMeta('M4', draftReviewAppeal({ review: withReviewId(body.review || policyReview()), product: sampleStore.products[0], seller: sampleStore.tenant }));
  if (method === 'POST' && path === '/api/v1/reviews/recovery-emails/draft') return withMeta('M4', draftRecoveryEmail({ review: withReviewId(body.review || policyReview()), customer: body.customer || { id: 'customer-1', firstName: 'Ava' }, product: sampleStore.products[0], seller: sampleStore.tenant, now: NOW }));
  if (method === 'GET' && path === '/api/v1/competitors/events') return withMeta('M4', { events: detectCompetitorChanges(sampleStore.competitorSnapshots.previous, sampleStore.competitorSnapshots.current) });
  if (method === 'GET' && path === '/api/v1/monitor/cases/recommendations') return withMeta('M4', { recommendations: getM4PlaybookCatalog().slice(0, 3) });
  if (method === 'POST' && path === '/api/v1/monitor/postmortems/generate') return withMeta('M4', postmortem(body));
  if (method === 'GET' && (params = match('/api/v1/monitor/anomalies/{anomalyId}', path))) return withMeta('M4', { anomaly: anomalies().find((item) => item.anomalyId === params.anomalyId) || anomalies()[0] });
  if (method === 'POST' && (params = match('/api/v1/monitor/anomalies/{anomalyId}/resolve', path))) return withMeta('M4', { status: 'resolved_mock', case: buildResolutionCase({ anomaly: anomalies().find((item) => item.anomalyId === params.anomalyId) || anomalies()[0], actions: body.actions || [], outcome: { resolved: true }, now: NOW }) });
  if (method === 'POST' && (params = match('/api/v1/monitor/anomalies/{anomalyId}/assign', path))) return withMeta('M4', { assignment: dispatchM4Anomalies({ anomalies: [anomalies().find((item) => item.anomalyId === params.anomalyId) || anomalies()[0]], team: team(), now: NOW })[0] });
  if (method === 'POST' && (params = match('/api/v1/monitor/hijacking/{id}/test-buy', path))) return withMeta('M4', { id: params.id, status: 'blocked_policy_no_system_test_buy', runbook: buildM4Runbook('A15') });
  return buildImplementedContract('M4', method, path, { primaryCapabilities: ['22_anomaly_classes', 'notification_routing', 'sla_dispatch', 'review_appeal', 'recovery_email', 'runbooks', 'postmortem'] });
}

function handleAudit(method, path, body) {
  let params;
  if (method === 'GET' && path === '/api/v1/audit') return withMeta('AUDIT', { auditLogs: [...auditLogs.values()] });
  if (method === 'GET' && path === '/api/v1/audit/quotas') return withMeta('AUDIT', { quotas: { dailyAutoActionsTotal: 100, usedToday: auditLogs.size, perSkuDaily: 3 } });
  if (method === 'GET' && path === '/api/v1/audit/circuit-breakers') return withMeta('AUDIT', { circuitBreakers: [{ provider: 'sp_api_write', status: 'open_until_credentials' }, { provider: 'amazon_ads', status: 'closed' }] });
  if (method === 'GET' && path === '/api/v1/audit/conflicts') return withMeta('AUDIT', { conflicts: [{ id: 'conflict-1', target: 'CASE-001', status: 'needs_human', reason: 'inventory cap conflicts with budget increase' }] });
  if (method === 'POST' && path === '/api/v1/audit/batch-revert') return withMeta('AUDIT', { status: 'planned_mock', results: (body.ids || []).map((id) => ({ id, status: 'mock_revert_ready' })) });
  if (method === 'GET' && (params = match('/api/v1/audit/{auditId}', path))) return withMeta('AUDIT', { auditLog: auditLogs.get(params.auditId) || { id: params.auditId, status: 'not_found_mock' } });
  if (method === 'POST' && (params = match('/api/v1/audit/{auditId}/revert', path))) return audited('AUDIT', `REVERT_${auditLogs.get(params.auditId)?.actionType || 'ACTION'}`, params.auditId, { ...body, requiresRealStoreWrite: true });
  return buildImplementedContract('AUDIT', method, path, { primaryCapabilities: ['allowlist', 'risk_gate', 'quota', 'circuit_breaker', 'conflict_detection', 'rollback'] });
}

function handlePlatform(method, path, body) {
  return buildImplementedContract('PRD', method, path, {
    body,
    primaryCapabilities: ['provider_mocks', 'rbac', 'billing_metering', 'onboarding', 'source_confidence', 'real_write_block'],
  });
}

function buildImplementedContract(module, method, path, extra = {}) {
  return withMeta(module, {
    status: 'implemented_mock_contract',
    method,
    path,
    realStoreWrites: 'blocked_until_credentials_and_explicit_approval',
    externalProviders: 'mock_or_sandbox_only',
    ...extra,
  });
}

function createM1Iteration(productId, body) {
  const context = m1Context(productId);
  const iteration = createIterationSession({ ...context, createdBy: body.createdBy || 'operator-demo' });
  iterations.set(iteration.id, iteration);
  return withMeta('M1', { iteration, nextActionUrl: `/api/v1/iterations/${iteration.id}/rounds` });
}

function getActiveM1Iteration(productId) {
  return withMeta('M1', { iteration: [...iterations.values()].find((item) => item.productId === productId && item.status === 'in_progress') || createM1Iteration(productId, {}).iteration });
}

function addM1Round(iterationId, body) {
  const iteration = iterations.get(iterationId) || createM1Iteration(sampleStore.products[0].id, {}).iteration;
  const context = m1Context(iteration.productId);
  const updated = startIterationRound(iteration, { product: context.product, listing: context.listing, category: context.category, searchTerms: context.searchTerms, improvement: body.improvement || context.diagnosis.improvements[0] });
  iterations.set(updated.id, updated);
  return withMeta('M1', { iteration: updated, round: updated.rounds.at(-1) });
}

function buildM1Proposals(iterationId, body) {
  const iteration = iterations.get(iterationId) || createM1Iteration(sampleStore.products[0].id, {}).iteration;
  const context = m1Context(iteration.productId);
  return withMeta('M1', generateThreeProposals({ ...context, improvement: body.improvement || context.diagnosis.improvements[0], preferences: body.preferences || {} }));
}

function decideM1(iterationId, body) {
  let iteration = iterations.get(iterationId) || addM1Round(iterationId, {}).iteration;
  if (iteration.rounds.length === 0) iteration = addM1Round(iteration.id, {}).iteration;
  const updated = decideIterationRound(iteration, { action: body.action || 'accept', selectedProposalId: body.selectedProposalId || 'A', feedback: body.feedback });
  iterations.set(updated.id, updated);
  return withMeta('M1', { iteration: updated });
}

function previewM1(iterationId) {
  const iteration = iterations.get(iterationId) || decideM1(iterationId, {}).iteration;
  const pending = iteration.state === 'pending_apply' ? iteration : finishIteration(iteration);
  iterations.set(pending.id, pending);
  return withMeta('M1', { iteration: pending, preview: buildApplyPreview(pending) });
}

function applyM1(iterationId, body) {
  const pending = previewM1(iterationId).iteration;
  const applied = applyIteration(pending, { confirm: body.confirm !== false, appliedBy: body.appliedBy || 'operator-demo' });
  iterations.set(applied.id, applied);
  versionsByProduct.set(applied.productId, applied.versions);
  return withMeta('M1', { iteration: applied, realStoreWrite: 'blocked_until_credentials' });
}

function compareM1(productId, body) {
  const versions = ensureVersions(productId);
  const from = versions.find((item) => item.id === body.fromVersionId) || versions[0];
  const to = versions.find((item) => item.id === body.toVersionId) || versions[1] || versions[0];
  return withMeta('M1', { diff: compareListingVersions(from, to) });
}

function generateM1Images(productId, body) {
  const context = m1Context(productId);
  const generation = generateImageCandidates({ ...context, improvement: body.improvement || { id: 'image-main', type: 'image', direction: 'Improve main image compliance and conversion proof' }, sellingPoints: body.sellingPoints || ['Warranty', 'Compatibility'] });
  const generationId = `imggen-${context.product.id}-${imageGenerations.size + 1}`;
  const record = withMeta('M1', { generationId, productId: context.product.id, ...generation });
  imageGenerations.set(generationId, record);
  return record;
}

function createM1Experiment(productId, body) {
  const product = productByAnyId(productId);
  const versions = ensureVersions(product.id);
  const experiment = createAbExperiment({ product, experimentType: body.experimentType || 'main_image', controlVersion: versions[0], treatmentVersion: versions[1] || versions[0], durationDays: body.durationDays || 14 });
  experiments.set(experiment.id, experiment);
  return withMeta('M1', { experiment, realAmazonExperiment: 'blocked_until_credentials' });
}

function m1Context(productId) {
  const product = productByAnyId(productId);
  const listing = listingFor(product.id);
  const category = product.sku.includes('LAMP') ? 'home_kitchen' : 'electronics_accessories';
  const searchTerms = sampleStore.searchTerms.filter((item) => item.productId === product.id);
  const reviews = sampleStore.reviews.filter((item) => item.productId === product.id);
  return { product, listing, category, searchTerms, reviews, diagnosis: createM1Diagnosis({ product, listing, category, searchTerms, reviews }) };
}

function ensureVersions(productId) {
  const product = productByAnyId(productId);
  if (!versionsByProduct.has(product.id)) {
    const listing = listingFor(product.id);
    const initial = createListingVersion({ productId: product.id, asin: product.asin, listing, source: 'initial_import', status: 'live', isCurrent: true, versionNumber: 1, scoreSnapshot: { total: m1Context(product.id).diagnosis.total_score } });
    const draft = createListingVersion({ productId: product.id, asin: product.asin, listing: { ...listing, title: `${listing.title || product.title} - AI Draft` }, previousVersions: [initial], source: 'ai_iteration', status: 'draft', scoreSnapshot: { total: initial.scoreSnapshot.total + 6 } });
    versionsByProduct.set(product.id, [initial, draft]);
  }
  return versionsByProduct.get(product.id);
}

function createPo(body) {
  const id = body.id || `po-demo-${purchaseOrders.size + 1}`;
  const purchaseOrder = { id, poNumber: body.poNumber || id.toUpperCase(), status: 'draft', items: body.items || [{ productId: 'prod-case-001', sku: 'CASE-001', quantity: 120 }], totals: body.totals || { totalLandedCost: 1440, currency: 'CNY' }, timeline: { createdAt: NOW } };
  purchaseOrders.set(id, purchaseOrder);
  return withMeta('M2', { purchaseOrder });
}

function transitionPo(poId, nextStatus, body) {
  const current = purchaseOrders.get(poId) || createPo({ id: poId }).purchaseOrder;
  const purchaseOrder = transitionLightweightPurchaseOrder(current, nextStatus, { at: body.at || NOW, actor: body.actor || 'operator-demo' });
  purchaseOrders.set(poId, purchaseOrder);
  return withMeta('M2', { purchaseOrder });
}

function reconcilePo(poId, body) {
  const current = purchaseOrders.get(poId) || createPo({ id: poId }).purchaseOrder;
  const purchaseOrder = reconcileLightweightPurchaseOrder(current, body.receivedItems || current.items.map((item) => ({ sku: item.sku, receivedQuantity: item.quantity })), { at: body.at || NOW });
  purchaseOrders.set(poId, purchaseOrder);
  return withMeta('M2', { purchaseOrder });
}

function profitRecords() {
  return sampleStore.orders.map((order) => calculateOrderProfit(order, sampleStore.costDefaults));
}

function profitLeaks() {
  return detectProfitLeaks({ products: sampleStore.products, profitRecords: profitRecords(), adMetrics: sampleStore.adMetrics, inventory: sampleStore.inventory });
}

function reorderDecisions() {
  return sampleStore.products.map((product) => ({ id: `rec-${product.id}`, ...buildReorderRecommendation(product, sampleStore.inventory.find((item) => item.productId === product.id) || {}) }));
}

function slowMovingDecisions() {
  return sampleStore.products.map((product) => ({ id: `slow-${product.id}`, ...buildStaleInventoryDecision(product, sampleStore.inventory.find((item) => item.productId === product.id) || {}) }));
}

function repricingDecisions() {
  return sampleStore.products.map((product) => ({ id: `repricing-${product.id}`, ...buildPriceFollowDecision(product, sampleStore.competitors.find((item) => item.productId === product.id)?.price || product.price) }));
}

function cashflowView() {
  return buildCashflow90DayView({ asOf: '2026-05-08', startingCash: 5000, warningThreshold: 1200, lockedAssets: { inTransit: 10000 }, events: [{ id: 'po', date: '2026-05-10', direction: 'outflow', amount: 2200, eventType: 'po_balance' }, { id: 'settlement', date: '2026-05-20', direction: 'inflow', amount: 4200, eventType: 'amazon_settlement' }] });
}

function m2Baseline(productId = 'prod-case-001') {
  const product = productByAnyId(productId);
  return { productId: product.id, sku: product.sku, price: product.price, fxRate: 7, monthlyUnits: 120, unitCost: product.unitCost * 7, unitFreight: 5, unitFulfillmentFee: 20, referralFeeRate: 0.15, acos: 0.22, returnRate: product.returnRate30d || 0.04, fixedCosts: 1000, historyDays: 180, targetMargin: 0.12 };
}

function fxRisk() {
  return assessFxRisk({ baseCurrency: 'CNY', rates: { USD: 7.1, EUR: 7.8 }, highRiskAmount: 3000, exposures: [{ id: 'usd-settlement', currency: 'USD', amount: 10000, kind: 'receivable', channel: 'accs' }, { id: 'eur-supplier', currency: 'EUR', amount: 1200, kind: 'payable' }] });
}

function taxAssistant() {
  return buildTaxAssistant({ baseCurrency: 'CNY', sales: [{ country: 'DE', amount: 10000, currency: 'EUR', fxRate: 7.8, vatRate: 0.19, orderCount: 30 }, { country: 'US', state: 'CA', amount: 450000, taxCollected: 32000, orderCount: 180 }], purchases: [{ id: 'PO-1', country: 'DE', inputVat: 1000, imported: true, invoiceUploaded: false }], nexusThresholds: { CA: { sales: 500000, transactions: 200 } } });
}

function customAlertRules() {
  return [{ id: 'low_margin_with_spend', name: 'Low margin with spend', severity: 'P1', conditions: ['sku.profit_margin < 0.15', { condition: 'sku.ad_spend_30d > 500' }, { duration: '3d' }] }];
}

function testCustomAlert(ruleId, body = {}) {
  return withMeta('M2', evaluateCustomAlerts({
    asOf: '2026-05-08',
    subjects: body.subjects || [{ id: 's1', sku: 'CASE-001', profit_margin: 0.12, ad_spend_30d: 620 }],
    history: body.history || {
      s1: [
        { date: '2026-05-06', profit_margin: 0.14, ad_spend_30d: 580 },
        { date: '2026-05-07', profit_margin: 0.13, ad_spend_30d: 600 },
      ],
    },
    rules: customAlertRules().filter((rule) => rule.id === ruleId),
  }));
}

function campaigns() {
  return sampleStore.adMetrics.map((metric) => ({ campaignId: metric.campaignId, productId: metric.productId, currentBudget: Math.max(50, Math.round(metric.spend / 4)), spend: metric.spend, sales: metric.sales, profit: round(metric.sales * 0.25 - metric.spend), profitRoas: round((metric.sales * 0.25 - metric.spend) / Math.max(1, metric.spend)), acos: metric.acos, targetAcos: metric.targetAcos, lifecycleStage: classifyLifecycle(productByAnyId(metric.productId), metric.lifecycleSignals).stage, budgetLimitedDays: metric.spend > 350 ? 4 : 1, minBudget: 30, maxBudget: 250 }));
}

function dayparting() {
  return recommendDaypartingBids({ baseBid: 1, config: { minClicks: 20 }, hourlyMetrics: [{ dayOfWeek: 1, hour: 14, impressions: 1000, clicks: 100, orders: 20, spend: 50, profit: 100 }, { dayOfWeek: 1, hour: 3, impressions: 900, clicks: 100, orders: 2, spend: 40, profit: -10 }] });
}

function placement() {
  return recommendPlacementAdjustments({ campaign: { campaignId: 'camp-case-growth', targetProfitRoas: 1.2 }, placements: [{ placement: 'top_of_search', clicks: 120, orders: 18, spend: 100, sales: 700, profit: 250 }, { placement: 'product_pages', clicks: 120, orders: 3, spend: 100, sales: 120, profit: -40 }] });
}

function brandDefense() {
  return buildBrandDefensePlan({ brandName: 'Acme', categoryAvgBid: 1.1, brandTerms: [{ term: 'acme case', currentBid: 1, adRank: 3, topOfSearchShare: 0.45, competitorShare: 0.25, competitorBidDetected: true }], campaigns: campaigns(), ownAsins: sampleStore.products.map((product) => ({ asin: product.asin })) });
}

function competitorAttack() {
  return recommendCompetitorAsinAttacks({ categoryAvgBid: 1.2, ownProduct: { asin: sampleStore.products[0].asin, bsr: 40, rating: 4.6, price: 22.99, reviewCount: 500 }, competitors: sampleStore.competitors.map((competitor, index) => ({ asin: competitor.asin, bsr: 20 + index * 10, rating: 4.1, price: competitor.price, reviewCount: 300, ageDays: 180 })) });
}

function creativeAb(body) {
  return evaluateCreativeAbTest({ abTest: { id: body.id || 'creative-ab-1', elapsedDays: body.elapsedDays || 14, control: { creativeId: 'creative-a', impressions: 40000, clicks: 800, orders: 40, spend: 700, sales: 2000, profit: 600 }, treatment: { creativeId: 'creative-b', impressions: 40000, clicks: 1100, orders: 88, spend: 900, sales: 4200, profit: 1500 } } });
}

function adSuggestion(id) {
  return { id, actionType: 'DAYPARTING_BID_ADJUSTMENT', target: { sku: 'CASE-001', campaignType: 'SP', inventoryDays: 30 }, bidChangePercent: 0.1, confidence: 0.9 };
}

function executeAd(id, body) {
  const action = { ...adSuggestion(id), ...(body.action || {}) };
  return withMeta('M3', {
    suggestionId: id,
    guardrails: evaluateAdvancedAutoExecutionGuardrails({
      action,
      config: body.config || { enabled: true },
      usage: body.usage || { dailyAutoActionsForSku: 1, dailyAutoActionsTotal: 10, weeklyBudgetChangePct: 0.1 },
      context: body.context || {},
    }),
    audit: audited('M3', action.actionType, id, { ...action, requiresRealStoreWrite: true }),
  });
}

function anomalies() {
  return detectM4AdvancedAnomalies(m4Signals());
}

function m4Signals() {
  const product = { productId: 'p1', sku: 'SKU-1', asin: 'B0SKU1' };
  return {
    tenantId: 'tenant-demo',
    storeId: 'store-demo',
    marketplace: 'US',
    selfSellerId: 'SELLER-SELF',
    now: NOW,
    currency: 'CNY',
    signals: {
      sales: [{ ...product, sales24h: 10, avgSales24h: 50, stdDevSales24h: 10 }],
      bsr: [{ ...product, currentPercentile: 0.25, previousPercentile: 0.1, topPercentThreshold: 0.2 }],
      keywordRanks: [{ ...product, keyword: 'phone case', currentRank: 25, previousRank: 8 }],
      buyBox: [{ ...product, lost: true, lostMinutes: 35, winnerSellerId: 'SELLER-OTHER', estimatedLossPerHour: 3200, currency: 'CNY' }],
      listingChanges: [{ ...product, previousHash: 'old', currentHash: 'new', changedFields: ['title', 'images'] }],
      inventory: [{ ...product, fbaInboundDelayDays: 8, lostUnits: 1, damagedUnits: 0 }],
      campaigns: [{ ...product, campaignId: 'cmp-1', hourlySpend: 600, avgHourlySpend: 100 }],
      refunds: [{ ...product, refundRate24h: 0.12, refundCount24h: 4 }],
      reviews: [{ ...product, negativeReviews24h: 3, avgRating7d: 4.1 }],
      policyWarnings: [{ active: true, policyArea: 'battery', message: 'Category policy update requires review.' }],
      accountHealth: [{ odr: 0.02, lateShipmentRate: 0.01, cancellationRate: 0.01, validTrackingRate: 0.98 }],
      pricing: [{ ...product, ownPrice: 25, competitivePrice: 20, highPriceFlag: true }],
      capacity: [{ ipiScore: 390, previousIpiScore: 430, capacityLimited: false }],
      contentReviews: [{ ...product, contentType: 'A+', status: 'rejected', reason: 'Image claim rejected.' }],
      offers: [{ ...product, nonOwnerSellerIds: ['SELLER-HIJACK'], lowestHijackerPrice: 19.99 }],
      ipAlerts: [{ ...product, active: true, ipType: 'trademark', brandRegistry: true }],
      categoryBsr: [{ ...product, category: 'Phone Cases', top100ChangePct: 0.35 }],
      refundReasons: [{ ...product, reason: 'damaged', currentShare: 0.3, baselineShare: 0.1, count30d: 4 }],
      storage: [{ utilization: 0.87, used: 8700, limit: 10000 }],
      b2bOrders: [{ ...product, isB2B: true, amount: 1200, quantity: 10, orderId: 'b2b-1' }],
      messages: [{ oldestUnrepliedHours: 26, unrepliedCount: 5 }],
      vat: [{ country: 'DE', daysToDeadline: 5, deadline: '2026-05-13' }],
    },
  };
}

function postmortem(body) {
  return generateM4PostmortemReport({ now: NOW, incident: body.incident || { id: 'incident-buybox', title: 'Buy Box incident' }, anomalies: body.anomalies || anomalies().slice(0, 3), timeline: body.timeline || [], actions: body.actions || [{ at: NOW, action: 'draft_price_follow' }], outcome: body.outcome || { resolved: true, resolvedAt: '2026-05-08T11:05:00.000Z', lessons: ['Keep price floors current.'] } });
}

function audited(sourceModule, actionType, targetId, payload) {
  const action = createAuditAction({ sourceModule, actionType, target: { id: targetId }, payload, expectedImpact: payload.expectedImpact || {}, requestedBy: payload.requestedBy || 'operator-demo', sovereignty: payload.sovereignty || 'manual' });
  const record = { ...mockExecuteAuditAction(action), id: `audit-${String(auditLogs.size + 1).padStart(3, '0')}` };
  auditLogs.set(record.id, record);
  return record;
}

function seedState() {
  if (!purchaseOrders.has('po-demo-001')) createPo({ id: 'po-demo-001' });
  if (!auditLogs.has('audit-001')) auditLogs.set('audit-001', { id: 'audit-001', sourceModule: 'M3', actionType: 'ADD_NEGATIVE_KEYWORD', status: 'mock_executed', createdAt: NOW });
}

function documentedModule(method, path) {
  return documentedRoutes.find((route) => route.method.toUpperCase() === method && pathMatches(route.path, path))?.module;
}

function pathMatches(pattern, pathname) {
  return new RegExp(`^${pattern.replace(/\{[^/]+\}/g, '[^/]+')}$`).test(pathname);
}

function match(pattern, pathname) {
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = pathname.split('/').filter(Boolean);
  if (patternParts.length !== pathParts.length) return null;
  const params = {};
  for (let index = 0; index < patternParts.length; index += 1) {
    const token = patternParts[index].match(/^\{(.+)}$/);
    if (token) params[token[1]] = decodeURIComponent(pathParts[index]);
    else if (patternParts[index] !== pathParts[index]) return null;
  }
  return params;
}

function withMeta(module, payload) {
  return { sourceMode: 'mock', module, source: { mode: 'deterministic_mock', confidence: 0.91 }, generatedAt: NOW, ...payload };
}

function ok(payload, status = 200) {
  return { status, body: withMeta('PRD', payload) };
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function productByAnyId(id) {
  return sampleStore.products.find((product) => [product.id, product.asin, product.sku].includes(id)) || sampleStore.products[0];
}

function listingFor(productId) {
  return sampleStore.listings[productByAnyId(productId).id] || {};
}

function adMetric(productId) {
  return sampleStore.adMetrics.find((metric) => metric.productId === productId);
}

function withReviewId(review, index = 0) {
  return { id: review.id || `review-${review.productId || 'generic'}-${index + 1}`, ...review };
}

function policyReview() {
  return {
    id: 'review-policy-fulfillment-1',
    asin: 'B0CASE001',
    rating: 1,
    reviewerName: 'Buyer A',
    postedAt: '2026-05-08',
    title: 'Late delivery',
    body: 'Shipping late and the driver left the box at the wrong door.',
    verifiedPurchase: true,
    orderId: '111-222',
  };
}

function team() {
  return [
    { id: 'u-ops', name: 'Olivia Ops', roles: ['ops'] },
    { id: 'u-legal', name: 'Liam Legal', roles: ['legal'] },
    { id: 'u-finance', name: 'Fiona Finance', roles: ['finance'] },
    { id: 'u-manager', name: 'Mia Manager', roles: ['manager'] },
    { id: 'u-founder', name: 'Fran Founder', roles: ['founder'] },
  ];
}

function ratio(numerator, denominator) {
  return denominator ? round(numerator / denominator, 4) : 0;
}

function round(value, digits = 2) {
  return Number(Number(value || 0).toFixed(digits));
}
