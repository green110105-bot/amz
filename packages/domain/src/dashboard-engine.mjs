import { aggregateProfit, calculateOrderProfit } from './profit-engine.mjs';
import { detectProfitLeaks } from './leak-detector.mjs';
import { buildPriceFollowDecision, buildReorderRecommendation, buildStaleInventoryDecision } from './inventory-engine.mjs';
import { generateAdSuggestions } from './lifecycle-engine.mjs';
import { createAuditAction } from './audit-center.mjs';
import { detectAnomalies } from './monitor-engine.mjs';

export function buildDashboard(store) {
  const profitRecords = store.orders.map((order) => calculateOrderProfit(order, store.costDefaults));
  const overview = aggregateProfit(profitRecords);
  const leaks = detectProfitLeaks({
    products: store.products,
    profitRecords,
    adMetrics: store.adMetrics,
    inventory: store.inventory,
  });
  const adSuggestions = generateAdSuggestions({
    products: store.products,
    adMetrics: store.adMetrics,
    profitRecords,
    inventory: store.inventory,
  });
  const anomalies = detectAnomalies(store);

  const reorderCards = store.products.map((product) => {
    const inventory = store.inventory.find((item) => item.productId === product.id) || {};
    return buildReorderRecommendation(product, inventory);
  });

  // W1: 统一卡片 payload 契约 —— 每张卡 payload 含稳定 id / evidence /
  // expectedImpact / confidence / recommendation / auditRequired，
  // 使 mock 路径与 DB 路径 (extended-routes) 的卡片同构。
  const norm = (type, idx, src) => ({
    id: src.id || `${type}-${idx}`,
    evidence: src.evidence || src.detail || {},
    expectedImpact: src.expectedImpact || src.monthlyImpact || src.impact || {},
    confidence: src.confidence != null ? src.confidence : null,
    recommendation: src.recommendation || src.recommendedAction || src.actionType || null,
    auditRequired: true,
    ...src,
  });
  const actionCards = [
    ...anomalies.slice(0, 3).map((anomaly, i) => ({ type: 'anomaly', priority: anomaly.severity, title: anomaly.type, payload: norm('anomaly', i, anomaly) })),
    ...leaks.slice(0, 3).map((leak, i) => ({ type: 'profit_leak', priority: leak.severity, title: leak.type, payload: norm('profit_leak', i, leak) })),
    ...adSuggestions.slice(0, 3).map((suggestion, i) => ({ type: 'ad_suggestion', priority: suggestion.priority, title: suggestion.actionType, payload: norm('ad_suggestion', i, suggestion) })),
    ...reorderCards.filter((card) => card.urgency !== 'low').slice(0, 2).map((card, i) => ({ type: 'inventory', priority: card.urgency, title: 'REORDER_DECISION', payload: norm('inventory', i, card) })),
  ];

  return {
    generatedAt: new Date().toISOString(),
    sourceMode: 'mock',
    sourceMeta: { source: 'mock', mock: true, realWritesEnabled: false },
    store: store.store || { id: store.storeId || 'mock-store' },
    summary: {
      queuedActions: actionCards.length,
      auditLogs: 0,
    },
    overview,
    actionCards,
  };
}

export function buildProfitOverview(store) {
  const orders = store.orders.map((order) => calculateOrderProfit(order, store.costDefaults));
  return {
    sourceMode: 'mock',
    overview: aggregateProfit(orders),
    orders,
  };
}

export function buildInventoryDecisions(store) {
  return store.products.map((product) => {
    const inventory = store.inventory.find((item) => item.productId === product.id) || {};
    const competitor = store.competitors.find((item) => item.productId === product.id);
    return {
      productId: product.id,
      reorder: buildReorderRecommendation(product, inventory),
      stale: buildStaleInventoryDecision(product, inventory),
      priceFollow: competitor ? buildPriceFollowDecision(product, competitor.price) : null,
    };
  });
}

export function buildAdSuggestionAudits(store) {
  const profitRecords = store.orders.map((order) => calculateOrderProfit(order, store.costDefaults));
  return generateAdSuggestions({ products: store.products, adMetrics: store.adMetrics, profitRecords, inventory: store.inventory })
    .map((suggestion) => createAuditAction({
      sourceModule: 'M3',
      actionType: suggestion.actionType,
      target: { id: suggestion.campaignId, sku: suggestion.sku },
      payload: { bidChangePercent: suggestion.bidChangePercent, requiresRealStoreWrite: false },
      expectedImpact: suggestion.expectedImpact,
      sovereignty: 'manual',
    }));
}

