import { roundCurrency } from './profit-engine.mjs';

export function classifyLifecycle(product, metrics = {}) {
  const daysListed = Number(metrics.daysListed ?? product.daysListed ?? 999);
  const reviewCount = Number(metrics.reviewCount ?? product.reviewCount ?? 0);
  const salesTrend4w = Number(metrics.salesTrend4w ?? 0);
  const bsrTrend4w = Number(metrics.bsrTrend4w ?? 0);
  const inventoryDays = Number(metrics.inventoryDays ?? 0);

  let stage = 'mature';
  let confidence = 0.7;
  const evidence = [];

  if (daysListed < 90 || reviewCount < 30) {
    stage = 'launch';
    confidence = 0.82;
    evidence.push('Listed less than 90 days or fewer than 30 reviews.');
  } else if (salesTrend4w > 0.12 && reviewCount < 120) {
    stage = 'growth';
    confidence = 0.78;
    evidence.push('Sales have grown for the recent 4-week window.');
  } else if (bsrTrend4w > 0.18 && inventoryDays > 60) {
    stage = 'decline';
    confidence = 0.76;
    evidence.push('BSR is weakening while inventory coverage is high.');
  } else {
    evidence.push('Sales and BSR are relatively stable.');
  }

  return { productId: product.id, sku: product.sku, stage, confidence, evidence };
}

export function generateAdSuggestions({ products = [], adMetrics = [], profitRecords = [], inventory = [] }) {
  const profitByProduct = new Map(profitRecords.map((record) => [record.productId, record]));
  const inventoryByProduct = new Map(inventory.map((item) => [item.productId, item]));
  const suggestions = [];

  for (const ad of adMetrics) {
    const product = products.find((item) => item.id === ad.productId);
    if (!product || product.optimizationPaused) continue;

    const profit = profitByProduct.get(product.id);
    const stock = inventoryByProduct.get(product.id);
    const lifecycle = classifyLifecycle(product, ad.lifecycleSignals || {});
    const salesRoas = Number(ad.spend || 0) === 0 ? 0 : Number(ad.sales || 0) / Number(ad.spend || 1);
    const profitRoas = Number(ad.spend || 0) === 0 ? 0 : Number(profit?.netProfit || 0) / Number(ad.spend || 1);

    if (stock && stock.available <= Math.max(5, stock.avgDailySales * 7)) {
      suggestions.push(makeSuggestion(product, ad, lifecycle.stage, 'REDUCE_BUDGET_STOCKOUT_RISK', 'high', [
        `Available inventory ${stock.available} is below 7 days of demand.`,
      ], -20));
      continue;
    }

    if (profitRoas > 1.5 && ad.acos < ad.targetAcos && lifecycle.stage === 'growth') {
      suggestions.push(makeSuggestion(product, ad, lifecycle.stage, 'INCREASE_BUDGET', 'high', [
        `Profit ROAS ${profitRoas.toFixed(2)} is healthy.`,
        `ACOS ${roundCurrency(ad.acos * 100, 1)}% is below target ${roundCurrency(ad.targetAcos * 100, 1)}%.`,
      ], 25));
    }

    if (profitRoas < 1 && lifecycle.stage !== 'launch') {
      suggestions.push(makeSuggestion(product, ad, lifecycle.stage, 'LOWER_BID_OR_PAUSE', 'high', [
        `Profit ROAS ${profitRoas.toFixed(2)} is below 1.`,
        `Sales ROAS ${salesRoas.toFixed(2)} may hide actual profit loss.`,
      ], -15));
    }

    if (ad.clicks30d >= 30 && ad.orders30d === 0) {
      suggestions.push(makeSuggestion(product, ad, lifecycle.stage, 'ADD_NEGATIVE_KEYWORD', 'medium', [
        `${ad.keyword || 'search term'} has ${ad.clicks30d} clicks and 0 orders in 30 days.`,
      ], 0));
    }
  }

  return suggestions.sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority));
}

function makeSuggestion(product, ad, lifecycleStage, actionType, priority, evidence, bidChangePercent) {
  return {
    id: `${product.id}:${ad.campaignId}:${actionType}`,
    productId: product.id,
    sku: product.sku,
    campaignId: ad.campaignId,
    keyword: ad.keyword || null,
    lifecycleStage,
    actionType,
    priority,
    bidChangePercent,
    evidence,
    expectedImpact: estimateImpact(actionType, ad),
    auditRequired: true,
    status: 'pending_review',
  };
}

function estimateImpact(actionType, ad) {
  if (actionType === 'INCREASE_BUDGET') {
    return { metric: 'monthly_sales', change: roundCurrency(Number(ad.sales || 0) * 0.15), horizonDays: 30 };
  }
  if (actionType === 'LOWER_BID_OR_PAUSE') {
    return { metric: 'monthly_loss_avoided', change: roundCurrency(Number(ad.spend || 0) * 0.3), horizonDays: 30 };
  }
  if (actionType === 'REDUCE_BUDGET_STOCKOUT_RISK') {
    return { metric: 'stockout_risk', change: -0.2, horizonDays: 14 };
  }
  return { metric: 'wasted_spend', change: roundCurrency(Number(ad.spend || 0) * 0.1), horizonDays: 30 };
}

function priorityRank(priority) {
  return { high: 0, medium: 1, low: 2 }[priority] ?? 9;
}
