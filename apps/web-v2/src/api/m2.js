// m2.js — M2 利润 / 库存 / 采购 / 重定价 / 多维度财务模块 API 客户端
// 风格参考：m1.js / ads.js / lx.js
// 所有调用走 http (Bearer + X-Store-Id 自动注入)，端点 /api/v1/store/m2/*
import { http } from './client';

const BASE = '/api/v1/store/m2';

function unwrap(r) {
  return r.data?.items ?? r.data ?? [];
}
function raw(r) {
  return r.data;
}

// ============================================================================
// 1. profitApi — 利润总览 / SKU 利润 / 订单利润 / 现金流 (10 endpoints)
// ============================================================================
export const profitApi = {
  overview: (range = '30d') =>
    http.get(`${BASE}/profit/overview`, { params: { range } }).then(raw),
  recompute: (body = {}) => http.post(`${BASE}/profit/recompute`, body).then(raw),
  skus: (params = {}) => http.get(`${BASE}/profit/skus`, { params }).then(raw),
  waterfall: (sku, range = '30d') =>
    http.get(`${BASE}/profit/skus/${encodeURIComponent(sku)}/waterfall`, { params: { range } }).then(raw),
  orders: (params = {}) => http.get(`${BASE}/orders`, { params }).then(raw),
  orderDetail: (orderId) =>
    http.get(`${BASE}/orders/${encodeURIComponent(orderId)}/profit`).then(raw),
  cashflow: (days = 90) =>
    http.get(`${BASE}/cashflow/timeline`, { params: { days } }).then(raw),
  cashflowAlerts: () => http.get(`${BASE}/cashflow/alerts`).then(raw),
  createCashflowEvent: (body) =>
    http.post(`${BASE}/cashflow/events`, body).then(raw),
};

// ============================================================================
// 2. leaksApi — 利润漏点 (4 endpoints)
// ============================================================================
export const leaksApi = {
  list: (params = {}) => http.get(`${BASE}/profit/leaks`, { params }).then(raw),
  startFix: (id) => http.post(`${BASE}/leaks/${id}/start-fix`).then(raw),
  markFixed: (id, body) => http.post(`${BASE}/leaks/${id}/mark-fixed`, body).then(raw),
  ignore: (id, body) => http.post(`${BASE}/leaks/${id}/ignore`, body).then(raw),
};

// ============================================================================
// 3. scenariosApi — 情景模拟 (3 endpoints)
// ============================================================================
export const scenariosApi = {
  preview: (body) => http.post(`${BASE}/scenarios/preview`, body).then(raw),
  save: (body) => http.post(`${BASE}/scenarios`, body).then(raw),
  list: (params = {}) => http.get(`${BASE}/scenarios`, { params }).then(raw),
};

// ============================================================================
// 4. reorderApi — 补货建议 (3 endpoints)
// ============================================================================
export const reorderApi = {
  list: (params = {}) =>
    http.get(`${BASE}/inventory/reorder`, { params }).then(raw),
  createPO: (id, body) =>
    http.post(`${BASE}/inventory/reorder/${id}/create-po`, body).then(raw),
  dismiss: (id, body = {}) =>
    http.post(`${BASE}/inventory/reorder/${id}/dismiss`, body).then(raw),
};

// ============================================================================
// 5. slowMovingApi — 滞销决策 (2 endpoints)
// ============================================================================
export const slowMovingApi = {
  list: (params = {}) =>
    http.get(`${BASE}/inventory/slow-moving`, { params }).then(raw),
  // M2-P0-05: 预览价与执行价同源
  preview: (id, body = {}) =>
    http.post(`${BASE}/inventory/slow-moving/${id}/preview`, body).then(raw),
  execute: (id, body) =>
    http.post(`${BASE}/inventory/slow-moving/${id}/execute`, body).then(raw),
};

// ============================================================================
// 6. transfersApi — 跨仓调拨 (3 endpoints)
// ============================================================================
export const transfersApi = {
  list: (params = {}) =>
    http.get(`${BASE}/inventory/transfers`, { params }).then(raw),
  approve: (id) =>
    http.post(`${BASE}/inventory/transfers/${id}/approve`).then(raw),
  cancel: (id) =>
    http.post(`${BASE}/inventory/transfers/${id}/cancel`).then(raw),
  // M2-P1-05: 在途 -> 已收货
  receive: (id) =>
    http.post(`${BASE}/inventory/transfers/${id}/receive`).then(raw),
};

// ============================================================================
// 7. poApi — 采购单全生命周期 (6 endpoints)
// ============================================================================
export const poApi = {
  list: (params = {}) =>
    http.get(`${BASE}/purchase-orders`, { params }).then(raw),
  detail: (id) => http.get(`${BASE}/purchase-orders/${id}`).then(raw),
  create: (body) => http.post(`${BASE}/purchase-orders`, body).then(raw),
  update: (id, body) => http.put(`${BASE}/purchase-orders/${id}`, body).then(raw),
  transition: (id, body) =>
    http.post(`${BASE}/purchase-orders/${id}/transition`, body).then(raw),
  payment: (id, body) =>
    http.post(`${BASE}/purchase-orders/${id}/payment`, body).then(raw),
};

