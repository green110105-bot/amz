export function detectAnomalies({ products = [], inventory = [], adMetrics = [], monitorSignals = {} }) {
  const anomalies = [];
  const stockByProduct = new Map(inventory.map((item) => [item.productId, item]));
  const adByProduct = new Map(adMetrics.map((item) => [item.productId, item]));

  for (const product of products) {
    const stock = stockByProduct.get(product.id) || {};
    const ad = adByProduct.get(product.id) || {};
    const signal = monitorSignals[product.id] || {};

    if (signal.buyBoxLostMinutes >= 30) {
      anomalies.push(makeAnomaly(product, 'BUY_BOX_LOST', 'P0', [
        `Buy Box lost for ${signal.buyBoxLostMinutes} minutes.`,
      ], 'Check price competitiveness, seller health, inventory, and hijackers.'));
    }

    if (signal.listingChanged) {
      anomalies.push(makeAnomaly(product, 'LISTING_CHANGED', 'P0', [
        'Title, bullets, images, or A+ content changed outside the expected version flow.',
      ], 'Compare latest listing snapshot and restore approved version if unauthorized.'));
    }

    if (signal.accountHealthAtRisk) {
      anomalies.push(makeAnomaly(product, 'ACCOUNT_HEALTH_RISK', 'P0', [
        signal.accountHealthReason || 'Account health metric is near threshold.',
      ], 'Open account health details and prepare appeal evidence.'));
    }

    if (product.returnRate7d && product.returnRate7d > 0.1) {
      anomalies.push(makeAnomaly(product, 'REFUND_SPIKE', 'P1', [
        `7d return rate ${(product.returnRate7d * 100).toFixed(1)}% exceeds 10%.`,
      ], 'Review quality, recent reviews, and listing expectation mismatch.'));
    }

    if (ad.hourlySpend && ad.avgHourlySpend && ad.hourlySpend > ad.avgHourlySpend * 5) {
      anomalies.push(makeAnomaly(product, 'AD_SPEND_SPIKE', 'P1', [
        `Hourly spend ${ad.hourlySpend} is above 5x baseline ${ad.avgHourlySpend}.`,
      ], 'Audit bids, budget changes, placement multipliers, and campaign status.'));
    }

    if (stock.available !== undefined && stock.avgDailySales && stock.available / stock.avgDailySales < 7) {
      anomalies.push(makeAnomaly(product, 'LOW_INVENTORY', 'P1', [
        `Inventory coverage is ${(stock.available / stock.avgDailySales).toFixed(1)} days.`,
      ], 'Create reorder plan or reduce ad pressure to avoid stockout.'));
    }
  }

  return anomalies.sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
}

export function buildMonitorOverview(store) {
  const anomalies = detectAnomalies(store);
  return {
    sourceMode: 'mock',
    generatedAt: new Date().toISOString(),
    summary: {
      totalOpen: anomalies.length,
      p0: anomalies.filter((item) => item.severity === 'P0').length,
      p1: anomalies.filter((item) => item.severity === 'P1').length,
      p2: anomalies.filter((item) => item.severity === 'P2').length,
    },
    anomalies,
    notifications: anomalies.map((anomaly) => buildNotification(anomaly)),
  };
}

function makeAnomaly(product, type, severity, evidence, recommendedAction) {
  return {
    id: `${product.id}:${type}`,
    productId: product.id,
    sku: product.sku,
    asin: product.asin,
    type,
    severity,
    evidence,
    recommendedAction,
    status: 'open',
    slaMinutes: severity === 'P0' ? 5 : severity === 'P1' ? 15 : 1440,
  };
}

function buildNotification(anomaly) {
  return {
    id: `notif:${anomaly.id}`,
    channel: 'in_app_mock',
    severity: anomaly.severity,
    title: `${anomaly.severity} ${anomaly.type} on ${anomaly.sku}`,
    actionRequired: anomaly.severity !== 'P2',
  };
}

function severityRank(severity) {
  return { P0: 0, P1: 1, P2: 2 }[severity] ?? 9;
}
