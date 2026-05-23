import {
  createRateLimit,
  hasRequiredCredentials,
  missingCredentialsResult,
  providerModes,
  providerReadResult,
  realWriteBlockedResult,
} from './contracts.mjs';
import { providerFixtures } from './fixtures.mjs';

const required = Object.freeze({
  'amazon-sp-api': ['lwaClientId', 'lwaClientSecret', 'refreshToken', 'roleArn'],
  'amazon-ads-api': ['clientId', 'clientSecret', 'refreshToken', 'profileId'],
  keepa: ['apiKey'],
  sellersprite: ['apiKey'],
  helium10: ['apiKey'],
  llm: ['apiKey', 'model'],
  notification: ['webhookUrl'],
  billing: ['secretKey'],
});

function guardedRead(provider, operation, dataset, data, { mode, credentials, confidence, rateLimit, source, upstreamIds } = {}) {
  if (mode === providerModes.real && !hasRequiredCredentials(credentials, required[provider])) {
    return missingCredentialsResult(provider, operation, required[provider]);
  }
  return providerReadResult(provider, operation, data, {
    mode,
    dataset,
    confidence,
    rateLimit,
    source,
    upstreamIds,
  });
}

export function createAmazonSpApiProvider(options = {}) {
  const mode = options.mode || providerModes.mock;
  const credentials = options.credentials || {};
  return {
    name: 'amazon-sp-api',
    mode,
    capabilities: ['catalog:read', 'orders:read', 'inventory:read', 'listings:read', 'listings:write-blocked'],
    requiredCredentials: required['amazon-sp-api'],
    async listCatalogItems() {
      return guardedRead('amazon-sp-api', 'listCatalogItems', 'catalogItems', providerFixtures.spapi.catalogItems, {
        mode, credentials, confidence: 0.86, rateLimit: createRateLimit({ limit: 30, remaining: 29, resetSeconds: 60 }),
      });
    },
    async getOrders() {
      return guardedRead('amazon-sp-api', 'getOrders', 'orders', providerFixtures.spapi.orders, { mode, credentials, confidence: 0.84 });
    },
    async getInventory() {
      return guardedRead('amazon-sp-api', 'getInventory', 'inventory', providerFixtures.spapi.inventory, { mode, credentials, confidence: 0.88 });
    },
    async getListing(sku) {
      return guardedRead('amazon-sp-api', 'getListing', 'listings', providerFixtures.spapi.listings[sku] || null, { mode, credentials, confidence: 0.82, upstreamIds: [sku].filter(Boolean) });
    },
    async patchListing(payload = {}) {
      return realWriteBlockedResult('amazon-sp-api', 'patchListing', payload, { mode, upstreamIds: [payload.sku].filter(Boolean) });
    },
  };
}

export function createAmazonAdsApiProvider(options = {}) {
  const mode = options.mode || providerModes.mock;
  const credentials = options.credentials || {};
  return {
    name: 'amazon-ads-api',
    mode,
    capabilities: ['campaigns:read', 'reports:read', 'campaigns:write-blocked'],
    requiredCredentials: required['amazon-ads-api'],
    async getCampaignMetrics() {
      return guardedRead('amazon-ads-api', 'getCampaignMetrics', 'campaignMetrics', providerFixtures.ads.campaignMetrics, {
        mode, credentials, confidence: 0.8, rateLimit: createRateLimit({ limit: 10, remaining: 8, resetSeconds: 1, retryAfterSeconds: 0 }),
      });
    },
    async getSearchTermReport() {
      return guardedRead('amazon-ads-api', 'getSearchTermReport', 'searchTerms', providerFixtures.ads.searchTerms, { mode, credentials, confidence: 0.78 });
    },
    async updateCampaignBudget(payload = {}) {
      return realWriteBlockedResult('amazon-ads-api', 'updateCampaignBudget', payload, { mode, upstreamIds: [payload.campaignId].filter(Boolean) });
    },
    async addNegativeKeyword(payload = {}) {
      return realWriteBlockedResult('amazon-ads-api', 'addNegativeKeyword', payload, { mode, upstreamIds: [payload.campaignId, payload.keyword].filter(Boolean) });
    },
  };
}

export function createKeepaProvider(options = {}) {
  const mode = options.mode || providerModes.mock;
  const credentials = options.credentials || {};
  return {
    name: 'keepa',
    mode,
    capabilities: ['product-history:read', 'buy-box:read'],
    requiredCredentials: required.keepa,
    async getProductHistory(asin = 'B0CASE001') {
      return guardedRead('keepa', 'getProductHistory', 'productHistory', providerFixtures.keepa.productHistory.filter((item) => item.asin === asin), {
        mode, credentials, confidence: 0.76, rateLimit: createRateLimit({ limit: 5, remaining: 4, resetSeconds: 60, backoffMs: 500 }), upstreamIds: [asin],
      });
    },
    async getBuyBox(asin = 'B0CASE001') {
      return guardedRead('keepa', 'getBuyBox', 'buyBox', { ...providerFixtures.keepa.buyBox, asin }, { mode, credentials, confidence: 0.74, upstreamIds: [asin] });
    },
  };
}

