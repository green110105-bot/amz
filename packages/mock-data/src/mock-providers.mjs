import { ProviderRegistry, providerResult, realWriteBlocked } from '../../domain/src/providers.mjs';
import { sampleStore } from './sample-store.mjs';

export function createMockProviderRegistry(store = sampleStore) {
  return new ProviderRegistry({
    spapi: {
      async getProducts() { return providerResult('spapi', store.products); },
      async getOrders() { return providerResult('spapi', store.orders); },
      async getInventory() { return providerResult('spapi', store.inventory); },
      async getListing(productId) { return providerResult('spapi', store.listings?.[productId] || null); },
      async patchListing() { return realWriteBlocked('spapi', 'patchListing'); },
    },
    ads: {
      async getAdMetrics() { return providerResult('ads', store.adMetrics); },
      async updateCampaign() { return realWriteBlocked('ads', 'updateCampaign'); },
      async addNegativeKeyword() { return realWriteBlocked('ads', 'addNegativeKeyword'); },
    },
    thirdParty: {
      async getCompetitors() { return providerResult('thirdParty', store.competitors); },
      async getReviews(productId) { return providerResult('thirdParty', (store.reviews || []).filter((review) => review.productId === productId)); },
      async getCompetitorSnapshots() { return providerResult('thirdParty', store.competitorSnapshots || { previous: [], current: [] }); },
    },
    llm: {
      async complete({ task }) { return providerResult('llm', { task, message: 'Deterministic mock response; no external LLM was called.' }, { confidence: 0.55 }); },
    },
    notification: {
      async send(message) { return providerResult('notification', { accepted: true, channel: 'in_app_mock', message }); },
    },
    billing: {
      async getSubscription() { return providerResult('billing', { plan: store.tenant.plan, status: 'mock_active' }); },
    },
  });
}
