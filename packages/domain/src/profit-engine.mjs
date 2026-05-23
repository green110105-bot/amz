export function roundCurrency(value, digits = 2) {
  return Number((Number(value || 0)).toFixed(digits));
}

export function sumValues(values) {
  return roundCurrency(values.reduce((total, value) => total + Number(value || 0), 0));
}

function resolveCost(input, fallback = 0) {
  if (input && typeof input === 'object' && 'value' in input) {
    return {
      value: Number(input.value || 0),
      source: input.source || 'provided',
      estimated: Boolean(input.estimated),
    };
  }

  return {
    value: Number(input ?? fallback ?? 0),
    source: input === undefined || input === null ? 'default' : 'provided',
    estimated: input === undefined || input === null,
  };
}

export function calculateOrderProfit(order, costConfig = {}) {
  const quantity = Number(order.quantity || 1);
  const revenue = Number(order.itemPrice || order.revenue || 0) * quantity;

  const costItems = {
    amazonReferralFee: resolveCost(order.amazonReferralFee ?? order.referralFee),
    fbaFulfillmentFee: resolveCost(order.fbaFulfillmentFee),
    refundProvision: order.refundProvision === undefined || order.refundProvision === null
      ? resolveCost({ value: revenue * Number(costConfig.refundProvisionRate ?? 0.03), source: 'historical_rate', estimated: true })
      : resolveCost(order.refundProvision),
    refundProcessingFee: resolveCost(order.refundProcessingFee),
    storageFeeAllocation: resolveCost(order.storageFeeAllocation),
    longTermStorageFee: resolveCost(order.longTermStorageFee),
    adCostAllocation: resolveCost(order.adCostAllocation),
    cogs: resolveCost(order.cogs ?? costConfig.cogsPerUnit, 0),
    freight: resolveCost(order.freight ?? costConfig.freightPerUnit, 0),
    customsDuty: resolveCost(order.customsDuty),
    refundCommission: resolveCost(order.refundCommission),
    fxLoss: resolveCost(order.fxLoss),
    vat: resolveCost(order.vat),
    paymentFee: resolveCost(order.paymentFee),
    salesTax: resolveCost(order.salesTax),
    capitalCost: resolveCost(order.capitalCost),
    otherCosts: resolveCost(order.otherCosts),
  };

  if (!('cogs' in order) && 'cogsPerUnit' in costConfig) {
    costItems.cogs.value *= quantity;
  }
  if (!('freight' in order) && 'freightPerUnit' in costConfig) {
    costItems.freight.value *= quantity;
  }

  const totalCosts = sumValues(Object.values(costItems).map((item) => item.value));
  const netProfit = roundCurrency(revenue - totalCosts);
  const profitMargin = revenue === 0 ? 0 : roundCurrency(netProfit / revenue, 4);
  const estimatedFields = Object.entries(costItems)
    .filter(([, item]) => item.estimated)
    .map(([key]) => key);

  return {
    orderId: order.amazonOrderId || order.orderId || null,
    productId: order.productId || null,
    revenue: roundCurrency(revenue),
    totalCosts,
    netProfit,
    profitMargin,
    breakdown: Object.fromEntries(
      Object.entries(costItems).map(([key, item]) => [key, roundCurrency(item.value)]),
    ),
    accuracy: {
      level: estimatedFields.length === 0 ? 'final' : estimatedFields.length <= 4 ? 'high_estimate' : 'estimate',
      estimatedFields,
      confidence: roundCurrency(Math.max(0.35, 1 - estimatedFields.length * 0.04), 2),
    },
  };
}

export function aggregateProfit(records) {
  const revenue = sumValues(records.map((record) => record.revenue));
  const netProfit = sumValues(records.map((record) => record.netProfit));
  const totalCosts = sumValues(records.map((record) => record.totalCosts));
  return {
    revenue,
    totalCosts,
    netProfit,
    profitMargin: revenue === 0 ? 0 : roundCurrency(netProfit / revenue, 4),
    orders: records.length,
    confidence: records.length === 0
      ? 0
      : roundCurrency(records.reduce((sum, record) => sum + record.accuracy.confidence, 0) / records.length, 2),
  };
}
