// m4.js — M4 监控/评价/申诉/恢复/跟卖/侵权/竞品/通知 API 客户端
// 风格参考：m1.js / ads-strategies.js / lx.js
// 所有调用走 http (Bearer + X-Store-Id 自动注入)，端点 /api/v1/store/m4/*
import { http } from './client';
// M4-P3-02: canonical list-envelope unwrappers live in a dependency-free module so they
// are unit-testable in plain node and shared as the single source of truth.
import { unwrapList, unwrapItems, unwrapSub } from './m4-unwrap.js';

const BASE = '/api/v1/store/m4';

export { unwrapList, unwrapItems, unwrapSub };

function unwrapFull(r) {
  return r.data ?? {};
}

// ===== 0. dailyReportsApi — M4 每日监控日报 BFF =====
export const dailyReportsApi = {
  get: (params = {}) => http.get(`${BASE}/reports/daily`, { params }).then((r) => r.data),
};

// ===== 1. anomaliesApi — 异常事件 =====
export const anomaliesApi = {
  list: (params = {}) => http.get(`${BASE}/anomalies`, { params }).then(unwrapList),
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
  // M4-P2-03: default range aligned to backend default '7d' (was 'today').
  board: (range = '7d') => http.get(`${BASE}/sla/board`, { params: { range } }).then((r) => r.data),
  events: (anomalyId) => http.get(`${BASE}/sla/events`, { params: { anomalyId } }).then(unwrapSub),
};

// ===== 3. resolutionApi — 处置案例 =====
export const resolutionApi = {
  list: (params = {}) => http.get(`${BASE}/cases`, { params }).then(unwrapItems),
  get: (id) => http.get(`${BASE}/cases/${id}`).then((r) => r.data),
  create: (body) => http.post(`${BASE}/cases`, body).then((r) => r.data),
  update: (id, patch) => http.put(`${BASE}/cases/${id}`, patch).then((r) => r.data),
  recommend: (anomalyId) => http.get(`${BASE}/cases/recommend`, { params: { anomalyId } }).then(unwrapSub),
};

// ===== 4. postmortemsApi — 复盘报告 =====
export const postmortemsApi = {
  list: (params = {}) => http.get(`${BASE}/postmortems`, { params }).then(unwrapItems),
  get: (id) => http.get(`${BASE}/postmortems/${id}`).then((r) => r.data),
  generate: (body) => http.post(`${BASE}/postmortems/generate`, body).then((r) => r.data),
  update: (id, patch) => http.put(`${BASE}/postmortems/${id}`, patch).then((r) => r.data),
};

// ===== 5. hijackingApi — 跟卖处置 =====
export const hijackingApi = {
  list: (params = {}) => http.get(`${BASE}/hijacking`, { params }).then(unwrapItems),
  scan: (body = {}) => http.post(`${BASE}/hijacking/scan`, body).then((r) => r.data),
  startTestBuy: (id, body = {}) => http.post(`${BASE}/hijacking/${id}/start-test-buy`, body).then((r) => r.data),
  uploadProof: (id, body) => http.post(`${BASE}/hijacking/${id}/upload-proof`, body).then((r) => r.data),
  submitAppeal: (id, body) => http.post(`${BASE}/hijacking/${id}/submit-appeal`, body).then((r) => r.data),
  // Confirming/closing a hijacking case can pause ads for the ASIN (M4 -> Ads linked
  // write). The client NEVER implies a real store write: it defaults to a dry-run and
  // never sets requiresRealStoreWrite. The server alone decides if a real write runs.
  close: (id, body = {}) =>
    http.post(`${BASE}/hijacking/${id}/close`, { dryRun: true, requiresRealStoreWrite: false, ...body })
      .then((r) => r.data),
};

