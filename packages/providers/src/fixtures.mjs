export const providerFixtures = Object.freeze({
  spapi: {
    catalogItems: [
      { asin: 'B0CASE001', sku: 'CASE-001', title: 'Shockproof Phone Case', status: 'Active', marketplaceId: 'ATVPDKIKX0DER' },
      { asin: 'B0CABLE002', sku: 'CABLE-002', title: 'Fast Charging Cable', status: 'Active', marketplaceId: 'ATVPDKIKX0DER' },
    ],
    orders: [
      { amazonOrderId: '111-0000001-0000001', asin: 'B0CASE001', units: 12, orderTotal: 275.88, purchaseDate: '2026-05-07T10:00:00.000Z' },
      { amazonOrderId: '111-0000002-0000002', asin: 'B0CABLE002', units: 20, orderTotal: 259.8, purchaseDate: '2026-05-07T11:00:00.000Z' },
    ],
    inventory: [
      { sku: 'CASE-001', fulfillableQuantity: 54, inboundWorkingQuantity: 0, reservedQuantity: 3 },
      { sku: 'CABLE-002', fulfillableQuantity: 480, inboundWorkingQuantity: 300, reservedQuantity: 11 },
    ],
    listings: {
      'CASE-001': { sku: 'CASE-001', title: 'Shockproof Phone Case for iPhone', price: 22.99, bulletCount: 3 },
    },
  },
  ads: {
    campaignMetrics: [
      { campaignId: 'camp-case-growth', asin: 'B0CASE001', spend: 390, sales: 1800, acos: 0.216, clicks: 260, orders: 78 },
      { campaignId: 'camp-lamp-mature', asin: 'B0LAMP003', spend: 430, sales: 460, acos: 0.935, clicks: 48, orders: 0 },
    ],
    searchTerms: [
      { campaignId: 'camp-case-growth', query: 'phone case', impressions: 2000, clicks: 260, orders: 78 },
      { campaignId: 'camp-lamp-mature', query: 'desk lamp', impressions: 1800, clicks: 48, orders: 0 },
    ],
  },
  keepa: {
    productHistory: [
      { asin: 'B0CASE001', price: 22.99, buyBoxPrice: 22.99, salesRank: 8420, observedAt: '2026-05-07T00:00:00.000Z' },
      { asin: 'B0CASE001', price: 20.99, buyBoxPrice: 20.99, salesRank: 7900, observedAt: '2026-05-08T00:00:00.000Z' },
    ],
    buyBox: { asin: 'B0CASE001', sellerId: 'A-MOCK-SELLER', price: 20.99, isAmazon: false },
  },
  sellersprite: {
    keywordResearch: [
      { keyword: 'phone case', searchVolume: 45000, competition: 0.72, suggestedBid: 1.2 },
      { keyword: 'shockproof case', searchVolume: 8200, competition: 0.41, suggestedBid: 0.92 },
    ],
    marketTrends: [
      { keyword: 'phone case', trend30d: 0.08, seasonality: 'stable' },
    ],
  },
  helium10: {
    keywordResearch: [
      { keyword: 'usb c cable', searchVolume: 38000, magnetIqScore: 610, competingProducts: 14000 },
      { keyword: 'fast charging cable', searchVolume: 14500, magnetIqScore: 540, competingProducts: 8500 },
    ],
    listingKeywords: [
      { asin: 'B0CABLE002', keyword: 'usb c cable', rank: 12 },
      { asin: 'B0CABLE002', keyword: 'fast charging cable', rank: 19 },
    ],
  },
  llm: {
    completions: {
      listing_audit: 'Deterministic mock LLM: improve clarity, quantify warranty, and keep claims evidence-backed.',
      ad_summary: 'Deterministic mock LLM: reduce waste on no-order terms and protect proven exact campaigns.',
    },
  },
  notification: {
    templates: [
      { id: 'profit-alert', channel: 'email', subject: 'Mock profit alert' },
      { id: 'stockout-alert', channel: 'wecom', subject: 'Mock stockout alert' },
    ],
  },
  billing: {
    subscription: { tenantId: 'tenant-demo', plan: 'growth', status: 'sandbox_active', renewalDate: '2026-06-01' },
    usage: { aiDecisions: 42, thirdPartyCalls: 9, writeActionsBlocked: 4 },
  },
});
