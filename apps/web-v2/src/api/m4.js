// m4.js — M4 监控/评价/申诉/恢复/跟卖/侵权/竞品/通知 API 客户端
// 风格参考：m1.js / ads-strategies.js / lx.js
// 所有调用走 http (Bearer + X-Store-Id 自动注入)，端点 /api/v1/store/m4/*
import { http } from './client';

const BASE = '/api/v1/store/m4';

function unwrap(r) {
  return r.data?.items ?? r.data ?? [];
}
function unwrapFull(r) {
  return r.data ?? {};
}

// ===== 1. anomaliesApi — 异常事件 =====
export const anomaliesApi = {
  list: (params = {}) => http.get(`${BASE}/anomalies`, { params }).then(unwrapFull),
  get: (id) => http.get(`${BASE}/anomalies/${id}`).then((r) => r.data),
  create: (body) => http.post(`${BASE}/anomalies`, body).then((r) => r.data),
  assign: (id, body) => http.post(`${BASE}/anomalies/${id}/assign`, body).then((r) => r.data),
  acknowledge: (id) => http.post(`${BASE}/anomalies/${id}/acknowledge`, {}).then((r) => r.data),
  resolve: (id, body = {}) => http.post(`${BASE}/anomalies/${id}/resolve`, body).then((r) => r.data),
  dismiss: (id, body) => http.post(`${BASE}/anomalies/${id}/dismiss`, body).then((r) => r.data),
  escalate: (id, body) => http.post(`${BASE}/anomalies/${id}/escalate`, body).then((r) => r.data),
};

// ===== 2. slaApi — SLA 看板 =====
export const slaApi = {
  board: (range = 'today') => http.get(`${BASE}/sla/board`, { params: { range } }).then((r) => r.data),
  events: (anomalyId) => http.get(`${BASE}/sla/events`, { params: { anomalyId } }).then(unwrap),
};

// ===== 3. resolutionApi — 处置案例 =====
export const resolutionApi = {
  list: (params = {}) => http.get(`${BASE}/cases`, { params }).then(unwrap),
  get: (id) => http.get(`${BASE}/cases/${id}`).then((r) => r.data),
  create: (body) => http.post(`${BASE}/cases`, body).then((r) => r.data),
  update: (id, patch) => http.put(`${BASE}/cases/${id}`, patch).then((r) => r.data),
  recommend: (anomalyId) => http.get(`${BASE}/cases/recommend`, { params: { anomalyId } }).then(unwrap),
};

// ===== 4. postmortemsApi — 复盘报告 =====
export const postmortemsApi = {
  list: (params = {}) => http.get(`${BASE}/postmortems`, { params }).then(unwrap),
  get: (id) => http.get(`${BASE}/postmortems/${id}`).then((r) => r.data),
  generate: (body) => http.post(`${BASE}/postmortems/generate`, body).then((r) => r.data),
  update: (id, patch) => http.put(`${BASE}/postmortems/${id}`, patch).then((r) => r.data),
};

// ===== 5. hijackingApi — 跟卖处置 =====
export const hijackingApi = {
  list: (params = {}) => http.get(`${BASE}/hijacking`, { params }).then(unwrap),
  scan: (body = {}) => http.post(`${BASE}/hijacking/scan`, body).then((r) => r.data),
  startTestBuy: (id) => http.post(`${BASE}/hijacking/${id}/start-test-buy`, {}).then((r) => r.data),
  uploadProof: (id, body) => http.post(`${BASE}/hijacking/${id}/upload-proof`, body).then((r) => r.data),
  submitAppeal: (id, body) => http.post(`${BASE}/hijacking/${id}/submit-appeal`, body).then((r) => r.data),
  close: (id, body) => http.post(`${BASE}/hijacking/${id}/close`, body).then((r) => r.data),
};

// ===== 6. infringementApi — 侵权告警 =====
export const infringementApi = {
  list: (params = {}) => http.get(`${BASE}/infringement`, { params }).then(unwrap),
  create: (body) => http.post(`${BASE}/infringement`, body).then((r) => r.data),
  draft: (id, body) => http.post(`${BASE}/infringement/${id}/draft`, body).then((r) => r.data),
  submit: (id, body = {}) => http.post(`${BASE}/infringement/${id}/submit`, body).then((r) => r.data),
  resolve: (id, body) => http.post(`${BASE}/infringement/${id}/resolve`, body).then((r) => r.data),
};