// ============================================================================
// 8. suppliersApi — 供应商 (5 endpoints)
// ============================================================================
export const suppliersApi = {
  list: (params = {}) => http.get(`${BASE}/suppliers`, { params }).then(raw),
  detail: (id) => http.get(`${BASE}/suppliers/${id}`).then(raw),
  create: (body) => http.post(`${BASE}/suppliers`, body).then(raw),
  update: (id, body) => http.put(`${BASE}/suppliers/${id}`, body).then(raw),
  remove: (id) => http.delete(`${BASE}/suppliers/${id}`).then(raw),
};

// ============================================================================
// 9. repricingApi — 重定价 (4 endpoints)
// 注：无 detail(GET /repricing/:id) —— 后端未注册该路由，list 已内联 scenarios。
// ============================================================================
export const repricingApi = {
  list: (params = {}) => http.get(`${BASE}/repricing`, { params }).then(raw),
  trigger: (body) => http.post(`${BASE}/repricing/trigger`, body).then(raw),
  apply: (id, body) => http.post(`${BASE}/repricing/${id}/apply`, body).then(raw),
  // M2-P2-06: 拒绝建议
  reject: (id, body = {}) => http.post(`${BASE}/repricing/${id}/reject`, body).then(raw),
};

// ============================================================================
// 10. fxApi — 汇率 (3 endpoints)
// ============================================================================
export const fxApi = {
  exposures: () => http.get(`${BASE}/fx/exposures`).then(raw),
  rates: (params = { base: 'USD', quote: 'CNY', days: 30 }) =>
    http.get(`${BASE}/fx/rates`, { params }).then(raw),
  sensitivity: () => http.get(`${BASE}/fx/sensitivity`).then(raw),
};

// ============================================================================
// 11. paymentChannelsApi — 跨境支付通道 (4 endpoints)
// ============================================================================
export const paymentChannelsApi = {
  list: (params = {}) =>
    http.get(`${BASE}/payment-channels`, { params }).then(raw),
  create: (body) => http.post(`${BASE}/payment-channels`, body).then(raw),
  update: (id, body) =>
    http.put(`${BASE}/payment-channels/${id}`, body).then(raw),
  remove: (id) => http.delete(`${BASE}/payment-channels/${id}`).then(raw),
};

// ============================================================================
// 12. taxApi — 税务 (3 endpoints)
// ============================================================================
export const taxApi = {
  summary: () => http.get(`${BASE}/tax/summary`).then(raw),
  records: (params = {}) => http.get(`${BASE}/tax/records`, { params }).then(raw),
  file: (id, body) => http.post(`${BASE}/tax/records/${id}/file`, body).then(raw),
};

// ============================================================================
// 13. ltvApi — LTV (1 endpoint)
// ============================================================================
export const ltvApi = {
  list: (params = {}) => http.get(`${BASE}/ltv/skus`, { params }).then(raw),
};

// ============================================================================
// 14. alertsApi — 自定义告警 (6 endpoints)
// ============================================================================
export const alertsApi = {
  rules: {
    list: (params = {}) => http.get(`${BASE}/alerts/rules`, { params }).then(raw),
    create: (body) => http.post(`${BASE}/alerts/rules`, body).then(raw),
    update: (id, body) => http.put(`${BASE}/alerts/rules/${id}`, body).then(raw),
    remove: (id) => http.delete(`${BASE}/alerts/rules/${id}`).then(raw),
  },
  events: {
    list: (params = {}) => http.get(`${BASE}/alerts/events`, { params }).then(raw),
    // M2-P3-01: 单条 ack 支持可选 ackBy
    ack: (id, body = {}) => http.post(`${BASE}/alerts/events/${id}/ack`, body).then(raw),
    // M2-P3-01: 批量确认
    ackBatch: (ids, ackBy) => http.post(`${BASE}/alerts/events/ack-batch`, { ids, ackBy }).then(raw),
  },
  // M2-P0-07: 立即测试规则 / 扫描
  scan: (body = {}) => http.post(`${BASE}/alerts/scan`, body).then(raw),
};

// ============================================================================
// 15. dimensionsApi — 多维度归集 (2 endpoints)
// ============================================================================
export const dimensionsApi = {
  aggregate: (params = { by: 'brand' }) =>
    http.get(`${BASE}/dimensions`, { params }).then(raw),
  update: (id, body) => http.put(`${BASE}/dimensions/${id}`, body).then(raw),
};

// ============================================================================
// 16. inventoryLinkApi — 库存联动 (4 endpoints)
// ============================================================================
export const inventoryLinkApi = {
  config: () => http.get(`${BASE}/inventory-link/config`).then(raw),
  saveConfig: (body) => http.put(`${BASE}/inventory-link/config`, body).then(raw),
  events: (params = {}) =>
    http.get(`${BASE}/inventory-link/events`, { params }).then(raw),
  execute: (id) =>
    http.post(`${BASE}/inventory-link/events/${id}/execute`).then(raw),
};

// 默认导出聚合，方便按需引入
export default {
  profitApi,
  leaksApi,
  scenariosApi,
  reorderApi,
  slowMovingApi,
  transfersApi,
  poApi,
  suppliersApi,
  repricingApi,
  fxApi,
  paymentChannelsApi,
  taxApi,
  ltvApi,
  alertsApi,
  dimensionsApi,
  inventoryLinkApi,
};

// 简单辅助：unwrap exposed in case callers want lists from { items: [...] } envelope
export { unwrap };