// ===== 6. infringementApi — 侵权告警 =====
export const infringementApi = {
  list: (params = {}) => http.get(`${BASE}/infringement`, { params }).then(unwrapItems),
  create: (body) => http.post(`${BASE}/infringement`, body).then((r) => r.data),
  draft: (id, body) => http.post(`${BASE}/infringement/${id}/draft`, body).then((r) => r.data),
  submit: (id, body = {}) => http.post(`${BASE}/infringement/${id}/submit`, body).then((r) => r.data),
  resolve: (id, body) => http.post(`${BASE}/infringement/${id}/resolve`, body).then((r) => r.data),
};

// ===== 7. reviewsApi — Review 中心（含 clusters + trends 子命名空间） =====
export const reviewsApi = {
  list: (params = {}) => http.get(`${BASE}/reviews`, { params }).then(unwrapList),
  get: (id) => http.get(`${BASE}/reviews/${id}`).then((r) => r.data),
  sync: (body = {}) => http.post(`${BASE}/reviews/sync`, body).then((r) => r.data),
  markAppealable: (id, body) => http.post(`${BASE}/reviews/${id}/mark-appealable`, body).then((r) => r.data),
  pushM1: (id, body = {}) => http.post(`${BASE}/reviews/${id}/push-m1`, body).then((r) => r.data),
  // ----- 聚类子命名空间 -----
  listClusters: (params = {}) => http.get(`${BASE}/review-clusters`, { params }).then(unwrapItems),
  recomputeClusters: (body = {}) => http.post(`${BASE}/review-clusters/recompute`, body).then((r) => r.data),
  getCluster: (id) => http.get(`${BASE}/review-clusters/${id}`).then((r) => r.data),
  pushClusterM1: (id, body) => http.post(`${BASE}/review-clusters/${id}/push-m1`, body).then((r) => r.data),
  // ----- 趋势子命名空间 -----
  trends: {
    list: (params = {}) => http.get(`${BASE}/review-trends`, { params }).then(unwrapItems),
    snapshot: (body = {}) => http.post(`${BASE}/review-trends/snapshot`, body).then((r) => r.data),
  },
};

// ===== 8. appealsApi — 申诉中心 =====
export const appealsApi = {
  list: (params = {}) => http.get(`${BASE}/appeals`, { params }).then(unwrapList),
  draft: (body) => http.post(`${BASE}/appeals/draft`, body).then((r) => r.data),
  submit: (id, body = {}) => http.post(`${BASE}/appeals/${id}/submit`, body).then((r) => r.data),
  review: (id, body) => http.post(`${BASE}/appeals/${id}/review`, body).then((r) => r.data),
  retry: (id, body = {}) => http.post(`${BASE}/appeals/${id}/retry`, body).then((r) => r.data),
};

// ===== 9. recoveryApi — 挽回邮件 =====
export const recoveryApi = {
  list: (params = {}) => http.get(`${BASE}/recovery`, { params }).then(unwrapItems),
  draft: (body) => http.post(`${BASE}/recovery/draft`, body).then((r) => r.data),
  send: (id, body = {}) => http.post(`${BASE}/recovery/${id}/send`, body).then((r) => r.data),
  recordReply: (id, body) => http.post(`${BASE}/recovery/${id}/record-reply`, body).then((r) => r.data),
  nextRound: (id, body = {}) => http.post(`${BASE}/recovery/${id}/next-round`, body).then((r) => r.data),
};

// ===== 10. competitorsApi — 竞品 9 维监控 =====
export const competitorsApi = {
  list: (params = {}) => http.get(`${BASE}/competitors`, { params }).then(unwrapItems),
  add: (body) => http.post(`${BASE}/competitors`, body).then((r) => r.data),
  snapshot: (body = {}) => http.post(`${BASE}/competitors/snapshot`, body).then((r) => r.data),
  timeline: (asin, params = {}) => http.get(`${BASE}/competitors/${asin}/timeline`, { params }).then(unwrapSub),
  dismissChange: (asin, body) => http.post(`${BASE}/competitors/${asin}/dismiss-change`, body).then((r) => r.data),
};

// ===== 11. imageDiffsApi — 竞品图片差异 =====
export const imageDiffsApi = {
  list: (params = {}) => http.get(`${BASE}/image-diffs`, { params }).then(unwrapItems),
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
