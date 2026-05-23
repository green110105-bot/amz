const replayMeta = Object.freeze({
  sourceMode: 'mock',
  source: 'deterministic_replay_fixture',
  confidence: 0.91,
  generatedAt: '2026-05-08T00:00:00.000+08:00',
});

export const replayProducts = Object.freeze([
  {
    id: 'replay-case-001',
    asin: 'B0RCASE001',
    sku: 'RCASE-001',
    title: 'Replay Shockproof Phone Case',
    price: 23,
    unitCost: 8.2,
    breakEvenPrice: 16.4,
    leadTimeDays: 35,
    safetyStockDays: 7,
    daysListed: 520,
    reviewCount: 214,
  },
  {
    id: 'replay-lamp-002',
    asin: 'B0RLAMP002',
    sku: 'RLAMP-002',
    title: 'Replay LED Desk Lamp',
    price: 31,
    unitCost: 14.6,
    breakEvenPrice: 24.8,
    leadTimeDays: 42,
    safetyStockDays: 10,
    daysListed: 410,
    reviewCount: 152,
  },
]);

export const replayCostDefaults = Object.freeze({
  refundProvisionRate: 0.04,
  cogsPerUnit: { value: 0, source: 'replay_order_line', estimated: false },
  freightPerUnit: { value: 0, source: 'replay_order_line', estimated: false },
});

export const replayOrderProfit24Months = Object.freeze(makeOrderProfitReplay());

export const replayAds30Days = Object.freeze(makeAdsReplay());

export const replayMarketChangeReplay = Object.freeze({
  metadata: replayMeta,
  reviews: [
    { id: 'rr-001', productId: 'replay-case-001', rating: 2, title: 'Loose corner after one week', body: 'The corner became loose and scratched the phone edge.', date: '2026-04-26' },
    { id: 'rr-002', productId: 'replay-case-001', rating: 3, title: 'Size expectation mismatch', body: 'The size is small for my model and different from expected.', date: '2026-04-28' },
    { id: 'rr-003', productId: 'replay-case-001', rating: 5, title: 'Protected from drops', body: 'Good quality and reliable everyday protection.', date: '2026-05-01' },
    { id: 'rr-004', productId: 'replay-lamp-002', rating: 2, title: 'Heat and damaged package', body: 'The lamp gets heat after one hour and the package arrived damaged.', date: '2026-05-02' },
    { id: 'rr-005', productId: 'replay-lamp-002', rating: 3, title: 'Instructions confusing', body: 'The manual instructions were confusing during setup.', date: '2026-05-04' },
  ],
  competitorSnapshots: {
    previous: [
      { productId: 'replay-case-001', asin: 'B0RCOMPCASE', price: 25.99, titleHash: 'case-copy-v1', dealActive: false },
      { productId: 'replay-lamp-002', asin: 'B0RCOMPLAMP', price: 33.99, titleHash: 'lamp-copy-v1', dealActive: false },
    ],
    current: [
      { productId: 'replay-case-001', asin: 'B0RCOMPCASE', price: 22.49, titleHash: 'case-copy-v2', dealActive: true },
      { productId: 'replay-lamp-002', asin: 'B0RCOMPLAMP', price: 29.49, titleHash: 'lamp-copy-v1', dealActive: false },
      { productId: 'replay-case-001', asin: 'B0RNEWCASE', price: 21.99, titleHash: 'new-case-copy-v1', dealActive: false },
    ],
  },
});

export const replayAuditWriteBlockFixtures = Object.freeze([
  {
    name: 'real_store_campaign_update',
    sourceModule: 'M3',
    actionType: 'LOWER_BID_OR_PAUSE',
    target: { id: 'camp-replay-lamp', type: 'campaign' },
    payload: { amount: 120, requiresRealStoreWrite: true },
    expectedStatus: 'blocked',
    expectedReasonIncludes: 'Real store write is disabled',
  },
  {
    name: 'unsupported_listing_patch',
    sourceModule: 'M1',
    actionType: 'PATCH_LISTING_COPY',
    target: { id: 'replay-case-001', type: 'listing' },
    payload: { amount: 60 },
    expectedStatus: 'blocked',
    expectedReasonIncludes: 'not in the MVP write allowlist',
  },
  {
    name: 'high_value_budget_change',
    sourceModule: 'M3',
    actionType: 'INCREASE_BUDGET',
    target: { id: 'camp-replay-case', type: 'campaign' },
    payload: { budgetDelta: 750 },
    expectedStatus: 'blocked',
    expectedReasonIncludes: 'automatic amount limit',
  },
]);

function makeOrderProfitReplay() {
  const startYear = 2024;
  const startMonth = 5;
  return Array.from({ length: 24 }, (_, index) => {
    const monthNumber = startMonth + index;
    const year = startYear + Math.floor((monthNumber - 1) / 12);
    const month = ((monthNumber - 1) % 12) + 1;
    const monthId = `${year}-${String(month).padStart(2, '0')}`;
    const orders = replayProducts.map((product, productIndex) => makeMonthlyOrder(product, productIndex, index, monthId));
    const totals = sumOrders(orders);
    return Object.freeze({
      month: monthId,
      sequence: index + 1,
      metadata: replayMeta,
      orders: Object.freeze(orders),
      totals: Object.freeze(totals),
    });
  });
}

