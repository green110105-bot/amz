// sqp.js — SQP (Search Query Performance) API 客户端
import { http } from './client';

const BASE = '/api/v1/store/ads/sqp';

function unwrap(r) {
  return r.data?.items ?? r.data ?? [];
}

export const sqpApi = {
  list: (params = {}) => http.get(BASE, { params }).then(unwrap),
  takeAction: (body) => http.post(`${BASE}/take-action`, body).then((r) => r.data),
};
