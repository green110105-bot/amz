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

  return {
    generatedAt: new Date().toISOString(),
    sourceMode: 'mock',
    overview,
    actionCards: [
      ...anomalies.slice(0, 3).map((anomaly) => ({ type: 'anomaly', priority: anomaly.severity, title: anomaly.type, payload: anomaly })),
      ...leaks.slice(0, 3).map((leak) => ({ type: 'profit_leak', priority: leak.severity, title: leak.type, payload: leak })),
      ...adSuggestions.slice(0, 3).map((suggestion) => ({ type: 'ad_suggestion', priority: suggestion.priority, title: suggestion.actionType, payload: suggestion })),
      ...reorderCards.filter((card) => card.urgency !== 'low').slice(0, 2).map((card) => ({ type: 'inventory', priority: card.urgency, title: 'REORDER_DECISION', payload: card })),
    ],
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