function makeMonthlyOrder(product, productIndex, index, monthId) {
  const seasonality = [0, 4, 7, 5, 1, -2, -4, -1, 3, 8, 12, 10][index % 12];
  const baseUnits = productIndex === 0 ? 96 : 54;
  const trend = productIndex === 0 ? index * 3 : Math.floor(index * 1.5);
  const units = baseUnits + trend + seasonality - (index === 16 && productIndex === 1 ? 18 : 0);
  const revenue = round(units * product.price);
  const adCost = round(revenue * (productIndex === 0 ? 0.14 + (index >= 18 ? 0.01 : 0) : 0.24 + (index >= 16 ? 0.06 : 0)));
  const cogs = round(units * product.unitCost);
  const freight = round(units * (productIndex === 0 ? 1.28 : 2.35));
  return {
    amazonOrderId: `replay-${monthId}-${product.sku}`,
    productId: product.id,
    quantity: units,
    itemPrice: product.price,
    amazonReferralFee: round(revenue * 0.15),
    fbaFulfillmentFee: round(units * (productIndex === 0 ? 3.92 : 5.85)),
    refundProvision: round(revenue * (productIndex === 0 ? 0.035 : 0.055)),
    storageFeeAllocation: round(units * (productIndex === 0 ? 0.11 : 0.34)),
    adCostAllocation: adCost,
    cogs,
    freight,
    paymentFee: round(revenue * 0.012),
  };
}

function makeAdsReplay() {
  return Array.from({ length: 30 }, (_, index) => {
    const day = String(index + 8).padStart(2, '0');
    const date = index <= 22 ? `2026-04-${day}` : `2026-05-${String(index - 22).padStart(2, '0')}`;
    const caseClicks = 46 + (index % 5);
    const lampClicks = 22 + (index % 4);
    return Object.freeze({
      date,
      metadata: replayMeta,
      rows: Object.freeze([
        {
          productId: 'replay-case-001',
          campaignId: 'camp-replay-case-growth',
          keyword: 'shockproof phone case',
          spend: round(41 + (index % 6) * 1.5),
          sales: round(205 + (index % 4) * 18),
          acos: 0.19,
          targetAcos: 0.26,
          clicks: caseClicks,
          orders: 8 + (index % 3),
          lifecycleSignals: { daysListed: 520, reviewCount: 96, salesTrend4w: 0.16, bsrTrend4w: -0.08, inventoryDays: 18 },
        },
        {
          productId: 'replay-lamp-002',
          campaignId: 'camp-replay-lamp-waste',
          keyword: 'desk lamp',
          spend: round(28 + (index % 3) * 2.25),
          sales: round(index % 10 === 0 ? 0 : 18 + (index % 4) * 6),
          acos: 0.91,
          targetAcos: 0.3,
          clicks: lampClicks,
          orders: index % 10 === 0 ? 0 : 1,
          lifecycleSignals: { daysListed: 410, reviewCount: 152, salesTrend4w: -0.14, bsrTrend4w: 0.24, inventoryDays: 120 },
        },
        {
          productId: 'replay-lamp-002',
          campaignId: 'camp-replay-lamp-zero-order',
          keyword: 'cheap desk lamp',
          spend: round(9 + (index % 2)),
          sales: 0,
          acos: 1,
          targetAcos: 0.3,
          clicks: 2,
          orders: 0,
          lifecycleSignals: { daysListed: 410, reviewCount: 152, salesTrend4w: -0.14, bsrTrend4w: 0.24, inventoryDays: 120 },
        },
      ]),
    });
  });
}

function sumOrders(orders) {
  return orders.reduce((totals, order) => {
    const revenue = round(Number(order.quantity) * Number(order.itemPrice));
    const totalCosts = round([
      'amazonReferralFee',
      'fbaFulfillmentFee',
      'refundProvision',
      'storageFeeAllocation',
      'adCostAllocation',
      'cogs',
      'freight',
      'paymentFee',
    ].reduce((sum, key) => sum + Number(order[key] || 0), 0));
    totals.revenue = round(totals.revenue + revenue);
    totals.totalCosts = round(totals.totalCosts + totalCosts);
    totals.netProfit = round(totals.netProfit + revenue - totalCosts);
    totals.orders += 1;
    totals.units += Number(order.quantity);
    totals.profitMargin = totals.revenue === 0 ? 0 : round(totals.netProfit / totals.revenue, 4);
    return totals;
  }, { revenue: 0, totalCosts: 0, netProfit: 0, profitMargin: 0, orders: 0, units: 0 });
}

function round(value, digits = 2) {
  return Number(Number(value || 0).toFixed(digits));
}
