import { http } from './client';

export const auditApi = {
  mockExecute: (action) => http.post('/api/v1/audit/mock-execute', action).then((r) => r.data),
  // B-2 / N6-w11: 工作台「忽略」决策卡 -> 后端落一条 DASHBOARD_CARD_DISMISS 审计行。
  // payload: { resourceId, reason }. operator/dismissedAt 由服务端鉴权与时钟产出。
  dismiss: (payload) => http.post('/api/v1/audit/dismiss', payload).then((r) => r.data),
};
