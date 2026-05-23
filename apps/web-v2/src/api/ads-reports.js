// ads-reports.js — 搜索词 / Campaign 报表 API 客户端
import { http } from './client';

const BASE = '/api/v1/store/ads/reports';

function unwrap(r) {
  return r.data?.items ?? r.data ?? [];
}

export const searchTermsReportApi = {
  list: (params = {}) => http.get(`${BASE}/search-terms`, { params }).then(unwrap),
  promote: (body) => http.post(`${BASE}/search-terms/promote`, body).then((r) => r.data),
  negate: (body) => http.post(`${BASE}/search-terms/negate`, body).then((r) => r.data),
};

export const campaignReportApi = {
  list: (params = {}) => http.get(`${BASE}/campaigns`, { params }).then(unwrap),
};
