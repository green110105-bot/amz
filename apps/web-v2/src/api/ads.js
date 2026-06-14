import { http } from './client';

// Ads real writes ALWAYS go through ad_action_queue with dryRun defaulting ON.
// The frontend never implies a real store write: it sends dryRun:true and never sets
// requiresRealStoreWrite. The server alone decides whether a real write is permitted
// (REAL_WRITES_ENABLED + real provider mode + live-action-executor gate).
export const adsApi = {
  suggestions: () => http.get('/api/v1/ads/suggestions').then((r) => r.data),

  // Pause a campaign: enqueue a dry-run action (no real write implied from client).
  pauseCampaign: (id, body = {}) =>
    http.post(`/api/v1/store/ads/action-queue/${id}/pause`, { dryRun: true, ...body })
      .then((r) => r.data),

  // Change a campaign budget: enqueue a dry-run action (no real write implied).
  changeBudget: (id, body = {}) =>
    http.post(`/api/v1/store/ads/action-queue/${id}/budget`, { dryRun: true, ...body })
      .then((r) => r.data),
};
