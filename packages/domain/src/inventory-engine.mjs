import { roundCurrency } from './profit-engine.mjs';

export function buildReorderRecommendation(product, inventory, forecast = {}) {
  const dailySales = Number(forecast.dailySales ?? inventory.avgDailySales ?? 0);
  const leadTimeDays = Number(product.leadTimeDays ?? 35);
  const safetyStockDays = Number(product.safetyStockDays ?? 7);
  const available = Number(inventory.available ?? 0);
  const inbound = Number(inventory.inbound ?? 0);
  const daysUntilStockout = dailySales <= 0 ? Infinity : Math.floor((available + inbound) / dailySales);
  const reorderByDays = daysUntilStockout - leadTimeDays - safetyStockDays;
  const recommendedQty = dailySales <= 0 ? 0 : Math.max(0, Math.ceil((leadTimeDays + safetyStockDays + 14) * dailySales - available - inbound));

  return {
    productId: product.id,
    sku: product.sku,
    urgency: reorderByDays <= 0 ? 'high' : reorderByDays <= 14 ? 'medium' : 'low',
    available,
    inbound,
    dailySales,
    daysUntilStockout: Number.isFinite(daysUntilStockout) ? daysUntilStockout : null,
    reorderByDays: Number.isFinite(reorderByDays) ? reorderByDays : null,
    recommendedQty,
    estimatedCashNeeded: roundCurrency(recommendedQty * Number(product.unitCost || 0)),
    rationale: Number.isFinite(daysUntilStockout)
      ? `Stockout in ${daysUntilStockout} days; lead time ${leadTimeDays} days plus ${safetyStockDays} safety days.`
      : 'No recent sales; do not reorder until demand resumes.',
  };
}

export function buildStaleInventoryDecision(product, inventory) {
  const available = Number(inventory.available || 0);
  const sales30d = Number(inventory.sales30d || 0);
  const unitCost = Number(product.unitCost || 0);
  const monthsToClear = sales30d <= 0 ? null : roundCurrency(available / sales30d, 1);
  const capitalAtRisk = roundCurrency(available * unitCost);
  const holdingCostMonthly = roundCurrency(capitalAtRisk * 0.01 + Number(inventory.monthlyStorageFee || 0));

  return {
    productId: product.id,
    sku: product.sku,
    isStale: available > 0 && (sales30d <= 5 || inventory.daysInWarehouse >= 180),
    available,
    sales30d,
    monthsToClear,
    capitalAtRisk,
    holdingCostMonthly,
    options: [
      { type: 'discount', expectedCashRecovered: roundCurrency(capitalAtRisk * 0.72), expectedLoss: roundCurrency(capitalAtRisk * 0.28) },
      { type: 'removal', expectedCashRecovered: roundCurrency(capitalAtRisk * 0.45), expectedLoss: roundCurrency(capitalAtRisk * 0.55) },
      { type: 'dispose', expectedCashRecovered: 0, expectedLoss: capitalAtRisk },
    ],
  };
}

export function buildPriceFollowDecision(product, competitorPrice) {
  const floorPrice = Number(product.breakEvenPrice ?? product.unitCost * 1.35 ?? 0);
  const currentPrice = Number(product.price || 0);
  const targetPrice = Math.max(floorPrice, Number(competitorPrice || currentPrice));

  return {
    productId: product.id,
    sku: product.sku,
    currentPrice: roundCurrency(currentPrice),
    competitorPrice: roundCurrency(competitorPrice),
    breakEvenPrice: roundCurrency(floorPrice),
    recommendedPrice: roundCurrency(targetPrice),
    stillProfitable: targetPrice > floorPrice,
    rationale: targetPrice > floorPrice
      ? `Follow to ${roundCurrency(targetPrice)} while staying above break-even ${roundCurrency(floorPrice)}.`
      : `Do not follow below break-even ${roundCurrency(floorPrice)}.`,
  };
}
