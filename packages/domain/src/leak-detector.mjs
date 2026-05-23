import { roundCurrency } from './profit-engine.mjs';

export function detectProfitLeaks({ products = [], profitRecords = [], adMetrics = [], inventory = [] }) {
  const leaks = [];
  const profitByProduct = new Map(profitRecords.map((record) => [record.productId, record]));
  const adByProduct = new Map(adMetrics.map((metric) => [metric.productId, metric]));
  const inventoryByProduct = new Map(inventory.map((item) => [item.productId, item]));

  for (const product of products) {
    const profit = profitByProduct.get(product.id);
    const ads = adByProduct.get(product.id);
    const stock = inventoryByProduct.get(product.id);

    if (profit && profit.profitMargin < 0) {
      leaks.push(makeLeak(product, 'PRICE_BELOW_FULL_COST', 'P0', Math.abs(profit.netProfit), [
        `Net profit is ${profit.netProfit}`,
        `Margin is ${(profit.profitMargin * 100).toFixed(1)}%`,
      ]));
    }

    if (product.returnRate7d && product.returnRate30d && product.returnRate7d > product.returnRate30d * 1.5) {
      leaks.push(makeLeak(product, 'RETURN_RATE_SPIKE', 'P1', product.returnRate7d * 1000, [
        `7d return rate ${(product.returnRate7d * 100).toFixed(1)}%`,
        `30d baseline ${(product.returnRate30d * 100).toFixed(1)}%`,
      ]));
    }

    if (ads && profit && ads.spend > 0) {
      const profitRoas = profit.netProfit / ads.spend;
      if (profitRoas < 1) {
        leaks.push(makeLeak(product, 'AD_PROFIT_ROAS_LOW', 'P1', ads.spend * (1 - profitRoas), [
          `Profit ROAS ${profitRoas.toFixed(2)} < 1`,
          `Ad spend ${ads.spend}`,
        ]));
      }
    }

    if (stock && stock.available > 0 && stock.sales7d === 0 && stock.daysInStock > 30) {
      leaks.push(makeLeak(product, 'STAGNANT_INVENTORY', 'P1', stock.available * Number(product.unitCost || 0), [
        `${stock.available} units available`,
        `${stock.daysInStock} days in stock with 0 sales in 7d`,
      ]));
    }

    if (stock && stock.daysInWarehouse >= 270) {
      leaks.push(makeLeak(product, 'LONG_TERM_STORAGE_RISK', 'P2', stock.available * Number(product.unitCost || 0) * 0.05, [
        `Warehouse age ${stock.daysInWarehouse} days`,
      ]));
    }
  }

  return leaks.sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || b.estimatedMonthlyImpact - a.estimatedMonthlyImpact);
}

function makeLeak(product, type, severity, estimatedImpact, evidence) {
  return {
    id: `${product.id}:${type}`,
    productId: product.id,
    asin: product.asin,
    sku: product.sku,
    type,
    severity,
    estimatedMonthlyImpact: roundCurrency(estimatedImpact),
    evidence,
    recommendation: recommendationFor(type),
    status: 'open',
  };
}

function recommendationFor(type) {
  const recommendations = {
    PRICE_BELOW_FULL_COST: 'Raise price, reduce ad spend, or pause low-margin sales until cost inputs are corrected.',
    RETURN_RATE_SPIKE: 'Inspect recent reviews, listing expectations, and product quality changes before scaling ads.',
    AD_PROFIT_ROAS_LOW: 'Lower bids or pause campaigns whose profit ROAS is below 1.',
    STAGNANT_INVENTORY: 'Compare discount, removal, and liquidation options using cash recovery impact.',
    LONG_TERM_STORAGE_RISK: 'Start clearance plan before long-term storage fees trigger.',
  };
  return recommendations[type] || 'Review this leak and assign an owner.';
}

function severityRank(severity) {
  return { P0: 0, P1: 1, P2: 2 }[severity] ?? 9;
}
