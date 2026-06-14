import { http } from './client';

const BASE = '/api/v1/integrations';

const data = (r) => r.data;

export const amazonIntegrationsApi = {
  status: () => http.get(`${BASE}/status`).then(data),
  oauthConfig: () => http.get(`${BASE}/oauth/config`).then(data),
  startOAuth: (provider, body = {}) => http.post(`${BASE}/oauth/${provider}/start`, body).then(data),
  diagnostics: (params = {}) => http.get(`${BASE}/diagnostics`, { params }).then(data),
  liveDiagnostics: (body = { provider: 'all', liveProbe: true, apiProbe: true }) =>
    http.post(`${BASE}/diagnostics`, body).then(data),
  saveSpApiCredentials: (body) => http.post(`${BASE}/credentials/spapi`, body).then(data),
  saveAdsCredentials: (body) => http.post(`${BASE}/credentials/ads`, body).then(data),
  saveAdsProfile: (profileId) => http.post(`${BASE}/credentials/ads/profile`, { profileId }).then(data),
  // AUTH-06: revoke / unbind an authorization. provider is 'spapi' | 'ads'.
  revoke: (provider) => http.delete(`${BASE}/credentials/${provider}`).then(data),
  syncOrders: (body = {}) => http.post(`${BASE}/spapi/sync/orders`, body).then(data),
  syncSettlement: (body = {}) => http.post(`${BASE}/spapi/sync/settlement`, body).then(data),
  syncInventory: (body = {}) => http.post(`${BASE}/spapi/sync/inventory`, body).then(data),
  syncCatalog: (body = {}) => http.post(`${BASE}/spapi/sync/catalog`, body).then(data),
  syncAds: (body = {}) => http.post(`${BASE}/ads/sync/all`, body).then(data),
  syncAll: (body = {}) => http.post(`${BASE}/sync/all`, body).then(data),
};

export default amazonIntegrationsApi;
