// ads-strategies.js — M3 策略库 API 客户端
import { http } from './client';

const BASE = '/api/v1/store/ads/strategies';

export const strategiesApi = {
  list: (params = {}) => http.get(BASE, { params }).then((r) => r.data.items ?? r.data ?? []),
  get: (id) => http.get(`${BASE}/${id}`).then((r) => r.data),
  create: (body) => http.post(BASE, body).then((r) => r.data),
  update: (id, patch) => http.put(`${BASE}/${id}`, patch).then((r) => r.data),
  remove: (id) => http.delete(`${BASE}/${id}`).then((r) => r.data),
  toggle: (id, enabled) => http.post(`${BASE}/${id}/toggle`, { enabled }).then((r) => r.data),
  bind: (id, campaignIds) => http.post(`${BASE}/${id}/bind`, { campaignIds }).then((r) => r.data),
  // Get the bindings (campaigns) for a strategy
  getBindings: (id) => http.get(`${BASE}/${id}`).then((r) => r.data?.bindings ?? []),
};
