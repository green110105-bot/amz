// ads-timeline.js — M3 AI 建议流 + 外部更改 API 客户端
import { http } from './client';

const SUG_BASE = '/api/v1/store/ads/suggestions';
const MC_BASE = '/api/v1/store/ads/manual-changes';

export const suggestionsApi = {
  list: (params = {}) => http.get(SUG_BASE, { params }).then((r) => r.data.items ?? r.data ?? []),
  get: (id) => http.get(`${SUG_BASE}/${id}`).then((r) => r.data),
  accept: (id, payload = {}) =>
    http.post(`${SUG_BASE}/${id}/accept`, payload).then((r) => r.data),
  reject: (id, payload = {}) =>
    http.post(`${SUG_BASE}/${id}/reject`, payload).then((r) => r.data),
  revert: (id, payload = {}) =>
    http.post(`${SUG_BASE}/${id}/revert`, payload).then((r) => r.data),
};

export const manualChangesApi = {
  list: (params = {}) => http.get(MC_BASE, { params }).then((r) => r.data.items ?? r.data ?? []),
  applyAlternative: (id, payload = {}) =>
    http.post(`${MC_BASE}/${id}/apply-alternative`, payload).then((r) => r.data),
  ignore: (id, payload = {}) =>
    http.post(`${MC_BASE}/${id}/ignore`, payload).then((r) => r.data),
};
