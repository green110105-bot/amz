// m1.js — M1 商品 Listing 优化模块 API 客户端
// 风格：参考 ads-strategies.js / lx.js
// 所有调用走 http (Bearer + X-Store-Id 自动注入)，端点 /api/v1/store/m1/*
import { http } from './client';

const BASE = '/api/v1/store/m1';

function unwrap(r) {
  return r.data?.items ?? r.data ?? [];
}

// ===== Flow 1 — Targets (5) =====
export const targetsApi = {
  list: (params = {}) => http.get(`${BASE}/targets`, { params }).then(unwrap),
  get: (id) => http.get(`${BASE}/targets/${id}`).then((r) => r.data),
  create: (body) => http.post(`${BASE}/targets`, body).then((r) => r.data),
  update: (id, patch) => http.put(`${BASE}/targets/${id}`, patch).then((r) => r.data),
  remove: (id) => http.delete(`${BASE}/targets/${id}`).then((r) => r.data),
};

// ===== Flow 2 — Research (3) =====
export const researchApi = {
  trigger: (body) => http.post(`${BASE}/research/trigger`, body).then((r) => r.data),
  get: (targetId) => http.get(`${BASE}/research/${targetId}`).then((r) => r.data),
  clearCache: (targetId) => http.delete(`${BASE}/research/${targetId}/cache`).then((r) => r.data),
};

// ===== Flow 2 — Scores (2) =====
export const scoresApi = {
  trigger: (body) => http.post(`${BASE}/scores/trigger`, body).then((r) => r.data),
  get: (targetId) => http.get(`${BASE}/scores/${targetId}`).then((r) => r.data),
};

// ===== Flow 2 — Runs (4) =====
export const runsApi = {
  create: (body) => http.post(`${BASE}/runs`, body).then((r) => r.data),
  list: (params = {}) => http.get(`${BASE}/runs`, { params }).then(unwrap),
  get: (id) => http.get(`${BASE}/runs/${id}`).then((r) => r.data),
  rewriteField: (id, body) => http.post(`${BASE}/runs/${id}/rewrite-field`, body).then((r) => r.data),
};

// ===== Flow 2 — Versions (6) =====
export const versionsApi = {
  list: (params = {}) => http.get(`${BASE}/versions`, { params }).then(unwrap),
  get: (id) => http.get(`${BASE}/versions/${id}`).then((r) => r.data),
  pin: (id, pinned) => http.post(`${BASE}/versions/${id}/pin`, { pinned }).then((r) => r.data),
  remove: (id) => http.delete(`${BASE}/versions/${id}`).then((r) => r.data),
  diff: (versionAId, versionBId) =>
    http.post(`${BASE}/versions/diff`, { versionAId, versionBId }).then((r) => r.data),
  combinedPick: (targetId, fieldPicks) =>
    http.post(`${BASE}/versions/combined-pick`, { targetId, fieldPicks }).then((r) => r.data),
};

// ===== Flow 2 — Images (3) =====
export const imagesApi = {
  generate: (body) => http.post(`${BASE}/images/generate`, body).then((r) => r.data),
  list: (params = {}) => http.get(`${BASE}/images`, { params }).then(unwrap),
  regenerate: (id, body = {}) =>
    http.post(`${BASE}/images/${id}/regenerate`, body).then((r) => r.data),
};

// ===== Flow 3 — A/B (7) =====
export const abApi = {
  create: (body) => http.post(`${BASE}/ab`, body).then((r) => r.data),
  list: (params = {}) => http.get(`${BASE}/ab`, { params }).then(unwrap),
  get: (id) => http.get(`${BASE}/ab/${id}`).then((r) => r.data),
  start: (id) => http.post(`${BASE}/ab/${id}/start`).then((r) => r.data),
  abort: (id) => http.post(`${BASE}/ab/${id}/abort`).then((r) => r.data),
  metrics: (id) => http.get(`${BASE}/ab/${id}/metrics`).then((r) => r.data),
  adoptWinner: (id) => http.post(`${BASE}/ab/${id}/adopt-winner`).then((r) => r.data),
};