export function createSellerSpriteProvider(options = {}) {
  const mode = options.mode || providerModes.mock;
  const credentials = options.credentials || {};
  return {
    name: 'sellersprite',
    mode,
    capabilities: ['keywords:read', 'market-trends:read'],
    requiredCredentials: required.sellersprite,
    async getKeywordResearch() {
      return guardedRead('sellersprite', 'getKeywordResearch', 'keywordResearch', providerFixtures.sellersprite.keywordResearch, { mode, credentials, confidence: 0.72 });
    },
    async getMarketTrends() {
      return guardedRead('sellersprite', 'getMarketTrends', 'marketTrends', providerFixtures.sellersprite.marketTrends, { mode, credentials, confidence: 0.7 });
    },
  };
}

export function createHelium10Provider(options = {}) {
  const mode = options.mode || providerModes.mock;
  const credentials = options.credentials || {};
  return {
    name: 'helium10',
    mode,
    capabilities: ['keywords:read', 'listing-keywords:read'],
    requiredCredentials: required.helium10,
    async getKeywordResearch() {
      return guardedRead('helium10', 'getKeywordResearch', 'keywordResearch', providerFixtures.helium10.keywordResearch, { mode, credentials, confidence: 0.72 });
    },
    async getListingKeywords(asin = 'B0CABLE002') {
      return guardedRead('helium10', 'getListingKeywords', 'listingKeywords', providerFixtures.helium10.listingKeywords.filter((item) => item.asin === asin), { mode, credentials, confidence: 0.73, upstreamIds: [asin] });
    },
  };
}

export function createLlmProvider(options = {}) {
  const mode = options.mode || providerModes.mock;
  const credentials = options.credentials || {};
  return {
    name: 'llm',
    mode,
    capabilities: ['complete:read', 'listing-draft:read'],
    requiredCredentials: required.llm,
    async complete({ task = 'listing_audit' } = {}) {
      const data = { task, message: providerFixtures.llm.completions[task] || providerFixtures.llm.completions.listing_audit };
      return guardedRead('llm', 'complete', 'completions', data, { mode, credentials, confidence: 0.64, upstreamIds: [task] });
    },
    async rewriteListing(payload = {}) {
      const data = { sku: payload.sku, draft: 'Mock rewrite only; publishing remains blocked through SP-API patchListing.' };
      return guardedRead('llm', 'rewriteListing', 'listingDrafts', data, { mode, credentials, confidence: 0.61, upstreamIds: [payload.sku].filter(Boolean) });
    },
  };
}

export function createNotificationProvider(options = {}) {
  const mode = options.mode || providerModes.mock;
  const credentials = options.credentials || {};
  return {
    name: 'notification',
    mode,
    capabilities: ['templates:read', 'email:write-blocked', 'wecom:write-blocked'],
    requiredCredentials: required.notification,
    async getTemplates() {
      return guardedRead('notification', 'getTemplates', 'templates', providerFixtures.notification.templates, { mode, credentials, confidence: 0.9 });
    },
    async sendEmail(payload = {}) {
      return realWriteBlockedResult('notification', 'sendEmail', payload, { mode, upstreamIds: [payload.templateId].filter(Boolean) });
    },
    async sendWeCom(payload = {}) {
      return realWriteBlockedResult('notification', 'sendWeCom', payload, { mode, upstreamIds: [payload.templateId].filter(Boolean) });
    },
  };
}

export function createBillingProvider(options = {}) {
  const mode = options.mode || providerModes.mock;
  const credentials = options.credentials || {};
  return {
    name: 'billing',
    mode,
    capabilities: ['subscription:read', 'usage:read', 'checkout:write-blocked'],
    requiredCredentials: required.billing,
    async getSubscription() {
      return guardedRead('billing', 'getSubscription', 'subscription', providerFixtures.billing.subscription, { mode, credentials, confidence: 0.92 });
    },
    async getUsage() {
      return guardedRead('billing', 'getUsage', 'usage', providerFixtures.billing.usage, { mode, credentials, confidence: 0.9 });
    },
    async createCheckoutSession(payload = {}) {
      return realWriteBlockedResult('billing', 'createCheckoutSession', payload, { mode, upstreamIds: [payload.tenantId, payload.plan].filter(Boolean) });
    },
  };
}

export function createProviderContracts(options = {}) {
  return {
    spapi: createAmazonSpApiProvider(options.spapi || options),
    ads: createAmazonAdsApiProvider(options.ads || options),
    keepa: createKeepaProvider(options.keepa || options),
    sellersprite: createSellerSpriteProvider(options.sellersprite || options),
    helium10: createHelium10Provider(options.helium10 || options),
    llm: createLlmProvider(options.llm || options),
    notification: createNotificationProvider(options.notification || options),
    billing: createBillingProvider(options.billing || options),
  };
}

export { providerModes } from './contracts.mjs';
export { providerFixtures } from './fixtures.mjs';
