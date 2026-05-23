// lx.js — 领星等价 (lx) 体系 API 客户端
import { http } from './client';

const BASE = '/api/v1/store/ads/lx';

function unwrap(r) {
  return r.data?.items ?? r.data ?? [];
}

export const portfoliosApi = {
  list: (params = {}) => http.get(`${BASE}/portfolios`, { params }).then(unwrap),
  get: (id) => http.get(`${BASE}/portfolios/${id}`).then((r) => r.data),
  create: (body) => http.post(`${BASE}/portfolios`, body).then((r) => r.data),
  update: (id, patch) => http.put(`${BASE}/portfolios/${id}`, patch).then((r) => r.data),
  remove: (id) => http.delete(`${BASE}/portfolios/${id}`).then((r) => r.data),
  toggle: (id, enabled) => http.post(`${BASE}/portfolios/${id}/toggle`, { enabled }).then((r) => r.data),
  setBudget: (id, budgetCap) => http.put(`${BASE}/portfolios/${id}/budget`, { budgetCap }).then((r) => r.data),
};

export const campaignsApi = {
  list: (params = {}) => http.get(`${BASE}/campaigns`, { params }).then(unwrap),
  get: (id) => http.get(`${BASE}/campaigns/${id}`).then((r) => r.data),
  create: (body) => http.post(`${BASE}/campaigns`, body).then((r) => r.data),
  update: (id, patch) => http.put(`${BASE}/campaigns/${id}`, patch).then((r) => r.data),
  remove: (id) => http.delete(`${BASE}/campaigns/${id}`).then((r) => r.data),
  toggle: (id, enabled) => http.post(`${BASE}/campaigns/${id}/toggle`, { enabled }).then((r) => r.data),
  setBudget: (id, dailyBudget) => http.put(`${BASE}/campaigns/${id}/budget`, { dailyBudget }).then((r) => r.data),
  setBidStrategy: (id, bidStrategy) => http.put(`${BASE}/campaigns/${id}/bid-strategy`, { bidStrategy }).then((r) => r.data),
  bulkCreateFromStrategy: (body) => http.post(`${BASE}/bulk-create-campaigns`, body).then((r) => r.data),
  // M3 fix #3: get strategies bound to this campaign
  getStrategies: (id) => http.get(`${BASE}/campaigns/${id}/strategies`).then(unwrap),
  // M3 fix #4: bulk operations
  copy: (id, body = {}) => http.post(`${BASE}/campaigns/${id}/copy`, body).then((r) => r.data),
  bulkBudget: (items) => http.post(`${BASE}/campaigns/bulk-budget`, { items }).then((r) => r.data),
  promoteToManual: (body) => http.post(`${BASE}/promote-to-manual`, body).then((r) => r.data),
  bulkImport: (payload) => {
    if (payload instanceof FormData) {
      // Let the browser set Content-Type with proper boundary by passing undefined
      return http.post(`${BASE}/bulk-import`, payload).then((r) => r.data);
    }
    return http.post(`${BASE}/bulk-import`, payload).then((r) => r.data);
  },
};

export const adGroupsApi = {
  list: (params = {}) => http.get(`${BASE}/ad-groups`, { params }).then(unwrap),
  get: (id) => http.get(`${BASE}/ad-groups/${id}`).then((r) => r.data),
  create: (body) => http.post(`${BASE}/ad-groups`, body).then((r) => r.data),
  update: (id, patch) => http.put(`${BASE}/ad-groups/${id}`, patch).then((r) => r.data),
  remove: (id) => http.delete(`${BASE}/ad-groups/${id}`).then((r) => r.data),
  setBid: (id, defaultBid) => http.put(`${BASE}/ad-groups/${id}/bid`, { defaultBid }).then((r) => r.data),
};

export const adsApi = {
  list: (params = {}) => http.get(`${BASE}/ads`, { params }).then(unwrap),
  create: (body) => http.post(`${BASE}/ads`, body).then((r) => r.data),
  update: (id, patch) => http.put(`${BASE}/ads/${id}`, patch).then((r) => r.data),
  remove: (id) => http.delete(`${BASE}/ads/${id}`).then((r) => r.data),
  toggle: (id, enabled) => http.post(`${BASE}/ads/${id}/toggle`, { enabled }).then((r) => r.data),
};

export const targetingsApi = {
  list: (params = {}) => http.get(`${BASE}/targetings`, { params }).then(unwrap),
  create: (body) => http.post(`${BASE}/targetings`, body).then((r) => r.data),
  update: (id, patch) => http.put(`${BASE}/targetings/${id}`, patch).then((r) => r.data),
  remove: (id) => http.delete(`${BASE}/targetings/${id}`).then((r) => r.data),
  setBid: (id, bid) => http.put(`${BASE}/targetings/${id}/bid`, { bid }).then((r) => r.data),
  toggle: (id, enabled) => http.post(`${BASE}/targetings/${id}/toggle`, { enabled }).then((r) => r.data),
  bulkBid: (body) => http.post(`${BASE}/targetings/bulk-bid`, body).then((r) => r.data),
};

export const negativesApi = {
  list: (params = {}) => http.get(`${BASE}/negatives`, { params }).then(unwrap),
  create: (body) => http.post(`${BASE}/negatives`, body).then((r) => r.data),
  remove: (id) => http.delete(`${BASE}/negatives/${id}`).then((r) => r.data),
};

export const userSearchTermsApi = {
  list: (params = {}) => http.get(`${BASE}/user-search-terms`, { params }).then(unwrap),
  promote: (body) => http.post(`${BASE}/user-search-terms/promote`, body).then((r) => r.data),
  negate: (body) => http.post(`${BASE}/user-search-terms/negate`, body).then((r) => r.data),
};

export const opLogApi = {
  list: (params = {}) => http.get(`${BASE}/op-log`, { params }).then(unwrap),
};

export const dailyApi = {
  list: (params = {}) => http.get(`${BASE}/daily`, { params }).then(unwrap),
};

export const kwGrabbingApi = {
  list: (params = {}) => http.get(`${BASE}/kw-grabbing`, { params }).then(unwrap),
  create: (body) => http.post(`${BASE}/kw-grabbing`, body).then((r) => r.data),
  update: (id, patch) => http.put(`${BASE}/kw-grabbing/${id}`, patch).then((r) => r.data),
  remove: (id) => http.delete(`${BASE}/kw-grabbing/${id}`).then((r) => r.data),
  applyBid: (id) => http.post(`${BASE}/kw-grabbing/${id}/apply-bid`).then((r) => r.data),
};

export const placementsApi = {
  list: (params = {}) => http.get(`${BASE}/placements`, { params }).then(unwrap),
  update: (id, patch) => http.put(`${BASE}/placements/${id}`, patch).then((r) => r.data),
};

export const amcApi = {
  list: (params = {}) => http.get(`${BASE}/amc-audiences`, { params }).then(unwrap),
  create: (body) => http.post(`${BASE}/amc-audiences`, body).then((r) => r.data),
  remove: (id) => http.delete(`${BASE}/amc-audiences/${id}`).then((r) => r.data),
};