// ===== 7. reviewsApi — Review 中心（含 clusters + trends 子命名空间） =====
export const reviewsApi = {
  list: (params = {}) => http.get(`${BASE}/reviews`, { params }).then(unwrapFull),
  get: (id) => http.get(`${BASE}/reviews/${id}`).then((r) => r.data),
  sync: (body = {}) => http.post(`${BASE}/reviews/sync`, body).then((r) => r.data),
  markAppealable: (id, body) => http.post(`${BASE}/reviews/${id}/mark-appealable`, body).then((r) => r.data),
  pushM1: (id, body = {}) => http.post(`${BASE}/reviews/${id}/push-m1`, body).then((r) => r.data),
  // ----- 聚类子命名空间 -----
  listClusters: (params = {}) => http.get(`${BASE}/review-clusters`, { params }).then(unwrap),
  recomputeClusters: (body = {}) => http.post(`${BASE}/review-clusters/recompute`, body).then((r) => r.data),
  getCluster: (id) => http.get(`${BASE}/review-clusters/${id}`).then((r) => r.data),
  pushClusterM1: (id, body) => http.post(`${BASE}/review-clusters/${id}/push-m1`, body).then((r) => r.data),
  // ----- 趋势子命名空间 -----
  trends: {
    list: (params = {}) => http.get(`${BASE}/review-trends`, { params }).then(unwrap),
    snapshot: (body = {}) => http.post(`${BASE}/review-trends/snapshot`, body).then((r) => r.data),
  },
};

// ===== 8. appealsApi — 申诉中心 =====
export const appealsApi = {
  list: (params = {}) => http.get(`${BASE}/appeals`, { params }).then(unwrapFull),
  draft: (body) => http.post(`${BASE}/appeals/draft`, body).then((r) => r.data),
  submit: (id) => http.post(`${BASE}/appeals/${id}/submit`, {}).then((r) => r.data),
  review: (id, body) => http.post(`${BASE}/appeals/${id}/review`, body).then((r) => r.data),
  retry: (id, body = {}) => http.post(`${BASE}/appeals/${id}/retry`, body).then((r) => r.data),
};

// ===== 9. recoveryApi — 挽回邮件 =====
export const recoveryApi = {
  list: (params = {}) => http.get(`${BASE}/recovery`, { params }).then(unwrap),
  draft: (body) => http.post(`${BASE}/recovery/draft`, body).then((r) => r.data),
  send: (id) => http.post(`${BASE}/recovery/${id}/send`, {}).then((r) => r.data),
  recordReply: (id, body) => http.post(`${BASE}/recovery/${id}/record-reply`, body).then((r) => r.data),
  nextRound: (id, body = {}) => http.post(`${BASE}/recovery/${id}/next-round`, body).then((r) => r.data),
};

// ===== 10. competitorsApi — 竞品 9 维监控 =====
export const competitorsApi = {
  list: (params = {}) => http.get(`${BASE}/competitors`, { params }).then(unwrap),
  add: (body) => http.post(`${BASE}/competitors`, body).then((r) => r.data),
  snapshot: (body = {}) => http.post(`${BASE}/competitors/snapshot`, body).then((r) => r.data),
  timeline: (asin, params = {}) => http.get(`${BASE}/competitors/${asin}/timeline`, { params }).then(unwrap),
  dismissChange: (asin, body) => http.post(`${BASE}/competitors/${asin}/dismiss-change`, body).then((r) => r.data),
};

// ===== 11. imageDiffsApi — 竞品图片差异 =====
export const imageDiffsApi = {
  list: (params = {}) => http.get(`${BASE}/image-diffs`, { params }).then(unwrap),
  scan: (body = {}) => http.post(`${BASE}/image-diffs/scan`, body).then((r) => r.data),
  pushM1: (id, body = {}) => http.post(`${BASE}/image-diffs/${id}/push-m1`, body).then((r) => r.data),
};

// ===== 12. brandDefenseApi — 品牌词防御（独立命名空间） =====
export const brandDefenseApi = {
  get: () => http.get(`${BASE}/brand-defense`).then((r) => r.data),
  enableLayer: (layerCode, body = {}) => http.post(`${BASE}/brand-defense/${layerCode}/enable`, body).then((r) => r.data),
  disableLayer: (layerCode, body) => http.post(`${BASE}/brand-defense/${layerCode}/disable`, body).then((r) => r.data),
  counter: (body) => http.post(`${BASE}/brand-defense/counter`, body).then((r) => r.data),
};

// ===== 13. notificationsApi — 应用内通知（铃铛总线用） =====
export const notificationsApi = {
  list: (params = {}) => http.get(`${BASE}/notifications`, { params }).then(unwrapFull),
  post: (body) => http.post(`${BASE}/notifications`, body).then((r) => r.data),
  markRead: (id) => http.post(`${BASE}/notifications/${id}/read`, {}).then((r) => r.data),
  markAllRead: () => http.post(`${BASE}/notifications/read-all`, {}).then((r) => r.data),
  unreadCount: () => http.get(`${BASE}/notifications/unread-count`).then((r) => r.data),
};
